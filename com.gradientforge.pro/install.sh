#!/usr/bin/env bash
# Installs the panel into the CEP extensions folder.
#   ./install.sh          copy
#   ./install.sh --link   symlink, so edits are live
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="com.gradientforge.panel"

case "$(uname -s)" in
  Darwin) DEST="$HOME/Library/Application Support/Adobe/CEP/extensions" ;;
  MINGW*|MSYS*|CYGWIN*) DEST="$APPDATA/Adobe/CEP/extensions" ;;
  *) echo "Unsupported platform. Copy this folder into your Adobe/CEP/extensions directory."; exit 1 ;;
esac

mkdir -p "$DEST"
TARGET="$DEST/$NAME"

if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  echo "Replacing existing install at $TARGET"
  rm -rf "$TARGET"
fi

if [ "${1:-}" = "--link" ]; then
  ln -s "$SRC" "$TARGET"
  echo "Linked  $TARGET -> $SRC"
else
  cp -R "$SRC" "$TARGET"
  echo "Copied  $TARGET"
fi

if [ "$(uname -s)" = "Darwin" ]; then
  for v in 9 10 11 12; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
  done
  killall cfprefsd 2>/dev/null || true
  echo "Unsigned extensions enabled for CSXS 9–12."
else
  echo "On Windows, set PlayerDebugMode=1 (String) under HKCU/Software/Adobe/CSXS.9 through CSXS.12."
fi

echo "Restart After Effects, then open Window > Extensions > GradientForge."
