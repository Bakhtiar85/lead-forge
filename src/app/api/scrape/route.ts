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

    // Adjusting the viewport size
    await page.setViewport({
        width: 1920, // Set the desired width here (1280px is a good desktop width)
        height: 1080, // Set the desired height here (800px is a good height for maps content)
    });

    await page.setRequestInterception(true);
    page.on('request', (request) => {
        // Block unnecessary requests like images, stylesheets, etc., for performance
        // if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
        //     request.abort();
        // } else {
            request.continue();
        // }
    });

    const results: BusinessData[] = [];
    const startTime: number = Date.now();

    try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(businessType)}+in+${encodeURIComponent(city)}`, { waitUntil: 'networkidle2', });

        await page.waitForSelector('[role="feed"]', { timeout: 5000 }).catch(() => console.log('Feed not found, continuing...'));

        // while (results.length < limit && Date.now() - startTime < timeLimit * 60 * 1000) {
        const elements = await page.$$('[role="feed"] > div [jsaction^="mouseover:pane."]');

        for (const element of elements) {
            if (results.length >= limit || Date.now() - startTime >= timeLimit * 60 * 1000) break;

            try {
                const isConnected = await page.evaluate((e) => e.isConnected, element);
                if (!isConnected) {
                    console.log('Element is detached, skipping...');
                    continue;
                }

                await element.evaluate((el) => el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' }));
                await element.click();
                const businessDataDiv = await page.waitForSelector('.bJzME.Hu9e2e.tTVLSc .m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde', { timeout: 10000 }).catch(() => console.log('Detail container not found, continuing...')); // wait for 10 seconds

                if (businessDataDiv) {
                    const businessData = await page.evaluate(() => {
                        // Helper function to safely get text from a specific selector within a given element
                        const safeGetText = (element: HTMLElement, selector: string): string | null => {
                            const childElement = element.querySelector(selector);
                            return childElement ? childElement.textContent!.trim() : null;
                        };

                        // Helper function to safely get href from a specific selector within a given element
                        const safeGetHref = (element: HTMLElement, selector: string): string | null => {
                            const childElement = element.querySelector(selector) as HTMLAnchorElement | null;
                            return childElement ? childElement.href : null;
                        };

                        // Get the main business details div
                        const businessDetailContainer = document.querySelector('.bJzME.Hu9e2e.tTVLSc .m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde') as HTMLElement | null;
                        if (!businessDetailContainer) {
                            return null; // If the div doesn't exist, return null
                        }

                        (businessDetailContainer as HTMLElement).style.backgroundColor = "yellow";

                        // Extract business details from within the container
                        const name = safeGetText(businessDetailContainer, 'h1.DUwDvf.lfPIob');
                        const rating = safeGetText(businessDetailContainer, 'span[aria-label$="reviews"]');
                        const address = safeGetText(businessDetailContainer, 'button[data-tooltip="Copy address"] .Io6YTe.fontBodyMedium.kR99db.fdkmkc');
                        const phoneElement = businessDetailContainer.querySelector('[aria-label^="Phone:"]');
                        const phone = phoneElement ? phoneElement.getAttribute('aria-label')?.replace('Phone: ', '') : null;
                        const website = safeGetHref(businessDetailContainer, 'a[data-tooltip="Open website"]');

                        // Debugging intermediate values
                        console.log("Extracted data:", {
                            name,
                            rating,
                            address,
                            phoneElement,
                            phone,
                            website
                        });

                        // Return the business details
                        return { name, rating, address, phone, website };
                    });


                    if (businessData) {
                        results.push(businessData);
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
        // } // while loop ends here

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
