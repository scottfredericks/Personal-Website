#!/bin/bash

BUCKET_NAME="scottfrederickswebsite"
DISTRIBUTION_ID="E1G9H55E53TOWS"
LOCAL_DIR="."

# Check for -y flag
AUTO_CONFIRM=false
if [ "$1" = "-y" ]; then
    AUTO_CONFIRM=true
fi

# Prompt for confirmation unless -y flag is used
if [ "$AUTO_CONFIRM" = false ]; then
    read -p "Deploy to S3 and invalidate CloudFront cache? (y/n): " response
    if [[ ! "$response" =~ ^[Yy] ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
fi

echo "Syncing directory with s3..."

# Note: check the --include and --exclude options when adding new files or directories
aws s3 sync "$LOCAL_DIR" "s3://$BUCKET_NAME" \
    --delete \
    --cache-control "max-age=300" \
    --exclude "*" \
    --include "index.html" \
    --include "css/*" \
    --include "images/*"

if [ $? -eq 0 ]; then
    echo "Upload successful! Creating CloudFront invalidation..."
    INVALIDATION_OUTPUT=$(aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/*" \
        --output json)

    INVALIDATION_ID=$(echo "$INVALIDATION_OUTPUT" | grep -o '"Id": "[^"]*' | cut -d'"' -f4)

    echo "Invalidation created with ID: $INVALIDATION_ID"
    echo "Deployment complete!"
else
    echo "Upload failed!"
    exit 1
fi
