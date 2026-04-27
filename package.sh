#!/bin/bash
# package.sh — Package Ask Gemini for Chrome Web Store submission
#
# Expects the build to have already been run (npm run build).
# Produces one zip file:
#   ask-gemini-extension.zip  — contains both minified (*.min.js/css) and original
#                               source files so CWS reviewers can inspect the code
#
# Usage:
#   ./package.sh

set -euo pipefail

DIST_DIR="dist"
RELEASE_ZIP="$DIST_DIR/ask-gemini-extension.zip"

# ── 1. Validate required files exist ─────────────────────────────────
echo "Validating build output..."

MISSING=0
REQUIRED=(
  "manifest.json"
  "LICENSE"
  "README.md"
  "POLICIES.md"
  "CONTRIBUTING.md"
  "src/background/background.js"
  "src/background/background.min.js"
  "src/content/content.js"
  "src/content/content.min.js"
  "src/popup/popup.html"
  "src/popup/popup.js"
  "src/popup/popup.css"
  "src/popup/popup.min.js"
  "src/popup/popup.min.css"
  "src/options/options.html"
  "src/options/options.js"
  "src/options/options.css"
  "src/options/options.min.js"
  "src/options/options.min.css"
  "src/welcome/welcome.html"
  "src/welcome/welcome.js"
  "src/welcome/welcome.css"
  "src/welcome/welcome.min.js"
  "src/welcome/welcome.min.css"
  "src/shared/constants.js"
)

for f in "${REQUIRED[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  ERROR: missing $f"
    MISSING=$((MISSING + 1))
  fi
done

if [ ! -d "icons" ]; then
  echo "  ERROR: missing icons/"
  MISSING=$((MISSING + 1))
fi

if [ $MISSING -gt 0 ]; then
  echo "Validation failed: $MISSING item(s) missing. Run 'npm run build' first."
  exit 1
fi
echo "  All required files present."

# ── 2. Package zip ────────────────────────────────────────────────────
# src/ contains both the original source files (for CWS review) and the
# generated *.min.js / *.min.css files (loaded by the extension at runtime).
echo ""
echo "Creating $RELEASE_ZIP..."
mkdir -p "$DIST_DIR"
rm -f "$RELEASE_ZIP"
zip -r "$RELEASE_ZIP" \
  manifest.json LICENSE README.md POLICIES.md CONTRIBUTING.md CHANGELOG.md \
  icons/ \
  src/
echo "  $RELEASE_ZIP created ($(du -sh "$RELEASE_ZIP" | cut -f1))"

echo ""
echo "Done."
echo "  Upload $RELEASE_ZIP to the Chrome Web Store."
