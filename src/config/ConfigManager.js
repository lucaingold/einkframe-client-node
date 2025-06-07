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
      bpp: 4 // 4 bits per pixel, 16 grayscale levels
    };

    // GPIO Configuration
    this.gpio = {
      // Enable or disable shutdown via GPIO switch feature
      enableShutdownSwitch: process.env.ENABLE_GPIO_SHUTDOWN === 'true',
      // GPIO pin number for shutdown switch (BCM numbering)
      shutdownPin: 27
    };
  }
}

module.exports = new ConfigManager();
