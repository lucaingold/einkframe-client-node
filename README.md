# einkframe-client-node

A Node.js MQTT client application for einkframe - An e-ink display system that connects to an MQTT broker to receive and display images on IT8951-based e-ink displays.

## Overview

This client application connects to an MQTT broker and subscribes to specific topics to receive images for display. The application is designed to run on Raspberry Pi devices with connected IT8951 e-ink displays.

## Features

- MQTT connectivity with TLS support
- Automatic reconnection to broker when disconnected
- Device-specific message filtering
- E-ink display management via IT8951 interface
- Automatic service installation for Raspbian (runs on system startup)
- Local image caching

## Requirements

- Raspberry Pi (any model with GPIO)
- IT8951-based e-ink display
- Node.js 12+
- Raspbian OS

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/einkframe-client-node.git
cd einkframe-client-node
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

The application requires certain environment variables to be set. Create a `.env` file with the following variables or use the provided installation script which will prompt for these values:

```
MQTT_BROKER_URL=your-mqtt-broker-url
MQTT_BROKER_PORT=8883
MQTT_CLIENT_ID=einkframe-client-node
MQTT_USERNAME=your-username
MQTT_PASSWORD=your-password
MQTT_TOPIC_IMAGE_DISPLAY=device/+/image/display
MQTT_TOPIC_DEVICE_STATUS=device/+/status/online
IMAGE_SAVE_PATH=./images
SPECIFIC_DEVICE_ID=your-device-id
```

### 4. SSH git config

```bash
sudo apt-get install build-essential
sudo apt install openssh-client
ssh-keygen -t rsa -b 4096
chmod +x install-service.sh
sudo ./install-service.sh
```


### 4. Run the installation script

The installation script configures your application as a systemd service that runs on startup with sudo privileges, and prompts for MQTT configuration details:

```bash
sudo apt-get install build-essential
sudo apt install openssh-client
ssh-keygen -t rsa -b 4096
chmod +x install-service.sh
sudo ./install-service.sh
```

The script will:
- Prompt you for MQTT broker URL, username, and password
- Automatically set SPECIFIC_DEVICE_ID to the Raspberry Pi's MAC address
- Create or update the .env file with your settings
- Install a systemd service configured to run with root privileges
- Start the service and enable it to run on boot

### 5. Manual start (if not using the service)

If you prefer to run the application manually instead of as a service:

```bash
sudo node index.js
```

Note: The application requires sudo privileges to access the IT8951 e-ink display.

## Service Management

Once installed as a service, you can manage it using these commands:

```bash
# Start the service
sudo systemctl start einkframe

# Stop the service
sudo systemctl stop einkframe

# Restart the service
sudo systemctl restart einkframe

# Check service status
sudo systemctl status einkframe

# View logs
sudo journalctl -u einkframe -f
```

## MQTT Message Format

The application listens to the following MQTT topics:

1. **Image Display Topic**: `device/{device-id}/image/display`
   - Binary payload containing the image data
   - Or JSON with a URL to download the image

2. **Configuration Topic**: `device/{device-id}/config`
   - JSON payload containing configuration settings
   - Available configuration options:
   ```json
   {
     "enableAutoShutdown": false,  // Set to true to enable auto-shutdown after first image
     "displayBrightness": 1.0      // Brightness factor (1.0 = normal, >1.0 = brighter, <1.0 = darker)
   }
   ```

### Auto-Shutdown Feature

When enabled via the configuration topic, the device will automatically shut down after:
1. A valid configuration message has been received
2. At least one image has been displayed

This feature is useful for battery-powered installations where you want the device to power off after displaying content.

**Note**: Auto-shutdown is disabled by default for safety. It will only be enabled if explicitly set to `true` in a configuration message.

## Development

### Display Adapters

The application uses display adapters to support different display types:

- `IT8951DisplayAdapter`: For IT8951-based e-ink displays (production)
- `MacDisplayAdapter`: For development on macOS (shows images in Preview)

The appropriate adapter is selected based on the runtime environment.

## Troubleshooting

- **Service doesn't start**: Check logs with `sudo journalctl -u einkframe -f`
- **No images displayed**: Verify MQTT credentials and topic subscriptions
- **Hardware issues**: Ensure the e-ink display is properly connected via GPIO

