#!/usr/bin/env bash
# Packages the panel as a signed .zxp installer.
#
# Needs Adobe's ZXPSignCmd on your PATH:
#   https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
#
#   ./build-zxp.sh cert.p12 <password>
#
# No certificate yet? Generate a self-signed one for testing:
#   ZXPSignCmd -selfSignedCert US CA "Your Studio" "Your Studio" <password> cert.p12
# Shipping to customers needs a real code-signing certificate, or installers like
# ZXPInstaller and Anastasiy's will warn on every install.
set -euo pipefail

CERT="${1:-}"
PASS="${2:-}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$SRC/dist/GradientForge.zxp"
STAGE="$(mktemp -d)/GradientForge"

if [ -z "$CERT" ] || [ -z "$PASS" ]; then
  echo "Usage: ./build-zxp.sh <cert.p12> <password>"; exit 1
fi
command -v ZXPSignCmd >/dev/null || { echo "ZXPSignCmd not found on PATH."; exit 1; }

mkdir -p "$STAGE" "$SRC/dist"
# .debug must not ship — it opens a remote-debug port on the customer's machine.
rsync -a --exclude '.debug' --exclude 'dist' --exclude '.git' \
      --exclude '*.sh' --exclude 'node_modules' "$SRC/" "$STAGE/"

rm -f "$OUT"
ZXPSignCmd -sign "$STAGE" "$OUT" "$CERT" "$PASS" -tsa http://timestamp.digicert.com

echo "Built $OUT"
