/**
 * MacDisplayAdapter - Mock adapter for Mac OS that saves images instead of displaying on e-ink
 */
const BaseDisplayAdapter = require('./BaseDisplayAdapter');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const config = require('../../config/ConfigManager');

class MacDisplayAdapter extends BaseDisplayAdapter {
  constructor() {
    super();
    this.initialized = false;
    console.log('Mac display adapter created - images will be saved to disk');
  }

  /**
   * Sanitizes a device ID for safe directory name by replacing colons with underscores
   * @param {string} deviceId - The device ID to sanitize
   * @returns {string} - Sanitized device ID safe for file paths
   */
  sanitizeDeviceId(deviceId) {
    return deviceId.replace(/:/g, '_');
  }

  /**
   * Initialize by creating necessary directories
   */
  init() {
    if (!this.initialized) {
      try {
        // Make sure image directory exists
        const savePath = path.resolve(process.env.IMAGE_SAVE_PATH || './images');

        // Create the base images directory if it doesn't exist
        fs.ensureDirSync(savePath);

        // Sanitize the device ID to make it safe for file paths (replace colons with underscores)
        const sanitizedDeviceId = this.sanitizeDeviceId(config.device.id);
        const devicePath = path.join(savePath, sanitizedDeviceId);

        // Create the device-specific directory
        fs.ensureDirSync(devicePath);

        console.log(`Image directory prepared: ${devicePath}`);
        this.initialized = true;
      } catch (error) {
        console.error(`Error initializing directory structure: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Save image to disk as JPEG
   * @param {Buffer} imageData - Raw image data to save
   */
  async displayImage(imageData) {
    try {
      if (!this.initialized) {
        this.init();
      }

      console.log(`Processing image for saving, size: ${imageData.length} bytes`);

      // Use sanitized device ID for the path
      const savePath = path.resolve(process.env.IMAGE_SAVE_PATH || './images');
      const sanitizedDeviceId = this.sanitizeDeviceId(config.device.id);
      const devicePath = path.join(savePath, sanitizedDeviceId);
      const imagePath = path.join(devicePath, `latest_image.jpg`);

      // Convert and save image
      await sharp(imageData)
        .jpeg({ quality: 90 })
        .toFile(imagePath);

      console.log(`Image saved to ${imagePath}`);
    } catch (error) {
      console.error(`Error saving image:`, error);
      throw error;  // Re-throw the error so it can be handled upstream if needed
    }
  }

  /**
   * Clear is a no-op for Mac adapter
   */
  clear() {
    // No-op for Mac adapter
  }

  /**
   * Close is a no-op for Mac adapter
   */
  close() {
    this.initialized = false;
    console.log('Mac display adapter closed');
  }
}

module.exports = MacDisplayAdapter;
