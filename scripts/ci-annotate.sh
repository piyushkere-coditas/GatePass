#!/usr/bin/env bash
# Publishes the interesting part of a failed CI log as a GitHub error annotation, so failures can be
# read from the public check-run annotations without downloading logs.
# Usage: bash scripts/ci-annotate.sh <title> <logfile>
set -uo pipefail
title=$1
log=$2
[ -f "$log" ] || exit 0

excerpt=$(grep -nE '●|✕|Error|error|ERR!|FAIL|failed|denied|not found|exited with|Cannot|refused' "$log" | head -60)
[ -n "$excerpt" ] || excerpt=$(tail -60 "$log")

# Annotation messages are single-line: encode %, CR, LF.
encoded=$(printf '%s' "$excerpt" | sed -e 's/%/%25/g' -e 's/\r/%0D/g' | awk 'BEGIN{ORS="%0A"} {print}')
echo "::error title=${title}::${encoded}"
