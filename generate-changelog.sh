#!/bin/bash

# Get the last two tags
TAGS=$(git tag --sort=-v:refname | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' | head -n 2)
CUR=$(echo "$TAGS" | sed -n '1p')
PREV=$(echo "$TAGS" | sed -n '2p')

# Fallback for first release
if [ -z "$PREV" ]; then
    RANGE="HEAD"
    COMPARE_URL=""
else
    RANGE="$PREV..$CUR"
    # Get remote URL to build a comparison link
    REMOTE_URL=$(git config --get remote.origin.url | sed 's/\.git$//' | sed 's/git@github.com:/https:\/\/github.com\//')
    COMPARE_URL="$REMOTE_URL/compare/$PREV...$CUR"
fi

{
    echo "## 🚀 Release $CUR ($(date +'%Y-%m-%d'))"
    
    # --- Category: Features ---
    FEATS=$(git log "$RANGE" --grep="^feat" --format="* %s (%h)")
    if [ -n "$FEATS" ]; then
        echo -e "\n### ✨ Features"
        echo "$FEATS"
    fi

    # --- Category: Bug Fixes ---
    FIXES=$(git log "$RANGE" --grep="^fix" --format="* %s (%h)")
    if [ -n "$FIXES" ]; then
        echo -e "\n### 🐛 Bug Fixes"
        echo "$FIXES"
    fi

    # --- Category: Maintenance ---
    CHORES=$(git log "$RANGE" --grep="^chore\|^refactor" --format="* %s (%h)")
    if [ -n "$CHORES" ]; then
        echo -e "\n### ⚙️ Maintenance"
        echo "$CHORES"
    fi

    # --- Bonus: Essential Metadata ---
    echo -e "\n---"
    echo "### 📊 Release Stats"
    echo "* **Total Commits:** $(git rev-list --count "$RANGE")"
    echo "* **Contributors:** $(git log "$RANGE" --format='%aN' | sort -u | paste -sd ", " -)"
    
    if [ -n "$COMPARE_URL" ]; then
        echo "* **Full Changelog:** [View Changes]($COMPARE_URL)"
    fi

} > RELEASE_NOTES.md