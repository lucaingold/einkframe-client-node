/**
 * Configuration Manager for MQTT and Display settings - Optimized for fast startup
 */

// Avoid requiring dotenv at the top level - implement a more targeted approach
// that only loads what's needed immediately
class ConfigManager {
  constructor() {
    // Track which config sections have been initialized
    this._initialized = {
      device: false,
      mqtt: false,
      display: false,
      autoShutdown: false,
      gpio: false
    };

    // Pre-load only the critical device ID for faster startup
    this._loadDeviceConfig();
  }

  /**
   * Load only the essential device configuration
   * @private
   */
  _loadDeviceConfig() {
    if (this._initialized.device) return;

    // Fast loading of device ID directly from environment or .env
    let deviceId = process.env.SPECIFIC_DEVICE_ID;

    // If not in environment, try reading directly from .env for speed
    if (!deviceId) {
      try {
        const fs = require('fs');
        const path = require('path');
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const match = envContent.match(/SPECIFIC_DEVICE_ID\s*=\s*(.+)$/m);
          if (match) {
            deviceId = match[1].trim();
          }
        }
      } catch (e) {
        // Silently continue on error
      }
    }

    this.device = {
      id: deviceId || 'unknown-device'
    };

    this._initialized.device = true;
  }

  /**
   * Get MQTT configuration - lazy loaded only when needed
   */
  get mqtt() {
    if (!this._initialized.mqtt) {
      this._loadEnvIfNeeded();

      this._mqtt = {
        broker: {
          url: process.env.MQTT_BROKER_URL,
          port: parseInt(process.env.MQTT_BROKER_PORT) || 8883
        },
        options: {
          clientId: (process.env.MQTT_CLIENT_ID || 'einkframe-') + this.device.id,
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

      this._initialized.mqtt = true;
    }

    return this._mqtt;
  }

  /**
   * Get display configuration - lazy loaded
   */
  get display() {
    if (!this._initialized.display) {
      this._display = {
        maxBufferSize: 32797,
        align4Bytes: true,
        vcom: 2270,
        bpp: 4, // 4 bits per pixel, 16 grayscale levels
        brightness: 1.0
      };

      this._initialized.display = true;
    }

    return this._display;
  }

  /**
   * Get auto-shutdown configuration - lazy loaded
   */
  get autoShutdown() {
    if (!this._initialized.autoShutdown) {
      this._autoShutdown = {
        enabled: false
      };

      this._initialized.autoShutdown = true;
    }

    return this._autoShutdown;
  }

  /**
   * Get GPIO configuration - lazy loaded
   */
  get gpio() {
    if (!this._initialized.gpio) {
      this._gpio = {
        enabled: false
      };

      this._initialized.gpio = true;
    }

    return this._gpio;
  }

  /**
   * Load environment variables if not already loaded
   * @private
   */
  _loadEnvIfNeeded() {
    // Only load dotenv if we haven't already
    if (!this._envLoaded) {
      try {
        require('dotenv').config();
        this._envLoaded = true;
      } catch (e) {
        console.warn('Error loading dotenv, using existing environment variables:', e.message);
        this._envLoaded = true; // Mark as loaded anyway to prevent retries
      }
    }
  }

  /**
   * Update configuration with new values
   * @param {Object} configData - New configuration data
   */
  updateConfig(configData) {
    // Update only what's provided in the configData
    if (configData.display) {
      Object.assign(this.display, configData.display);
    }

    if (configData.autoShutdown !== undefined) {
      this.autoShutdown.enabled = configData.autoShutdown === true;
    }

    if (configData.gpio) {
      Object.assign(this.gpio, configData.gpio);
    }
  }
}

// Export a singleton instance
module.exports = new ConfigManager();
