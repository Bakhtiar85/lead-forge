import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import {
  digitsForWhatsApp,
  inferWhatsAppFromWaPage,
  whatsAppMeHref,
} from '@/lib/whatsappPhone';

const DEFAULT_CC = process.env.WHATSAPP_DEFAULT_CALLING_CODE ?? null;

async function dismissCookieBanner(page: import('puppeteer').Page): Promise<void> {
  const selectors = [
    'button[aria-label="Accept"]',
    'button[aria-label="Agree"]',
    'button[data-testid="cookie-banner-accept"]',
  ];
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 400));
      return;
    }
  }
  await page
    .evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        const label = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase();
        if (
          /\baccept\b/.test(label) ||
          /\bagree\b/.test(label) ||
          label.includes('aceitar') ||
          label.includes('accepter')
        ) {
          b.click();
          return;
        }
      }
    })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 400));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phone =
    typeof body === 'object' && body !== null && 'phone' in body
      ? String((body as { phone: unknown }).phone ?? '')
      : '';

  const digits = digitsForWhatsApp(phone, DEFAULT_CC);
  const href = whatsAppMeHref(phone, DEFAULT_CC);

  if (!digits || !href) {
    return NextResponse.json(
      {
        error:
          'Could not build WhatsApp digits (need 8–15 digits, or 10 digits + WHATSAPP_DEFAULT_CALLING_CODE).',
      },
      { status: 400 }
    );
  }

  let browser: import('puppeteer').Browser | null = null;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await dismissCookieBanner(page);

    await new Promise((r) => setTimeout(r, 4500));

    let visibleText = await page.evaluate(() => document.body?.innerText ?? '');
    let html = await page.evaluate(() => document.documentElement?.innerHTML ?? '');

    let status = inferWhatsAppFromWaPage(visibleText, html);

    if (status === 'unknown') {
      await new Promise((r) => setTimeout(r, 3500));
      visibleText = await page.evaluate(() => document.body?.innerText ?? '');
      html = await page.evaluate(() => document.documentElement?.innerHTML ?? '');
      status = inferWhatsAppFromWaPage(visibleText, html);
    }

    return NextResponse.json({
      status,
      whatsappHref: href,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Check failed';
    return NextResponse.json(
      {
        status: 'unknown' as const,
        whatsappHref: href,
        error: msg,
      },
      { status: 200 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
