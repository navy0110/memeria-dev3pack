#!/bin/sh
# Regenera los PNG del kit desde los SVG/HTML. Uso: ./render.sh (desde brand/)
set -e
cd "$(dirname "$0")"
shot() { # archivo ancho alto salida [transparente]
  bg=ffffffff; [ -n "$5" ] && bg=00000000
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --default-background-color=$bg --window-size=$2,$3 --screenshot="$PWD/$4" "file://$PWD/$1" >/dev/null 2>&1
}
wrap() { printf '<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent}img{display:block;width:%spx;height:%spx}</style><img src="%s">' "$2" "$3" "$1" > ".wrap.html"; }
wrap coin.svg 1000 1000; shot .wrap.html 1000 1000 coin.png t
wrap logo.svg 900 260;   shot .wrap.html 900 260 logo.png t
wrap icon.svg 512 512;   shot .wrap.html 512 512 icon.png t
shot banner.html 1500 500 banner.png
rm -f .wrap.html
