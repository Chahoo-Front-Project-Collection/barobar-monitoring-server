#!/usr/bin/env bash
set -euo pipefail

CHECK_PATH="${1:-/}"
WARNING_PERCENT="${REPLAY_STORAGE_WARNING_USAGE_PERCENT:-75}"
EMERGENCY_PERCENT="${REPLAY_STORAGE_EMERGENCY_USAGE_PERCENT:-90}"

if [ ! -e "$CHECK_PATH" ]; then
  echo "Disk check path does not exist: ${CHECK_PATH}" >&2
  exit 2
fi

used_percent="$(df -P "$CHECK_PATH" | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"

if [ -z "$used_percent" ]; then
  echo "Failed to read disk usage for path: ${CHECK_PATH}" >&2
  exit 2
fi

echo "Disk usage for ${CHECK_PATH}: ${used_percent}%"
echo "Warning threshold: ${WARNING_PERCENT}%"
echo "Emergency threshold: ${EMERGENCY_PERCENT}%"

if awk -v used="$used_percent" -v threshold="$EMERGENCY_PERCENT" 'BEGIN { exit !(used >= threshold) }'; then
  echo "Emergency: disk usage is at or above ${EMERGENCY_PERCENT}%." >&2
  exit 2
fi

if awk -v used="$used_percent" -v threshold="$WARNING_PERCENT" 'BEGIN { exit !(used >= threshold) }'; then
  echo "Warning: disk usage is at or above ${WARNING_PERCENT}%." >&2
  exit 1
fi

echo "Disk usage is healthy."
