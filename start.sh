#!/bin/bash

# Simple einkframe Direct Start Script for use with dietpi-autostart

APP_DIR="$(dirname "$(realpath "$0")")"
cd "$APP_DIR"

mkdir -p "$APP_DIR/logs"
LOG_FILE="$APP_DIR/logs/einkframe.log"

exec >> "$LOG_FILE" 2>&1

echo "$(date): Starting einkframe client"
echo "Waiting for network..."

NETWORK_READY=false
for i in {1..60}; do
    if ping -c1 -W1 1.1.1.1 &>/dev/null; then
        NETWORK_READY=true
        break
    fi
    sleep 1
done

if $NETWORK_READY; then
    echo "$(date): Network connection established"
else
    echo "$(date): Warning - No network connection after 60s, continuing anyway"
fi

echo "$(date): Launching Node.js application"
node index.js
