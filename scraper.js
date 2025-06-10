// IMPORTANT: Before running this script, start Chrome with:
// /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/ChromeDebug"
// Make sure you are logged in to Medium in that Chrome window.

const puppeteer = require("puppeteer");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Scrolls to the bottom of the page, loading all content
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

(async () => {
  // Connect to the running Chrome instance
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9223',
    defaultViewport: null,
  });

  // --- Scrape total views, reads, and earnings from stats page ---
  const page = await browser.newPage();
  await page.goto("https://medium.com/me/stats?publishedAt=DESC", { waitUntil: "networkidle2" });
  await page.waitForSelector("body");
  await autoScroll(page);

  const result = await page.evaluate(() => {
    var totalTypes = { VIEWS: 3, READS: 4 };
    var toNumber = value => {
      const cleanValue = value.toString().trim().replace(/,/g, '').replace(/[^0-9\.K]/g, '');
      if (cleanValue.includes("K")) {
        return parseFloat(cleanValue.replace("K", "")) * 1000;
      }
      const numericValue = parseFloat(cleanValue);
      return isNaN(numericValue) ? 0 : numericValue;
    }
    var getTotal = tableColumn => {
      const elements = document.querySelectorAll(`td:nth-child(${tableColumn}) > a > div`);
      return [...elements]
        .map(k => {
          const value = k.innerText || k.textContent;
          return toNumber(value);
        })
        .filter(number => !isNaN(number) && number > 0)
        .reduce((a, b) => a + b, 0);
    }

    // Scrape earnings per blog post and sum them
    // Look for elements that contain the earnings value (e.g., $1.79)
    // This selector may need to be updated if Medium changes their UI
    const earningEls = Array.from(document.querySelectorAll('td:nth-child(5) > a > div'));
    let totalEarning = earningEls
      .map(el => {
        const text = el.innerText || el.textContent || '';
        const num = parseFloat(text.replace(/[$,]/g, ''));
        return isNaN(num) ? 0 : num;
      })
      .reduce((a, b) => a + b, 0);

    return {
      totalViews: Math.round(getTotal(totalTypes.VIEWS)),
      totalReads: Math.round(getTotal(totalTypes.READS)),
      totalEarning: totalEarning
    };
  });
  await page.close();

  // --- Update Supabase: keep only one row with latest stats ---
  // Delete all rows
  await supabase.from('medium_metrics').delete().neq('id', 0);

  // Insert the new row
  const { data, error } = await supabase
    .from('medium_metrics')
    .insert([
      { total_views: result.totalViews, total_reads: result.totalReads, total_earning: result.totalEarning }
    ])
    .select();

  if (error) {
    console.error("Supabase insert error:", error);
  } else {
    console.log("Inserted into Supabase:", data);
  }

  // Always close the Chrome browser process
  await browser.close();
})();
