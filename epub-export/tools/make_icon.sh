#!/usr/bin/env bash
# מרנדר את tools/icon.svg ל-assets/icon.png (256x256) ול-tools/store-icon.png (1024x1024, לתמונת החנות)
# בעזרת Chrome/Chromium במצב headless.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
render() {  # <size> <out>
  local html; html="$(mktemp --suffix=.html)"
  printf '<!doctype html><html><body style="margin:0"><img src="file://%s" width="%s" height="%s"></body></html>' \
    "$PWD/tools/icon.svg" "$1" "$1" > "$html"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --default-background-color=00000000 --window-size="$1,$1" --virtual-time-budget=3000 \
    --screenshot="$PWD/$2" "file://$html" >/dev/null 2>&1
  rm -f "$html"
  echo "wrote $2"
}
render 256 assets/icon.png
render 1024 tools/store-icon.png
