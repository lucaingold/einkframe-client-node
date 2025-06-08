#!/bin/bash

# Script to install einkframe-client-node as a systemd service
# This will enable the application to run on startup with sudo privileges

# Exit immediately if a command fails
set -e

# Enable debugging for file operations
DEBUG_ENV_FILE=true

# Ensure script is run with sudo
if [ "$(id -u)" -ne 0 ]; then
    echo "Please run this script with sudo: sudo ./install-service.sh"
    exit 1
fi

# Get the absolute path of the application directory
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="einkframe"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
ENV_FILE="$APP_DIR/.env"

clear
echo "╔════════════════════════════════════════╗"
echo "║     einkframe Installation Setup       ║"
echo "╚════════════════════════════════════════╝"
echo

# Ask if user wants to install as a service
INSTALL_SERVICE=false
echo "Would you like to install einkframe as a system service?"
echo "This will make it run automatically at startup."
echo "  1) Yes, install as a service (recommended)"
echo "  2) No, just set up configuration"
echo
echo -n "Enter your choice [1]: "
read SERVICE_CHOICE
SERVICE_CHOICE=${SERVICE_CHOICE:-1}

if [ "$SERVICE_CHOICE" == "1" ]; then
    INSTALL_SERVICE=true
    echo "Will install as a system service."
else
    echo "Will only set up configuration."
fi
echo

# Check if running on a Raspberry Pi or compatible system (including DietPi)
IS_RASPBERRY_PI=false

# Check for Raspberry Pi in cpuinfo
if [ -f /proc/cpuinfo ] && grep -q -E "Raspberry Pi|BCM2708|BCM2709|BCM2711|BCM2835|BCM2836|BCM2837|BCM2838" /proc/cpuinfo; then
    IS_RASPBERRY_PI=true
fi

# Check for known OS distributions
if [ -f /etc/os-release ]; then
    if grep -q -E "raspbian|dietpi|raspberry|debian" /etc/os-release; then
        IS_RASPBERRY_PI=true
    fi
fi

# Check for Pi-specific hardware directories
if [ -d "/sys/firmware/devicetree/base/model" ] && [ -f "/sys/firmware/devicetree/base/model" ]; then
    if grep -q "Raspberry Pi" /sys/firmware/devicetree/base/model; then
        IS_RASPBERRY_PI=true
    fi
fi

# If we detect a Pi-compatible system, check and enable SPI if needed
if $IS_RASPBERRY_PI; then
    echo "Raspberry Pi or compatible system detected (DietPi/Raspbian)"
    echo "Checking SPI configuration..."

    # Check if SPI is already enabled
    if grep -q "^dtparam=spi=on" /boot/config.txt; then
        echo "✓ SPI is already enabled"
    else
        echo "Enabling SPI interface..."

        # Try raspi-config if available (standard Raspbian)
        if command -v raspi-config >/dev/null 2>&1; then
            # Enable SPI using raspi-config non-interactive mode
            raspi-config nonint do_spi 0
            echo "✓ SPI enabled via raspi-config"
        # Try dietpi-config if available (DietPi specific)
        elif command -v dietpi-config >/dev/null 2>&1; then
            # Enable SPI through dietpi-config if possible
            # Note: dietpi-config might not have a direct non-interactive SPI command
            # Manual modification is the safer option for DietPi
            echo "dtparam=spi=on" >> /boot/config.txt
            echo "✓ SPI enabled by modifying /boot/config.txt (DietPi method)"
        else
            # Manual method as fallback
            echo "dtparam=spi=on" >> /boot/config.txt
            echo "✓ SPI enabled by modifying /boot/config.txt"
        fi

        echo "NOTE: A reboot is required for SPI changes to take effect."
        echo "The installation will continue, but you should reboot your system afterwards."
        echo
    fi
else
    echo "Non-Raspberry Pi system detected. Skipping SPI configuration."
fi

# Find the Node.js executable - handle NVM and other installations
# First try the user's Node if installed via NVM
if [ -n "$SUDO_USER" ]; then
    USER_HOME=$(eval echo ~$SUDO_USER)
    if [ -f "$USER_HOME/.nvm/nvm.sh" ]; then
        echo "NVM detected, looking for Node.js..."
        # Source NVM for the original user
        export NVM_DIR="$USER_HOME/.nvm"
        # This will load nvm for the sudo environment
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
fi

# Try multiple methods to find Node.js
NODE_PATHS=(
    "$(which node 2>/dev/null)"                          # Standard path
    "/home/einkframe/.nvm/versions/node/*/bin/node"      # NVM path
    "/usr/local/bin/node"                                # Common location
    "/usr/bin/node"                                      # Another common location
)

NODE_PATH=""
for path in "${NODE_PATHS[@]}"; do
    # For NVM wildcard paths, get the latest version
    if [[ $path == *"*"* ]]; then
        latest_node=$(ls -t $path 2>/dev/null | head -n 1)
        if [ -n "$latest_node" ] && [ -x "$latest_node" ]; then
            NODE_PATH=$latest_node
            break
        fi
    elif [ -x "$path" ]; then
        NODE_PATH=$path
        break
    fi
done

