/**
 * Configuration Manager for MQTT and Display settings
 */
require('dotenv').config();

class ConfigManager {
  constructor() {
    // Device Configuration - define this first so we can use it in MQTT options
    this.device = {
      id: process.env.SPECIFIC_DEVICE_ID
    };

    // MQTT Configuration
    this.mqtt = {
      broker: {
        url: process.env.MQTT_BROKER_URL,
        port: parseInt(process.env.MQTT_BROKER_PORT) || 8883
      },
      options: {
        clientId: process.env.MQTT_CLIENT_ID + this.device.id,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clean: true,
        rejectUnauthorized: false,
        protocol: 'mqtts'
      },
      topics: {
        imageDisplay: process.env.MQTT_TOPIC_IMAGE_DISPLAY,
        deviceStatus: process.env.MQTT_TOPIC_DEVICE_STATUS
      }
    };

    // Display Configuration
    this.display = {
      maxBufferSize: 32797,
      align4Bytes: true,
      vcom: 2270,
      bpp: 4, // 4 bits per pixel, 16 grayscale levels
      // Default brightness value - can be overridden by MQTT config
      brightness: 1.0
    };

    // Auto shutdown Configuration
    this.autoShutdown = {
      // Always default to false for safety - only enabled explicitly via config message
      enabled: false
    };

    // GPIO Configuration - keep for future functionality but disable auto-shutdown
    this.gpio = {
      // Enable or disable shutdown via GPIO switch feature
      enableShutdownSwitch: false,
      // GPIO pin number for shutdown switch (BCM numbering)
      shutdownPin: 27
    };
  }

  /**
   * Update configuration based on MQTT message
   * @param {Object} configData - Config data from MQTT message
   */
  updateConfig(configData) {
    console.log('Updating configuration with received values:', JSON.stringify(configData));

    // Update display brightness if provided
    if (configData.displayBrightness !== undefined) {
      this.display.brightness = parseFloat(configData.displayBrightness);
      console.log(`Display brightness updated to: ${this.display.brightness}`);
    }

    // Update auto-shutdown setting if provided
    if (configData.enableAutoShutdown !== undefined) {
      // Explicitly convert to boolean to ensure correct type
      this.autoShutdown.enabled = configData.enableAutoShutdown === true;
      console.log(`Auto shutdown ${this.autoShutdown.enabled ? 'enabled' : 'disabled'}`);
    } else {
      // If enableAutoShutdown is not specified in the config message, default to false
      this.autoShutdown.enabled = false;
      console.log('Auto shutdown defaulted to disabled (not specified in config)');
    }
  }
}

module.exports = new ConfigManager();
