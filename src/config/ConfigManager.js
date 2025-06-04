/**
 * Configuration Manager for MQTT and Display settings
 */
require('dotenv').config();

class ConfigManager {
  constructor() {
    // MQTT Configuration
    this.mqtt = {
      broker: {
        url: process.env.MQTT_BROKER_URL,
        port: parseInt(process.env.MQTT_BROKER_PORT) || 8883
      },
      options: {
        clientId: process.env.MQTT_CLIENT_ID + '-' + Math.random().toString(16).substring(2, 8),
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

    // Device Configuration
    this.device = {
      id: process.env.SPECIFIC_DEVICE_ID
    };
  }
}

module.exports = new ConfigManager();
