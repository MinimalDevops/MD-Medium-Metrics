// IMPORTANT: Before running this script, start Chrome with:
// /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/ChromeDebug"
// Make sure you are logged in to Medium in that Chrome window.

const puppeteer = require("puppeteer");
const { Client } = require("pg");
require("dotenv").config();

// Create PostgreSQL client using Supabase host and credentials
const client = new Client({
  host: process.env.SUPABASE_HOST,
  database: process.env.SUPABASE_DB,
  user: process.env.SUPABASE_USER,
  password: process.env.SUPABASE_PASSWORD,
  port: process.env.SUPABASE_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

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
  // Connect to PostgreSQL database
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL database');
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }

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
    var toNumber = value => {
      const cleanValue = value.toString().trim().replace(/,/g, '').replace(/[^0-9\.K]/g, '');
      if (cleanValue.includes("K")) {
        return parseFloat(cleanValue.replace("K", "")) * 1000;
      }
      const numericValue = parseFloat(cleanValue);
      return isNaN(numericValue) ? 0 : numericValue;
    }
    
    // Updated approach based on current Medium DOM structure
    console.log("=== EXTRACTING MEDIUM STATS WITH UPDATED SELECTORS ===");
    
    // Method 1: Find the table structure
    const table = document.querySelector('table');
    console.log(`Table found: ${!!table}`);
    
    let totalViews = 0;
    let totalReads = 0;
    let totalEarning = 0;
    
    if (table) {
      // Extract data from table rows
      const rows = table.querySelectorAll('tr');
      console.log(`Found ${rows.length} table rows`);
      
      // Skip header row and process data rows
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        
        if (cells.length >= 3) {
          // Based on debug analysis, find all spans with numbers in this row
          const numberSpans = row.querySelectorAll('span.bf.b.md.mf.bk');
          console.log(`Row ${i}: Found ${numberSpans.length} number spans`);
          
          // Process each span with a number
          numberSpans.forEach((span, spanIndex) => {
            const text = span.innerText || span.textContent || '';
            const num = toNumber(text);
            
            if (num > 0) {
              // Determine if this is views or reads based on position in the row
              const parentCell = span.closest('td');
              if (parentCell) {
                const cellIndex = Array.from(parentCell.parentElement.children).indexOf(parentCell);
                
                // Based on debug analysis, the structure appears to be:
                // Column 0: Story title
                // Column 1: Views (first number span)
                // Column 2: Reads (second number span)
                // Column 3: Earnings (if exists)
                
                if (spanIndex === 0) { // First number span in row = Views
                  totalViews += num;
                  console.log(`Row ${i}: Views = ${num} (span ${spanIndex}, cell ${cellIndex})`);
                } else if (spanIndex === 1) { // Second number span in row = Reads
                  totalReads += num;
                  console.log(`Row ${i}: Reads = ${num} (span ${spanIndex}, cell ${cellIndex})`);
                }
              }
            }
          });
          
          // Extract earnings from the entire row text
          const rowText = row.innerText || row.textContent || '';
          const earningMatches = rowText.match(/\$(\d+\.?\d*)/g);
          if (earningMatches) {
            earningMatches.forEach(match => {
              const amount = parseFloat(match.replace('$', ''));
              if (amount > 0 && amount < 100) {
                totalEarning += amount;
                console.log(`Row ${i}: Earnings = $${amount}`);
              }
            });
          }
        }
      }
    } else {
      // Fallback: Look for all spans with the specific class
      console.log("Table not found, using fallback selectors");
      
      const allSpans = document.querySelectorAll('span.bf.b.md.mf.bk');
      console.log(`Found ${allSpans.length} spans with numbers`);
      
      // Group spans by their parent rows
      const spanGroups = [];
      let currentGroup = [];
      let lastParentRow = null;
      
      allSpans.forEach(span => {
        const parentRow = span.closest('tr');
        if (parentRow !== lastParentRow) {
          if (currentGroup.length > 0) {
            spanGroups.push(currentGroup);
          }
          currentGroup = [span];
          lastParentRow = parentRow;
        } else {
          currentGroup.push(span);
        }
      });
      
      if (currentGroup.length > 0) {
        spanGroups.push(currentGroup);
      }
      
      console.log(`Grouped into ${spanGroups.length} rows`);
      
      // Process each group (row)
      spanGroups.forEach((group, groupIndex) => {
        group.forEach((span, spanIndex) => {
          const text = span.innerText || span.textContent || '';
          const num = toNumber(text);
          
          if (num > 0) {
            if (spanIndex === 0) { // First span = Views
              totalViews += num;
              console.log(`Group ${groupIndex}: Views = ${num} (span ${spanIndex})`);
            } else if (spanIndex === 1) { // Second span = Reads
              totalReads += num;
              console.log(`Group ${groupIndex}: Reads = ${num} (span ${spanIndex})`);
            }
          }
        });
      });
      
      // Look for earnings
      const allElements = document.querySelectorAll('*');
      const earningElements = Array.from(allElements).filter(el => {
        const text = el.innerText || el.textContent || '';
        return /\$\d+\.?\d*/.test(text) && text.length < 20;
      });
      
      const dollarAmounts = earningElements.map(el => {
        const text = el.innerText || el.textContent || '';
        const match = text.match(/\$(\d+\.?\d*)/);
        const amount = match ? parseFloat(match[1]) : 0;
        return amount > 0 && amount < 100 ? amount : 0;
      });
      
      totalEarning = dollarAmounts.reduce((sum, amount) => sum + amount, 0);
      console.log(`Found dollar amounts: ${dollarAmounts.filter(a => a > 0).join(', ')}`);
    }
    
    console.log(`Final totals - Views: ${totalViews}, Reads: ${totalReads}, Earnings: ${totalEarning}`);
    
    return {
      totalViews: Math.round(totalViews),
      totalReads: Math.round(totalReads),
      totalEarning: totalEarning,
      debug: {
        tableFound: !!table,
        tableRows: table ? table.querySelectorAll('tr').length : 0,
        viewSpansFound: document.querySelectorAll('span.bf.b.md.mf.bk').length
      }
    };
  });
  await page.close();

  // --- Update database: keep only one row with latest stats ---
  // Delete all rows
  try {
    await client.query('DELETE FROM medium_metrics WHERE id != 0');
    console.log('Cleared existing metrics data');
  } catch (error) {
    console.error("Database delete error:", error);
  }

  // Insert the new row
  try {
    const { rows } = await client.query(
      'INSERT INTO medium_metrics (total_views, total_reads, total_earning) VALUES ($1, $2, $3) RETURNING *',
      [result.totalViews, result.totalReads, result.totalEarning]
    );
    console.log("Inserted into database:", rows);
  } catch (error) {
    console.error("Database insert error:", error);
  }

  // Always close the Chrome browser process
  await browser.close();
  
  // Close database connection
  await client.end();
  console.log('Database connection closed');
})();
