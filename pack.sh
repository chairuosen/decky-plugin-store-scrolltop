#!/usr/bin/env bash
set -e

NAME=$(grep -m1 '"name"' package.json | sed -E 's/.*"name"\s*:\s*"([^"]+)".*/\1/')
VERSION=$(grep -m1 '"version"' package.json | sed -E 's/.*"version"\s*:\s*"([^"]+)".*/\1/')
OUTZIP="dist/${NAME}-v${VERSION}.zip"

pnpm run build

rm -rf pack
mkdir -p "pack/${NAME}"
cp -r dist "pack/${NAME}/dist"
cp -f plugin.json package.json "pack/${NAME}/" 2>/dev/null || true
[ -f main.py ] && cp -f main.py "pack/${NAME}/"
[ -f README.md ] && cp -f README.md "pack/${NAME}/"
[ -f LICENSE ] && cp -f LICENSE "pack/${NAME}/"
[ -f LICENSE.md ] && cp -f LICENSE.md "pack/${NAME}/"
[ -d defaults ] && cp -r defaults "pack/${NAME}/defaults"

if command -v zip >/dev/null 2>&1; then
  zip -r -9 "$OUTZIP" "pack/${NAME}" >/dev/null
elif command -v 7z >/dev/null 2>&1; then
  7z a -tzip "$OUTZIP" "pack/${NAME}" >/dev/null
elif command -v tar >/dev/null 2>&1; then
  tar -a -c -f "$OUTZIP" -C "pack" "$NAME"
elif command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'pack/${NAME}' -DestinationPath '${OUTZIP}' -Force"
else
  echo "no archiver available"
  exit 1
fi

echo "$OUTZIP"
