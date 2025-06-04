#!/bin/bash

# Define the name of the output zip file
ZIP_FILE="context-collector.zip"

# Remove the zip file if it already exists
if [ -f "$ZIP_FILE" ]; then
    rm "$ZIP_FILE"
fi

# Create the zip file, including necessary files for a Firefox extension
zip -r "$ZIP_FILE" \
    manifest.json \
    icons \
    fonts \
    styles \
    legal \
    *.html \
    LICENSE \
    scripts \
    libs \

echo "Files have been zipped into $ZIP_FILE"
