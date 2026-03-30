#!/bin/bash

# Define the output filename
OUTPUT_ZIP="ask-gemini-extension.zip"

# List of root files needed
FILES=(
    "background.js"
    "content.js"
    "LICENSE"
    "manifest.json"
    "options.css"
    "options.html"
    "options.js"
    "POLICIES.md"
    "popup.css"
    "popup.html"
    "popup.js"
    "README.md"
)

# List of directories needed
DIRS=(
    "icons"
)

echo "Checking for required files..."
MISSING=0

# Check individual files
for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "Error: $file is missing."
        MISSING=$((MISSING + 1))
    fi
done

# Check directories
for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "Error: Directory $dir/ is missing."
        MISSING=$((MISSING + 1))
    fi
done

if [ $MISSING -gt 0 ]; then
    echo "Validation failed. $MISSING item(s) missing. Aborting."
    exit 1
fi

echo "All files found. Creating $OUTPUT_ZIP..."

# Remove old zip if it exists to ensure a clean build
rm -f "$OUTPUT_ZIP"

# Zip the files and the directory
zip -r "$OUTPUT_ZIP" "${FILES[@]}" "${DIRS[@]}"

if [ $? -eq 0 ]; then
    echo "Successfully packaged $OUTPUT_ZIP"
else
    echo "An error occurred during zipping."
    exit 1
fi