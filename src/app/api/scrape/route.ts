import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser, Page } from 'puppeteer';

interface BusinessData {
    name: string | null;
    rating: number | string | null;
    address: string | null;
    phone?: string | null;
    website: string | null;
}

async function scrapeGoogleMaps(
    city: string,
    businessType: string,
    limit: number,
    minRating: number,
    timeLimit: number
): Promise<BusinessData[]> {
    const browser: Browser = await puppeteer.launch({ headless: true });
    const page: Page = await browser.newPage();

    await page.setViewport({
        width: 1920,
        height: 1080,
    });

    await page.setRequestInterception(true);
    page.on('request', (request) => {
        request.continue();
    });

    const results: BusinessData[] = [];
    const startTime: number = Date.now();
    const scrapedNames = new Set<string>();

    try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(businessType)}+in+${encodeURIComponent(city)}`, {
            waitUntil: 'networkidle2',
        });

        await page.waitForSelector('[role="feed"]', { timeout: 5000 }).catch(() => console.log('Feed not found, continuing...'));

        while (results.length < limit && Date.now() - startTime < timeLimit * 60 * 1000) {
            const elements = await page.$$('[role="feed"] > div [jsaction^="mouseover:pane."]');

            for (const element of elements) {
                if (results.length >= limit || Date.now() - startTime >= timeLimit * 60 * 1000) break;

                try {
                    const businessName = await element.evaluate(el => {
                        const nameElement = el.querySelector('.fontHeadlineSmall');
                        return nameElement ? nameElement.textContent?.trim() : null;
                    });
                    console.log(businessName, " << scrapedNames : ", scrapedNames)
                    if (businessName && !scrapedNames.has(businessName)) {
                        scrapedNames.add(businessName);

                        const nameElement = await element.$('.fontHeadlineSmall');
                        if (nameElement) {
                            await nameElement.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' }));
                            await nameElement.click();
                        }

                        const businessDataDiv = await page.waitForSelector('.bJzME.Hu9e2e.tTVLSc .m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde', { timeout: 10000 }).catch(() => console.log('Detail container not found, continuing...'));

                        if (businessDataDiv) {
                            const businessData = await page.evaluate(() => {
                                const safeGetText = (selector: string): string | null => {
                                    const element = document.querySelector(selector);
                                    return element ? element.textContent!.trim() : null;
                                };

                                const safeGetHref = (selector: string): string | null => {
                                    const element = document.querySelector(selector) as HTMLAnchorElement | null;
                                    return element ? element.href : null;
                                };

                                return {
                                    name: safeGetText('h1.DUwDvf.lfPIob'),
                                    rating: safeGetText('span[aria-label$="reviews"]'),
                                    address: safeGetText('button[data-tooltip="Copy address"] .Io6YTe.fontBodyMedium.kR99db.fdkmkc'),
                                    phone: (() => {
                                        const phoneElement = document.querySelector('[aria-label^="Phone:"]');
                                        return phoneElement ? phoneElement.getAttribute('aria-label')?.replace('Phone: ', '') : null;
                                    })(),
                                    website: safeGetHref('a[data-tooltip="Open website"]'),
                                };
                            });

                            if (businessData) {
                                results.push(businessData);
                            }

                            await page.evaluate(() => {
                                const closeBtn = document.querySelector('.bJzME.Hu9e2e.tTVLSc button[aria-label="Close"]') as HTMLElement | null;
                                if (closeBtn) {
                                    closeBtn.click();
                                }
                            });

                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                } catch (error) {
                    console.error('Error processing an element:', error);
                }
            }

            // Scroll to load more results
            await page.evaluate(() => {
                const feed = document.querySelector('[role="feed"]');
                if (feed) {
                    feed.scrollTop = feed.scrollHeight;
                }
            });

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await browser.close();
    }

    return results;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const searchParams = new URL(req.url).searchParams;
    const city = searchParams.get('city');
    const businessType = searchParams.get('businessType');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const minRating = parseFloat(searchParams.get('minRating') || '0');
    const timeLimit = parseInt(searchParams.get('timeLimit') || '5', 10);

    if (!city || !businessType) {
        return NextResponse.json({ error: 'City and business type are required' }, { status: 400 });
    }

    try {
        const data = await scrapeGoogleMaps(city, businessType, limit, minRating, timeLimit);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Scraping error:', error);
        return NextResponse.json({ error: 'An error occurred while scraping data' }, { status: 500 });
    }
}