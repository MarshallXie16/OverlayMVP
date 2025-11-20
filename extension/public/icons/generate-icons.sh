#!/bin/bash
# Generate PNG icons from SVG (requires inkscape or ImageMagick)
# For now, we'll create placeholder PNGs

# Create simple colored squares as placeholders
for size in 16 48 128; do
  # Use ImageMagick convert if available, otherwise create text file placeholder
  if command -v convert &> /dev/null; then
    convert -size ${size}x${size} xc:'#14b8a6' -gravity center -pointsize $((size/2)) -fill white -annotate +0+0 'W' icon${size}.png
  else
    echo "Icon ${size}x${size} placeholder" > icon${size}.png
  fi
done
