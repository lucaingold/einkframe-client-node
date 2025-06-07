#!/bin/bash

# Script to install einkframe-client-node as a systemd service
# This will enable the application to run on startup with sudo privileges

# Exit on any error
set -e

# Ensure script is run with sudo
if [ "$(id -u)" -ne 0 ]; then
    echo "Please run this script with sudo: sudo ./install-service.sh"
    exit 1
fi

# Get the absolute path of the application directory
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_PATH="$(which node)"
SERVICE_NAME="einkframe"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
ENV_FILE="$APP_DIR/.env"

echo "===== einkframe Service Installation ====="

# Check if .env file exists and create a backup
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.backup"
    echo "Created backup of existing .env file at $ENV_FILE.backup"
fi

# Get current values from .env (if it exists)
if [ -f "$ENV_FILE" ]; then
    # Try to extract current values as defaults
    CURRENT_MQTT_BROKER_URL=$(grep MQTT_BROKER_URL "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")
    CURRENT_MQTT_USERNAME=$(grep MQTT_USERNAME "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")
    CURRENT_MQTT_PASSWORD=$(grep MQTT_PASSWORD "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")
fi

# Ask for MQTT configuration
echo ""
echo "===== MQTT Configuration ====="
echo "Please provide MQTT configuration details (press Enter to use existing values):"
echo ""

# MQTT_BROKER_URL - Force interactive input with </dev/tty
echo -n "MQTT Broker URL [$CURRENT_MQTT_BROKER_URL]: "
read MQTT_BROKER_URL </dev/tty
MQTT_BROKER_URL=${MQTT_BROKER_URL:-$CURRENT_MQTT_BROKER_URL}

# MQTT_USERNAME - Force interactive input with </dev/tty
echo -n "MQTT Username [$CURRENT_MQTT_USERNAME]: "
read MQTT_USERNAME </dev/tty
MQTT_USERNAME=${MQTT_USERNAME:-$CURRENT_MQTT_USERNAME}

# MQTT_PASSWORD - Force interactive input with </dev/tty
echo -n "MQTT Password [$CURRENT_MQTT_PASSWORD]: "
read -s MQTT_PASSWORD </dev/tty
echo
MQTT_PASSWORD=${MQTT_PASSWORD:-$CURRENT_MQTT_PASSWORD}

echo ""
echo "===== Device Configuration ====="

# Get the Raspberry Pi's MAC address (using the primary ethernet/wifi interface)
MAC_ADDRESS=$(cat /sys/class/net/$(ip route show default | awk '/default/ {print $5}')/address 2>/dev/null || echo "")
if [ -z "$MAC_ADDRESS" ]; then
    # Fallback method if the first method fails
    MAC_ADDRESS=$(ip link | grep -E 'eth|wlan' | head -n 1 | awk '{print $2}')

    # If still empty, provide a manual option
    if [ -z "$MAC_ADDRESS" ]; then
        echo "Could not automatically detect MAC address."
        echo -n "Please enter device ID manually: "
        read MAC_ADDRESS </dev/tty
    fi
fi

echo "Using device MAC address: $MAC_ADDRESS"
echo ""

# Update .env file with new values but preserve other settings
if [ -f "$ENV_FILE" ]; then
    # Update specific values in the existing .env file
    sed -i "s|^MQTT_BROKER_URL=.*|MQTT_BROKER_URL=$MQTT_BROKER_URL|" "$ENV_FILE"
    sed -i "s|^MQTT_USERNAME=.*|MQTT_USERNAME=$MQTT_USERNAME|" "$ENV_FILE"
    sed -i "s|^MQTT_PASSWORD=.*|MQTT_PASSWORD=$MQTT_PASSWORD|" "$ENV_FILE"
    sed -i "s|^SPECIFIC_DEVICE_ID=.*|SPECIFIC_DEVICE_ID=$MAC_ADDRESS|" "$ENV_FILE"
else
    # Create a new .env file
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

echo "Environment configuration updated."
echo ""
echo "===== Service Installation ====="
echo "Installing einkframe-client-node as a systemd service..."

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

# Set permissions for the service file
chmod 644 $SERVICE_FILE

# Reload systemd daemon to recognize the new service
systemctl daemon-reload

# Enable the service to start at boot
systemctl enable $SERVICE_NAME

# Start the service
systemctl start $SERVICE_NAME

echo ""
echo "===== Installation Complete ====="
echo "Service installed and started successfully!"
echo "Service status:"
systemctl status $SERVICE_NAME

echo ""
echo "You can manage the service with the following commands:"
echo "  sudo systemctl start $SERVICE_NAME    # Start the service"
echo "  sudo systemctl stop $SERVICE_NAME     # Stop the service"
echo "  sudo systemctl restart $SERVICE_NAME  # Restart the service"
echo "  sudo systemctl status $SERVICE_NAME   # Check service status"
echo "  sudo journalctl -u $SERVICE_NAME -f   # View and follow logs"
