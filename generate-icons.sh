#!/usr/bin/env bash
set -e
# generate-icons.sh
# Generates icon-192.png and icon-512.png from icon-192.svg (the logo SVG)
# Requires ImageMagick (convert) or librsvg (rsvg-convert).

SRC="icon-192.svg"
OUT192="icon-192.png"
OUT512="icon-512.png"

if [ ! -f "$SRC" ]; then
  echo "Source SVG $SRC not found in $(pwd). Please ensure icon-192.svg exists."
  exit 1
fi

if command -v convert >/dev/null 2>&1; then
  echo "Using ImageMagick convert to render PNGs..."
  convert "$SRC" -background none -resize 192x192 "$OUT192"
  convert "$SRC" -background none -resize 512x512 "$OUT512"
  echo "Generated: $OUT192, $OUT512"
  exit 0
fi

if command -v rsvg-convert >/dev/null 2>&1; then
  echo "Using rsvg-convert to render PNGs..."
  rsvg-convert -w 192 -h 192 -o "$OUT192" "$SRC"
  rsvg-convert -w 512 -h 512 -o "$OUT512" "$SRC"
  echo "Generated: $OUT192, $OUT512"
  exit 0
fi

echo "No suitable rasterizer found. Install ImageMagick (convert) or librsvg (rsvg-convert) and re-run this script."
exit 1
