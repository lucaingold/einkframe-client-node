#!/bin/bash

# Script to install einkframe-client-node as a systemd service
# This will enable the application to run on startup with sudo privileges

# Ensure script is run with sudo
if [ "$(id -u)" -ne 0 ]; then
    echo "Please run this script with sudo: sudo ./install-service.sh"
    exit 1
fi

# Get the absolute path of the application directory and Node.js binary
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_PATH="$(which node)"
SERVICE_NAME="einkframe"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
ENV_FILE="$APP_DIR/.env"

clear
echo "╔════════════════════════════════════════╗"
echo "║     einkframe Service Installation     ║"
echo "╚════════════════════════════════════════╝"
echo

# Check if .env file exists and create a backup
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.backup" > /dev/null 2>&1
    echo "✓ Created backup of existing .env file"
fi

# Get existing values from .env if it exists
if [ -f "$ENV_FILE" ]; then
    CURRENT_MQTT_BROKER_URL=$(grep MQTT_BROKER_URL "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")
    CURRENT_MQTT_USERNAME=$(grep MQTT_USERNAME "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")
    CURRENT_MQTT_PASSWORD=$(grep MQTT_PASSWORD "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")
fi

# Detect MAC address quietly
MAC_ADDRESS=""

# Try primary interface first
PRIMARY_INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n 1 2>/dev/null)
if [ -n "$PRIMARY_INTERFACE" ]; then
    MAC_ADDRESS=$(cat /sys/class/net/$PRIMARY_INTERFACE/address 2>/dev/null || echo "")
fi

# If that didn't work, try any ethernet or wifi interface
if [ -z "$MAC_ADDRESS" ]; then
    for interface in $(ls /sys/class/net | grep -E 'eth|wlan' 2>/dev/null); do
        if [ -f "/sys/class/net/$interface/address" ]; then
            MAC_ADDRESS=$(cat /sys/class/net/$interface/address)
            break
        fi
    done
fi

# If still empty, use a placeholder
if [ -z "$MAC_ADDRESS" ]; then
    MAC_ADDRESS="unknown-device"
fi

echo "Device ID: $MAC_ADDRESS"
echo

# MQTT Configuration
echo "Please enter your MQTT configuration:"
echo "------------------------------------"

# Show default values if they exist
if [ -n "$CURRENT_MQTT_BROKER_URL" ]; then
    echo "Current broker: $CURRENT_MQTT_BROKER_URL"
fi

# Prompt for new values or use existing ones
echo -n "MQTT Broker URL [${CURRENT_MQTT_BROKER_URL}]: "
read MQTT_BROKER_URL
MQTT_BROKER_URL=${MQTT_BROKER_URL:-$CURRENT_MQTT_BROKER_URL}

echo -n "MQTT Username [${CURRENT_MQTT_USERNAME}]: "
read MQTT_USERNAME
MQTT_USERNAME=${MQTT_USERNAME:-$CURRENT_MQTT_USERNAME}

echo -n "MQTT Password [leave empty to keep current]: "
read -s MQTT_PASSWORD
echo
if [ -z "$MQTT_PASSWORD" ]; then
    MQTT_PASSWORD=$CURRENT_MQTT_PASSWORD
fi

# Update or create .env file
if [ -f "$ENV_FILE" ]; then
    # Update existing file
    sed -i "s|^MQTT_BROKER_URL=.*|MQTT_BROKER_URL=$MQTT_BROKER_URL|" "$ENV_FILE"
    sed -i "s|^MQTT_USERNAME=.*|MQTT_USERNAME=$MQTT_USERNAME|" "$ENV_FILE"
    if [ -n "$MQTT_PASSWORD" ]; then
        sed -i "s|^MQTT_PASSWORD=.*|MQTT_PASSWORD=$MQTT_PASSWORD|" "$ENV_FILE"
    fi
    sed -i "s|^SPECIFIC_DEVICE_ID=.*|SPECIFIC_DEVICE_ID=$MAC_ADDRESS|" "$ENV_FILE"
else
    # Create new file
    cat > "$ENV_FILE" << EOF
MQTT_BROKER_URL=$MQTT_BROKER_URL
MQTT_BROKER_PORT=8883
MQTT_CLIENT_ID=einkframe-client-
MQTT_USERNAME=$MQTT_USERNAME
MQTT_PASSWORD=$MQTT_PASSWORD
MQTT_TOPIC_IMAGE_DISPLAY=device/+/image/display
MQTT_TOPIC_DEVICE_STATUS=device/+/status/online
IMAGE_SAVE_PATH=./images
SPECIFIC_DEVICE_ID=$MAC_ADDRESS
EOF
fi

echo "✓ Environment configuration updated"
echo

echo "Installing systemd service..."

# Create systemd service file
cat > $SERVICE_FILE << EOF
[Unit]
Description=einkframe MQTT Client
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$NODE_PATH $APP_DIR/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=einkframe

[Install]
WantedBy=multi-user.target
EOF

# Configure the service
chmod 644 $SERVICE_FILE > /dev/null 2>&1
systemctl daemon-reload > /dev/null 2>&1
systemctl enable $SERVICE_NAME > /dev/null 2>&1
systemctl restart $SERVICE_NAME > /dev/null 2>&1

echo "✓ Service installed and started"
echo

echo "╔════════════════════════════════════════╗"
echo "║       Installation Complete!           ║"
echo "╚════════════════════════════════════════╝"
echo
echo "Service management commands:"
echo "• Start:    sudo systemctl start $SERVICE_NAME"
echo "• Stop:     sudo systemctl stop $SERVICE_NAME"
echo "• Restart:  sudo systemctl restart $SERVICE_NAME"
echo "• Status:   sudo systemctl status $SERVICE_NAME"
echo "• View logs: sudo journalctl -u $SERVICE_NAME -f"
echo