# If still not found, ask the user
if [ -z "$NODE_PATH" ]; then
    echo "Could not automatically find Node.js."
    read -p "Please enter the full path to your Node.js executable: " NODE_PATH
    if [ ! -x "$NODE_PATH" ]; then
        echo "Error: The provided path is not an executable file."
        exit 1
    fi
fi

# Display Node.js information
echo "Using Node.js: $NODE_PATH"
echo "Version: $($NODE_PATH --version)"
echo

# Check existing .env file permissions and back it up
if [ -f "$ENV_FILE" ]; then
    # Check if we can read the file
    if [ ! -r "$ENV_FILE" ]; then
        echo "Warning: Cannot read existing .env file. Fixing permissions..."
        chmod +r "$ENV_FILE"
    fi

    # Create backup
    cp "$ENV_FILE" "$ENV_FILE.backup" > /dev/null 2>&1
    echo "✓ Created backup of existing .env file"

    # Check write permissions on directory
    if [ ! -w "$(dirname "$ENV_FILE")" ]; then
        echo "Warning: Cannot write to the directory. Fixing permissions..."
        chmod +w "$(dirname "$ENV_FILE")"
    fi
else
    echo "No existing .env file found. Will create a new one."
    # Check write permissions on directory
    if [ ! -w "$(dirname "$ENV_FILE")" ]; then
        echo "Warning: Cannot write to the directory. Fixing permissions..."
        chmod +w "$(dirname "$ENV_FILE")"
    fi
fi

# Get existing values from .env if it exists
CURRENT_MQTT_BROKER_URL=""
CURRENT_MQTT_USERNAME=""
CURRENT_MQTT_PASSWORD=""

if [ -f "$ENV_FILE" ]; then
    # Try to extract current values as defaults
    CURRENT_MQTT_BROKER_URL=$(grep MQTT_BROKER_URL "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")
    CURRENT_MQTT_USERNAME=$(grep MQTT_USERNAME "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")
    CURRENT_MQTT_PASSWORD=$(grep MQTT_PASSWORD "$ENV_FILE" | cut -d= -f2 2>/dev/null || echo "")

    if $DEBUG_ENV_FILE; then
        echo "DEBUG: Current values from .env:"
        echo "  Broker URL: '$CURRENT_MQTT_BROKER_URL'"
        echo "  Username: '$CURRENT_MQTT_USERNAME'"
        echo "  Password: [${#CURRENT_MQTT_PASSWORD} characters]"
    fi
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

# Debug output to verify input was captured
if $DEBUG_ENV_FILE; then
    echo "DEBUG: Values to be written to .env:"
    echo "  Broker URL: '$MQTT_BROKER_URL'"
    echo "  Username: '$MQTT_USERNAME'"
    echo "  Password: [${#MQTT_PASSWORD} characters]"
    echo "  MAC Address: '$MAC_ADDRESS'"
fi

# Create new .env file directly instead of modifying the existing one
cat > "$ENV_FILE.new" << EOF
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

# Check if the new file was created successfully
if [ -f "$ENV_FILE.new" ]; then
    # Move the new file to replace the old one
    mv "$ENV_FILE.new" "$ENV_FILE"

    if $DEBUG_ENV_FILE; then
        echo "DEBUG: New .env file content:"
        cat "$ENV_FILE"
    fi

    echo "✓ Environment configuration updated"
else
    echo "ERROR: Failed to create new .env file. Check permissions."
    exit 1
fi

echo

# Create images directory if it doesn't exist
mkdir -p "$APP_DIR/images" > /dev/null 2>&1
chmod -R 755 "$APP_DIR/images" > /dev/null 2>&1
echo "✓ Image directory configured"

# Only install as a service if requested
if $INSTALL_SERVICE; then
    echo "Installing systemd service..."

    # Create systemd service file with the full path to Node.js executable
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

    # Make sure the script is not trying to directly execute index.js
    chmod 644 "$APP_DIR/index.js" > /dev/null 2>&1
    echo "✓ File permissions set correctly"

    # Restart the service
    systemctl restart $SERVICE_NAME > /dev/null 2>&1
    echo "✓ Service installed and started"
    echo

    echo "╔═════════════════════��══════════════════╗"
    echo "║       Installation Complete!           ║"
    echo "╚════════════════════════════════════════╝"
    echo
    echo "Service management commands:"
    echo "• Start:    sudo systemctl start $SERVICE_NAME"
    echo "�� Stop:     sudo systemctl stop $SERVICE_NAME"
    echo "• Restart:  sudo systemctl restart $SERVICE_NAME"
    echo "• Status:   sudo systemctl status $SERVICE_NAME"
    echo "• View logs: sudo journalctl -u $SERVICE_NAME -f"
    echo
else
    # Create a start script for manual execution
    cat > "$APP_DIR/start.sh" << EOF
#!/bin/bash
cd "\$(dirname "\$0")"
sudo node index.js
EOF

    # Make it executable
    chmod +x "$APP_DIR/start.sh"

    echo "╔════════════════════════════════════════╗"
    echo "║       Configuration Complete!          ║"
    echo "╚════════════════════════════════════════╝"
    echo
    echo "To start the application manually, run:"
    echo "  ./start.sh"
    echo
    echo "You can also run it directly with:"
    echo "  sudo node $APP_DIR/index.js"
    echo
fi
