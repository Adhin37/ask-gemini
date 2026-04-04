#!/bin/bash
# package.sh — Build and package Ask Gemini for distribution + CWS review
#
# Produces two zip files:
#   ask-gemini-extension.zip  — minified build for distribution / Chrome Web Store upload
#   ask-gemini-source.zip     — unminified source for Chrome Web Store review submission
#
# Usage:
#   ./package.sh              → run build, then create both zips
#   ./package.sh --no-build   → skip the build step (dist/ must already exist)

set -euo pipefail

RELEASE_ZIP="ask-gemini-extension.zip"
SOURCE_ZIP="ask-gemini-source.zip"
SKIP_BUILD=false

for arg in "$@"; do
  [[ "$arg" == "--no-build" ]] && SKIP_BUILD=true
done

# ── 1. Build ─────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  echo "Building extension..."
  node build.mjs
fi

# ── 2. Validate dist/ exists ─────────────────────────────────────────
echo ""
echo "Validating build output..."

MISSING=0
REQUIRED_DIST=(
  "dist/background/background.js"
  "dist/content/content.js"
  "dist/popup/popup.html"
  "dist/popup/popup.js"
  "dist/popup/popup.css"
  "dist/options/options.html"
  "dist/options/options.js"
  "dist/options/options.css"
  "dist/welcome/welcome.html"
  "dist/welcome/welcome.js"
  "dist/welcome/welcome.css"
)
REQUIRED_ROOT=(
  "manifest.json"
  "LICENSE"
  "README.md"
  "POLICIES.md"
)
REQUIRED_DIRS=(
  "icons"
)

for f in "${REQUIRED_DIST[@]}" "${REQUIRED_ROOT[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  ERROR: missing $f"
    MISSING=$((MISSING + 1))
  fi
done
for d in "${REQUIRED_DIRS[@]}"; do
  if [ ! -d "$d" ]; then
    echo "  ERROR: missing $d/"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -gt 0 ]; then
  echo "Validation failed: $MISSING item(s) missing. Aborting."
  exit 1
fi
echo "  All required files present."

# ── 3. Release zip (minified build) ──────────────────────────────────
echo ""
echo "Creating $RELEASE_ZIP (minified build)..."
rm -f "$RELEASE_ZIP"
zip -r "$RELEASE_ZIP" \
  manifest.json LICENSE README.md POLICIES.md \
  icons/ \
  dist/
echo "  $RELEASE_ZIP created ($(du -sh "$RELEASE_ZIP" | cut -f1))"

# ── 4. Source zip (for Chrome Web Store review) ───────────────────────
# CWS policy: if you submit minified code you must provide the original source.
# This zip contains the human-readable source so reviewers can inspect it.
echo ""
echo "Creating $SOURCE_ZIP (unminified source for CWS review)..."
rm -f "$SOURCE_ZIP"
zip -r "$SOURCE_ZIP" \
  manifest.json LICENSE README.md POLICIES.md CONTRIBUTING.md \
  icons/ \
  src/ \
  build.mjs package.json
echo "  $SOURCE_ZIP created ($(du -sh "$SOURCE_ZIP" | cut -f1))"

echo ""
echo "Done."
echo "  Release:  $RELEASE_ZIP  ← upload to Chrome Web Store"
echo "  Source:   $SOURCE_ZIP   ← attach to CWS submission as source code"
