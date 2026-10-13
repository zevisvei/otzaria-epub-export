#!/usr/bin/env bash
# בונה קובצי EPUB לדוגמה ומריץ עליהם epubcheck. שימוש: tools/check_samples.sh <epubcheck.jar> [java]
set -euo pipefail
JAR="$1"; JAVA="${2:-java}"
OUT="$(mktemp -d)"
node "$(dirname "$0")/test_core.js" "$OUT"
fail=0
for f in "$OUT"/*.epub; do
  echo "== $(basename "$f")"
  if ! "$JAVA" -jar "$JAR" --failonwarnings "$f"; then fail=1; fi
done
exit $fail
