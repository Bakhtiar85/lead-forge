import { NextRequest } from 'next/server';
import puppeteer, { Browser, Page } from 'puppeteer';
import { businessDedupeKey, normalizeListTitle } from '@/lib/businessDedupe';
import { whatsAppMeHref } from '@/lib/whatsappPhone';

export interface BusinessData {
  name: string | null;
  rating: number | null;
  ratingLabel: string | null;
  address: string | null;
  phone?: string | null;
  website: string | null;
  email: string | null;
  /** https://wa.me/... when digits are valid for a chat link (not a registration check) */
  whatsappHref: string | null;
}

function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function* scrapeGoogleMaps(
  city: string,
  businessType: string,
  limit: number,
  minRating: number,
  timeLimitMinutes: number,
  signal: AbortSignal
): AsyncGenerator<BusinessData> {
  let browser: Browser | null = null;
  const resultsCount = { n: 0 };

  try {
    browser = await puppeteer.launch({ headless: true });
    const p: Page = await browser.newPage();

    await p.setViewport({ width: 1920, height: 1080 });

    await p.setRequestInterception(true);
    p.on('request', (request) => {
      const type = request.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        void request.abort();
      } else {
        void request.continue();
      }
    });

    const startTime = Date.now();
    const timeLimitMs = timeLimitMinutes * 60 * 1000;
    const scrapedListTitles = new Set<string>();
    const emittedKeys = new Set<string>();

    await p.goto(
      `https://www.google.com/maps/search/${encodeURIComponent(businessType)}+in+${encodeURIComponent(city)}`,
      { waitUntil: 'networkidle2' }
    );

    await p
      .waitForSelector('[role="feed"]', { timeout: 5000 })
      .catch(() => undefined);

    while (
      resultsCount.n < limit &&
      Date.now() - startTime < timeLimitMs &&
      !signal.aborted
    ) {
      const elements = await p.$$('[role="feed"] > div [jsaction^="mouseover:pane."]');

      for (const element of elements) {
        if (signal.aborted || resultsCount.n >= limit || Date.now() - startTime >= timeLimitMs) {
          break;
        }

        try {
          const businessName = await element.evaluate((el) => {
            const nameElement = el.querySelector('.fontHeadlineSmall');
            return nameElement ? nameElement.textContent?.trim() : null;
          });

          const listKey = businessName ? normalizeListTitle(businessName) : '';
          if (!businessName || scrapedListTitles.has(listKey)) {
            continue;
          }

          scrapedListTitles.add(listKey);

          const nameHandle = await element.$('.fontHeadlineSmall');
          if (nameHandle) {
            await nameHandle.evaluate((el) =>
              el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' })
            );
            await nameHandle.click();
          }

          const businessDataDiv = await p
            .waitForSelector(
              '.bJzME.Hu9e2e.tTVLSc .m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde',
              { timeout: 10000 }
            )
            .catch(() => null);

          if (businessDataDiv && !signal.aborted) {
            const raw = await p.evaluate(() => {
              const safeGetText = (selector: string): string | null => {
                const el = document.querySelector(selector);
                return el ? el.textContent!.trim() : null;
              };

              const safeGetHref = (selector: string): string | null => {
                const el = document.querySelector(selector) as HTMLAnchorElement | null;
                return el ? el.href : null;
              };

              const extractRating = (): { value: number | null; label: string | null } => {
                const inRange = (n: number) => n >= 1 && n <= 5;

                const fromAria = (label: string | null | undefined) => {
                  if (!label) return null;
                  const lower = label.toLowerCase();
                  if (!lower.includes('star')) return null;
                  const m = label.match(/(\d+(?:\.\d+)?)/);
                  if (!m) return null;
                  const v = parseFloat(m[1]);
                  return inRange(v) ? v : null;
                };

                const ariaEls = document.querySelectorAll('[aria-label]');
                for (let i = 0; i < ariaEls.length; i++) {
                  const el = ariaEls[i];
                  const label = el.getAttribute('aria-label');
                  if (!label) continue;
                  const v = fromAria(label);
                  if (v != null) {
                    return { value: v, label: label.trim() };
                  }
                }

                const nice = document.querySelector('div.F7nice');
                if (nice) {
                  const spans = nice.querySelectorAll('span');
                  for (let j = 0; j < spans.length; j++) {
                    const s = spans[j];
                    const t = s.textContent?.trim() ?? '';
                    if (/^[1-5](\.\d)?$/.test(t)) {
                      const v = parseFloat(t);
                      if (!Number.isNaN(v) && inRange(v)) {
                        return { value: v, label: t };
                      }
                    }
                  }
                }

                const legacy = safeGetText('span[aria-label$="reviews"]');
                if (legacy) {
                  const m = legacy.match(/(\d+(?:\.\d+)?)/);
                  if (m) {
                    const v = parseFloat(m[1]);
                    if (!Number.isNaN(v) && inRange(v)) {
                      return { value: v, label: legacy };
                    }
                  }
                }

                return { value: null, label: null };
              };

              const r = extractRating();

              return {
                name: safeGetText('h1.DUwDvf.lfPIob'),
                rating: r.value,
                ratingLabel: r.label,
                address: safeGetText(
                  'button[data-tooltip="Copy address"] .Io6YTe.fontBodyMedium.kR99db.fdkmkc'
                ),
                phone: (() => {
                  const phoneElement = document.querySelector('[aria-label^="Phone:"]');
                  return phoneElement
                    ? phoneElement.getAttribute('aria-label')?.replace(/^Phone:\s*/i, '') ?? null
                    : null;
                })(),
                website: safeGetHref('a[data-tooltip="Open website"]'),
                email: (() => {
                  const anchors = document.querySelectorAll('a[href^="mailto:"]');
                  for (let i = 0; i < anchors.length; i++) {
                    const href = anchors[i].getAttribute('href');
                    if (!href) continue;
                    const addr = decodeURIComponent(
                      href.replace(/^mailto:/i, '').split('?')[0]
                    ).trim();
                    if (addr.indexOf('@') > 0) return addr;
                  }
                  const copyEmailBtn = document.querySelector(
                    'button[data-tooltip="Copy email address"]'
                  );
                  if (copyEmailBtn) {
                    const inner = copyEmailBtn.querySelector('.Io6YTe');
                    const t = inner
                      ? inner.textContent?.trim()
                      : copyEmailBtn.textContent?.trim();
                    if (t && t.indexOf('@') > 0) return t;
                  }
                  const emailAria = document.querySelector(
                    '[aria-label^="Email:"], [aria-label^="email:"]'
                  );
                  if (emailAria) {
                    const lab = emailAria.getAttribute('aria-label') || '';
                    const m = lab.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
                    if (m) return m[0];
                  }
                  return null;
                })(),
              };
            });

            const ratingNum = raw.rating;
            const passesMin =
              minRating <= 0 ||
              ratingNum == null ||
              ratingNum >= minRating;

            const phoneTrimmed = String(raw.phone ?? '').trim();
            if (passesMin && raw.name && phoneTrimmed) {
              const row: BusinessData = {
                name: raw.name,
                rating: ratingNum,
                ratingLabel: raw.ratingLabel,
                address: raw.address,
                phone: raw.phone,
                website: raw.website,
                email: raw.email,
                whatsappHref: whatsAppMeHref(
                  raw.phone,
                  process.env.WHATSAPP_DEFAULT_CALLING_CODE ?? null
                ),
              };
              const dedupeKey = businessDedupeKey(row);
              if (!emittedKeys.has(dedupeKey)) {
                emittedKeys.add(dedupeKey);
                const detailKey = normalizeListTitle(raw.name);
                scrapedListTitles.add(detailKey);
                resultsCount.n += 1;
                yield row;
              }
            }

            await p.evaluate(() => {
              const closeBtn = document.querySelector(
                '.bJzME.Hu9e2e.tTVLSc button[aria-label="Close"]'
              ) as HTMLElement | null;
              closeBtn?.click();
            });

            try {
              await sleep(2000, signal);
            } catch {
              break;
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            break;
          }
          console.error('Error processing an element:', err);
        }
      }

      if (signal.aborted) break;

      await p.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) {
          feed.scrollTop = feed.scrollHeight;
        }
      });

      try {
        await sleep(2000, signal);
      } catch {
        break;
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    console.error('An error occurred:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const searchParams = new URL(req.url).searchParams;
  const city = searchParams.get('city');
  const businessType = searchParams.get('businessType');
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const minRating = parseFloat(searchParams.get('minRating') || '0');
  const timeLimit = parseInt(searchParams.get('timeLimit') || '5', 10);

  if (!city || !businessType) {
    return Response.json(
      { error: 'City and business type are required' },
      { status: 400 }
    );
  }

  const signal = req.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const item of scrapeGoogleMaps(
          city,
          businessType,
          limit,
          minRating,
          timeLimit,
          signal
        )) {
          if (signal.aborted) break;
          controller.enqueue(encoder.encode(`${JSON.stringify(item)}\n`));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Scrape failed';
        controller.enqueue(encoder.encode(`${JSON.stringify({ error: msg })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
