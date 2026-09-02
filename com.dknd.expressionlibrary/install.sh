#!/usr/bin/env bash
# Expression Library - macOS kurulum yardimcisi
# Kullanim: ./install.sh
set -e

EXT_ID="com.dknd.expressionlibrary"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/$EXT_ID"

echo "==> PlayerDebugMode aciliyor (imzasiz eklenti destegi)..."
for V in 9 10 11 12; do
  defaults write "com.adobe.CSXS.$V" PlayerDebugMode 1 2>/dev/null || true
done

echo "==> Kopyalaniyor: $DEST"
mkdir -p "$DEST"
rsync -a --delete --exclude ".git" "$SRC/" "$DEST/"

echo "==> Tamam. After Effects'i yeniden baslatin:"
echo "    Window > Extensions > Expression Library"
