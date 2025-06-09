/**
 * BaseDisplayAdapter - Abstract base class for display adapters
 */
const sharp = require('sharp');
const config = require('../../config/ConfigManager');
const EnvUpdater = require('../../util/EnvUpdater');

class BaseDisplayAdapter {
  /**
   * Initialize the display
   */
  init() {
    throw new Error('Method init() must be implemented by subclass');
  }

  /**
   * Process image data to apply brightness adjustment
   * @param {Buffer} imageData - Raw image data to process
   * @returns {Promise<Buffer>} - Processed image data
   */
  async processImage(imageData) {
    try {
      const brightness = config.display.brightness;

      // If brightness is 1.0 (default), don't process the image
      if (brightness === 1.0) {
        return imageData;
      }

      console.log(`Adjusting image brightness by factor: ${brightness}`);

      // Use sharp to adjust brightness directly with the brightness factor
      return await sharp(imageData)
        .modulate({ brightness: brightness })
        .toBuffer();
    } catch (error) {
      console.error('Error processing image brightness:', error);
      // Return original image if processing fails
      return imageData;
    }
  }

  /**
   * Set display brightness
   * @param {number} brightness - Brightness value between 0.0 and 2.0
   */
  setBrightness(brightness) {
    if (typeof brightness === 'number' && brightness >= 0) {
      console.log(`Setting display brightness to: ${brightness}`);

      // Update config in memory
      config.display.brightness = brightness;

      // Persist to .env file
      EnvUpdater.updateEnvFile('DISPLAY_BRIGHTNESS', brightness);

      return true;
    }
    return false;
  }

  /**
   * Display an image
   * @param {Buffer} imageData - Raw image data to display or save
   */
  async displayImage(imageData) {
    throw new Error('Method displayImage() must be implemented by subclass');
  }

  /**
   * Clear the display
   */
  clear() {
    // Optional method, not all adapters need this
  }

  /**
   * Close the display connection
   */
  close() {
    // Optional method, not all adapters need this
  }
}

module.exports = BaseDisplayAdapter;
