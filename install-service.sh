#!/bin/bash

# Debug mode - print all commands as they are executed
set -x

echo "Starting einkframe installation script..."
echo "This script will install the einkframe service on your Raspberry Pi."

# Ensure script is run with sudo
if [ "$(id -u)" -ne 0 ]; then
    echo "Please run this script with sudo: sudo ./install-service.sh"
    exit 1
fi

# Get the absolute path of the application directory
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Application directory: $APP_DIR"

NODE_PATH="$(which node)"
echo "Node.js path: $NODE_PATH"

SERVICE_NAME="einkframe"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
ENV_FILE="$APP_DIR/.env"

echo "===== einkframe Service Installation ====="

# Check if .env file exists and create a backup
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.backup"
    echo "Created backup of existing .env file at $ENV_FILE.backup"
fi

# Try to detect the primary network interface and MAC address
echo "Detecting network interfaces..."
ip addr show

echo "Detecting MAC address..."
PRIMARY_INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n 1)
echo "Primary interface: $PRIMARY_INTERFACE"

if [ -n "$PRIMARY_INTERFACE" ]; then
    MAC_ADDRESS=$(cat /sys/class/net/$PRIMARY_INTERFACE/address 2>/dev/null || echo "")
    echo "MAC address from primary interface: $MAC_ADDRESS"
else
    echo "Could not detect primary interface"
    MAC_ADDRESS=""
fi

# If we couldn't get the MAC address, try other methods
if [ -z "$MAC_ADDRESS" ]; then
    echo "Trying alternate methods to get MAC address..."
    # Try to find any ethernet or wireless interface
    MAC_ADDRESS=$(cat /sys/class/net/$(ls /sys/class/net | grep -E 'eth|wlan' | head -n 1)/address 2>/dev/null || echo "")
    echo "MAC address from alternate method: $MAC_ADDRESS"
fi

# If still empty, use a placeholder
if [ -z "$MAC_ADDRESS" ]; then
    MAC_ADDRESS="unknown-device"
    echo "Could not detect MAC address, using placeholder: $MAC_ADDRESS"
fi

echo "Using device ID: $MAC_ADDRESS"

echo "===== MQTT Configuration ====="

# Interactive prompting for MQTT configuration
read -p "Enter MQTT Broker URL: " MQTT_BROKER_URL
read -p "Enter MQTT Username: " MQTT_USERNAME
read -s -p "Enter MQTT Password: " MQTT_PASSWORD
echo ""

echo "Creating or updating .env file..."

# Create new env file content
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

echo "Environment configuration updated."

echo "Creating systemd service file..."

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

echo "Setting permissions for service file..."
chmod 644 $SERVICE_FILE

echo "Reloading systemd daemon..."
systemctl daemon-reload

echo "Enabling service to start at boot..."
systemctl enable $SERVICE_NAME

echo "Starting service..."
systemctl start $SERVICE_NAME

echo "Checking service status..."
systemctl status $SERVICE_NAME

echo ""
echo "===== Installation Complete ====="
echo "Service installed and started successfully!"
echo ""
echo "You can manage the service with the following commands:"
echo "  sudo systemctl start $SERVICE_NAME    # Start the service"
echo "  sudo systemctl stop $SERVICE_NAME     # Stop the service"
echo "  sudo systemctl restart $SERVICE_NAME  # Restart the service"
echo "  sudo systemctl status $SERVICE_NAME   # Check service status"
echo "  sudo journalctl -u $SERVICE_NAME -f   # View and follow logs"

# Turn off debug mode
set +x

