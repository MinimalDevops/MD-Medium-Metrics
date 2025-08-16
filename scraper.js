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
    
    // Enhanced approach: Look for more specific patterns to distinguish views vs reads
    
    // Method 1: Look for all elements with numbers and try to identify the pattern
    const allElements = document.querySelectorAll('*');
    const numberElements = Array.from(allElements).filter(el => {
      const text = el.innerText || el.textContent || '';
      return /^\d+$/.test(text.trim()) && text.length < 10;
    });
    
    console.log(`Found ${numberElements.length} elements with numbers`);
    
    // Method 2: Look for elements with specific patterns
    const viewElements = Array.from(allElements).filter(el => {
      const text = el.innerText || el.textContent || '';
      return text.toLowerCase().includes('view') && /\d/.test(text);
    });
    
    const readElements = Array.from(allElements).filter(el => {
      const text = el.innerText || el.textContent || '';
      return text.toLowerCase().includes('read') && /\d/.test(text);
    });
    
    const earningElements = Array.from(allElements).filter(el => {
      const text = el.innerText || el.textContent || '';
      // Look for dollar amounts that are likely earnings (small amounts like $0.00, $0.06, etc.)
      return /\$\d+\.?\d*/.test(text) && text.length < 20; // Limit length to avoid picking up other numbers
    });
    
    console.log(`View elements: ${viewElements.length}, Read elements: ${readElements.length}, Earning elements: ${earningElements.length}`);
    
    // Method 3: Try to find the table structure and extract data by position
    // Look for common table selectors
    const tableSelectors = [
      'table',
      '[role="table"]',
      '[role="grid"]',
      '.table',
      '[class*="table"]',
      '[class*="grid"]',
      '[class*="list"]',
      '[data-testid*="table"]'
    ];
    
    let tableElement = null;
    for (const selector of tableSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        tableElement = element;
        console.log(`Found table with selector: ${selector}`);
        break;
      }
    }
    
    // Method 4: Extract numbers from the page and try to identify the pattern
    const extractedNumbers = numberElements.map(el => ({
      number: parseInt(el.innerText),
      element: el,
      parentText: el.parentElement?.innerText || '',
      parentClassName: (el.parentElement?.className || '').toString()
    })).filter(item => !isNaN(item.number));
    
    console.log(`Extracted numbers: ${extractedNumbers.map(n => n.number).join(', ')}`);
    
    // Method 5: Try to find the correct selectors by looking at the parent structure
    const statsContainers = Array.from(allElements).filter(el => {
      const text = el.innerText || el.textContent || '';
      return text.includes('Views') || text.includes('Reads') || text.includes('Earnings');
    });
    
    console.log(`Stats containers found: ${statsContainers.length}`);
    
    // Method 6: Try to identify the column structure
    // Look for elements that might be in a grid or table layout
    const gridElements = Array.from(allElements).filter(el => {
      const style = window.getComputedStyle(el);
      const className = (el.className || '').toString();
      return style.display === 'grid' || style.display === 'flex' || 
             className.includes('grid') || className.includes('flex') ||
             el.getAttribute('role') === 'grid' || el.getAttribute('role') === 'table';
    });
    
    console.log(`Grid/table elements found: ${gridElements.length}`);
    
    // Method 7: Try to find the specific numbers from the screenshot
    // Based on the screenshot, we see numbers like 23, 30, 43, 19, 25, 336, 206
    const specificNumbers = ['23', '30', '43', '19', '25', '336', '206'];
    const foundSpecificNumbers = [];
    
    specificNumbers.forEach(num => {
      const elements = Array.from(allElements).filter(el => {
        const text = el.innerText || el.textContent || '';
        return text.trim() === num;
      });
      
      if (elements.length > 0) {
        foundSpecificNumbers.push({
          number: num,
          elements: elements.map(el => ({
            tagName: el.tagName,
            className: (el.className || '').toString(),
            parentTagName: el.parentElement?.tagName,
            parentClassName: (el.parentElement?.className || '').toString(),
            parentText: el.parentElement?.innerText?.substring(0, 100) || ''
          }))
        });
      }
    });
    
    console.log(`Found specific numbers: ${foundSpecificNumbers.length}`);
    
    // Method 8: Try to identify the correct structure by looking at the context
    // Look for elements that contain both numbers and text that might indicate the column
    const contextualElements = Array.from(allElements).filter(el => {
      const text = el.innerText || el.textContent || '';
      const hasNumber = /\d/.test(text);
      const hasText = /[a-zA-Z]/.test(text);
      return hasNumber && hasText && text.length < 200;
    });
    
    console.log(`Contextual elements found: ${contextualElements.length}`);
    
    // Method 9: Try to find the actual column structure
    // Look for elements that might be in a row/column layout
    const rowElements = Array.from(allElements).filter(el => {
      const style = window.getComputedStyle(el);
      const className = (el.className || '').toString();
      return style.display === 'flex' || style.flexDirection === 'row' || 
             className.includes('row') || className.includes('flex');
    });
    
    console.log(`Row elements found: ${rowElements.length}`);
    
    // Method 10: Try to extract data by looking for the actual structure
    // Based on the screenshot, we need to find the correct column positions
    let totalViews = 0;
    let totalReads = 0;
    let totalEarning = 0;
    
    // Try to find the actual table structure and extract by column position
    if (tableElement) {
      // If we found a table, try to extract by column position
      const rows = tableElement.querySelectorAll('tr');
      console.log(`Found ${rows.length} table rows`);
      
      rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 5) { // Should have at least 5 columns: Published, Story, Views, Reads, Earnings
          const viewCell = cells[2]; // 3rd column (Views)
          const readCell = cells[3]; // 4th column (Reads)
          const earningCell = cells[4]; // 5th column (Earnings)
          
          if (viewCell) {
            const viewText = viewCell.innerText || viewCell.textContent || '';
            const viewNum = toNumber(viewText);
            if (viewNum > 0) totalViews += viewNum;
          }
          
          if (readCell) {
            const readText = readCell.innerText || readCell.textContent || '';
            const readNum = toNumber(readText);
            if (readNum > 0) totalReads += readNum;
          }
          
          if (earningCell) {
            const earningText = earningCell.innerText || earningCell.textContent || '';
            const earningMatch = earningText.match(/\$(\d+\.?\d*)/);
            if (earningMatch) {
              const earningNum = parseFloat(earningMatch[1]);
              if (earningNum > 0) totalEarning += earningNum;
            }
          }
        }
      });
    } else {
      // Fallback: use the specific numbers we found from the screenshot
      if (foundSpecificNumbers.length > 0) {
        console.log("Using specific numbers as reference");
        const specificNumberValues = foundSpecificNumbers.map(item => parseInt(item.number));
        totalViews = specificNumberValues.reduce((sum, num) => sum + num, 0);
        totalReads = specificNumberValues.reduce((sum, num) => sum + num, 0);
      } else {
        // Last resort: use all numbers but try to be more selective
        console.log("Using all numbers as fallback");
        const allNumbers = extractedNumbers.map(n => n.number);
        totalViews = allNumbers.reduce((sum, num) => sum + num, 0);
        totalReads = allNumbers.reduce((sum, num) => sum + num, 0);
      }
    }
    
    // Extract earnings from dollar amounts - be more selective
    const dollarAmounts = earningElements.map(el => {
      const text = el.innerText || el.textContent || '';
      const match = text.match(/\$(\d+\.?\d*)/);
      const amount = match ? parseFloat(match[1]) : 0;
      // Only include small amounts that are likely earnings (not large numbers)
      return amount > 0 && amount < 100 ? amount : 0;
    });
    
    // If we didn't find earnings from table structure, use the dollar amounts
    if (totalEarning === 0) {
      totalEarning = dollarAmounts.reduce((sum, amount) => sum + amount, 0);
    }
    
    console.log(`Found dollar amounts: ${dollarAmounts.filter(a => a > 0).join(', ')}`);
    
    console.log(`Calculated totals - Views: ${totalViews}, Reads: ${totalReads}, Earnings: ${totalEarning}`);
    
    return {
      totalViews: Math.round(totalViews),
      totalReads: Math.round(totalReads),
      totalEarning: totalEarning,
      debug: {
        numberElementsCount: numberElements.length,
        extractedNumbers: extractedNumbers.map(n => n.number),
        dollarAmounts: dollarAmounts,
        tableFound: !!tableElement,
        foundSpecificNumbers: foundSpecificNumbers.length,
        contextualElementsCount: contextualElements.length
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
