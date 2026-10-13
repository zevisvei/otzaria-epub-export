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
# FB2 מול ה-XSD הרשמי, כשהוגדרה תיקיית הסכמות (FB2_XSD_DIR) ו-lxml זמין
if [ -n "${FB2_XSD_DIR:-}" ]; then
  python3 "$(dirname "$0")/validate_fb2.py" "$FB2_XSD_DIR" "$OUT"/*.fb2 || fail=1
fi
exit $fail
