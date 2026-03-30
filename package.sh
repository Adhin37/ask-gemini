#!/bin/bash

# Define the output filename
OUTPUT_ZIP="ask-gemini-extension.zip"

# These are the files required for the extension to run.
# We include the root manifest and the grouped feature folders in src/
FILES=(
    "manifest.json"
    "LICENSE"
    "README.md"
    "POLICIES.md"
)

DIRS=(
    "icons"
    "src/background"
    "src/content"
    "src/popup"
    "src/options"
    "src/welcome"
)

echo "Checking for required files and directories..."
MISSING=0

for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "Error: File $file is missing."
        MISSING=$((MISSING + 1))
    fi
done

for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "Error: Directory $dir/ is missing."
        MISSING=$((MISSING + 1))
    fi
done

if [ $MISSING -gt 0 ]; then
    echo "------------------------------------------------"
    echo "Validation failed. $MISSING item(s) missing."
    echo "Make sure you've moved files into their src/ folders."
    echo "Aborting."
    exit 1
fi

echo "All files found. Creating $OUTPUT_ZIP..."

rm -f "$OUTPUT_ZIP"

zip -r "$OUTPUT_ZIP" "${FILES[@]}" "${DIRS[@]}"

if [ $? -eq 0 ]; then
    echo "Successfully packaged $OUTPUT_ZIP"
else
    echo "Error: Failed to create zip file."
    exit 1
fi