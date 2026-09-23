#!/bin/sh
# このマップを法人サイト（https://www.kameishouten.com/japanlivecamera/）へ反映する。
# 先に tools/update_streams.py などでデータを更新し、このリポジトリ側を push しておくこと。
set -eu
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${KAMEISHOUTEN_DIR:-$HOME/Desktop/kamei-shoten}"
[ -d "$DST/.git" ] || { echo "法人サイトのフォルダが見つかりません: $DST"; exit 1; }

mkdir -p "$DST/japanlivecamera/assets" "$DST/japanlivecamera/data"
cp "$SRC/index.html"                          "$DST/japanlivecamera/index.html"
cp "$SRC/assets/app.js" "$SRC/assets/style.css" "$DST/japanlivecamera/assets/"
cp "$SRC/data/cameras.js"                     "$DST/japanlivecamera/data/"
touch "$DST/japanlivecamera/.nojekyll"

cd "$DST"
git add japanlivecamera
if git diff --cached --quiet; then echo "変更はありませんでした"; exit 0; fi
git commit -q -m "ライブカメラマップを更新"
git push -q origin main
echo "反映しました。1〜2分後に https://www.kameishouten.com/japanlivecamera/ へ反映されます"
