#!/usr/bin/env bash
# מרנדר את tools/icon.svg (1200x900, בסגנון תמונות החנות) בעזרת Chrome/Chromium במצב headless:
#   tools/store-icon.png — 1200x900, תמונת התוסף בחנות
#   assets/icon.png      — 256x256, חיתוך ריבועי סביב המסגרת, לאייקון התוסף באוצריא
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
render() {  # <svg> <width> <height> <out>
  local html; html="$(mktemp --suffix=.html)"
  printf '<!doctype html><html><body style="margin:0"><img src="file://%s" width="%s" height="%s"></body></html>' \
    "$1" "$2" "$3" > "$html"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --default-background-color=00000000 --window-size="$2,$3" --virtual-time-budget=3000 \
    --screenshot="$PWD/$4" "file://$html" >/dev/null 2>&1
  rm -f "$html"
  echo "wrote $4"
}
render "$PWD/tools/icon.svg" 1200 900 tools/store-icon.png
square="$(mktemp --suffix=.svg)"
sed 's#viewBox="0 0 1200 900" width="1200" height="900"#viewBox="95 -45 1010 1010" width="1010" height="1010"#' tools/icon.svg > "$square"
render "$square" 256 256 assets/icon.png
rm -f "$square"
