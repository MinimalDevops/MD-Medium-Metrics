#!/bin/bash

# Set your project directory
PROJECT_DIR="$HOME/medium-metrics"

# Start Chrome with remote debugging (if not already running)
# This will not start a new Chrome if one is already running on port 9222
if ! lsof -i:9223 >/dev/null; then
  nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --remote-debugging-port=9223 \
    --user-data-dir="./chrome-profiles/automation" \
    --no-first-run \
    --no-default-browser-check \
    --disable-popup-blocking > /dev/null 2>&1 &
  # Wait for Chrome to start (up to 30 seconds)
  for i in {1..30}; do
    if lsof -i:9223 >/dev/null; then
      break
    fi
    sleep 1
  done
fi

# Change to the project directory
cd "$PROJECT_DIR"

# Run the scraper
node scraper.js