# Medium Metrics Scraper

This project scrapes your Medium stats (total views, reads, and earnings) using Puppeteer and saves them to a Supabase Postgres table. It is designed for personal use and can be visualized in Grafana.

Read the blog here -> [How to Automatically Track Your Medium Stats for Your Portfolio (No API Needed!)](https://minimaldevops.com/how-to-automatically-track-your-medium-stats-for-your-portfolio-no-api-needed-0cae10ed8796)

## Features
- Scrapes total views, reads, and earnings from your Medium stats page
- Uses your real Chrome session for authentication (no need to manage cookies)
- Saves the latest metrics to a Supabase table (always one row)
- Ready for Grafana dashboards (see example queries below)

## Prerequisites
- Node.js (v18+ recommended)
- Supabase account and project
- Google Chrome installed

## Local Setup

To use this project locally:

1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd medium-metrics
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **Create a `.env` file** with your Supabase credentials:
   ```sh
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Prepare your Chrome profile:**
   - See the "Use a Dedicated Chrome Profile (Recommended)" section below.

5. **Run the scraper:**
   ```sh
   ./run_medium_scraper.sh
   ```

## Use a Dedicated Chrome Profile (Recommended)

To keep your automation environment clean and avoid interfering with your main browser profile, use a dedicated Chrome user profile for Puppeteer automation.

### 🪄 Step-by-Step:

1. **Create a new Chrome user profile:**

```bash
mkdir -p ./chrome-profiles/automation
```

2. **Launch Chrome manually (once) using this profile:**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir=./chrome-profiles/automation
```

- Log in to the sites you need (e.g., Medium, GitHub, etc.) and check "Remember Me".
- Close Chrome when done.

## Usage

1. **Use the provided helper script to run the scraper:**

The included `run_medium_scraper.sh` script will:
- Start Chrome with remote debugging (if not already running)
- Run the scraper
- Always close the Chrome browser session after scraping

Example contents:
```sh
#!/bin/bash

# Set your project directory
PROJECT_DIR="$HOME/medium-metrics"

# Start Chrome with remote debugging (if not already running)
if ! lsof -i:9222 >/dev/null; then
  nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --remote-debugging-port=9222 \
    --user-data-dir="./chrome-profiles/automation" \
    --no-first-run \
    --no-default-browser-check \
    --disable-popup-blocking > /dev/null 2>&1 &
  sleep 5
fi

cd "$PROJECT_DIR"
node scraper.js
```

Make it executable:
```sh
chmod +x run_medium_scraper.sh
```

2. **Run the script:**

```sh
./run_medium_scraper.sh
```

- The script will ensure Chrome is running with your automation profile, and run the scraper.
- The browser session will be closed after `scraper.js` execution completes.

## Cron Setup for Automation

To run the scraper every day at 7AM, add this to your crontab:

```sh
0 7 * * * cd /PATH/medium-metrics && /PATH/medium-metrics/run_medium_scraper.sh
```

- This will start Chrome (if not already running) and run the scraper at 7AM daily.
- Adjust the path as needed for your system.
- You can redirect output to a log file if desired:
  ```sh
  0 7 * * * /PATH/medium-metrics/run_medium_scraper.sh >> $HOME/medium-scraper.log 2>&1
  ```

## Supabase Table Setup

Run this SQL in the Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS medium_metrics (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  total_views INT,
  total_reads INT,
  total_earning NUMERIC
);
```

## Grafana Integration

Add your Supabase/Postgres database as a data source in Grafana. Use these example queries:

### Views & Reads (Bar or Stat Panel)
```sql
  SELECT
    'Views' AS metric,
    total_views AS value
  FROM medium_metrics
  UNION ALL
  SELECT
    'Reads' AS metric,
    total_reads AS value
  FROM medium_metrics;
```

### Earnings (Pie Chart)
```sql
  SELECT
    'Earnings' AS Total,
    total_earning AS "USD"
  FROM medium_metrics;
```
- Set the field unit to `Currency > USD ($)` in Grafana for proper formatting.

## Notes
- Only the latest stats are kept in the table (one row).
- For historical tracking, you can remove the delete step in `scraper.js`.
- This project is for personal use. Respect Medium's terms of service.


## License

This project is licensed under the [MIT License](LICENSE). You are free to use, modify, and distribute it as you wish.
