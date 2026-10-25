#!/bin/sh
# Starts a local server and opens Beyond Power Control in Chrome app mode.
cd "$(dirname "$0")"
python3 -m http.server 8123 &
sleep 2
if command -v google-chrome >/dev/null 2>&1; then
  google-chrome --app=http://localhost:8123/
elif [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app=http://localhost:8123/
else
  echo "Open http://localhost:8123/ in Chrome or Edge."
fi
wait
