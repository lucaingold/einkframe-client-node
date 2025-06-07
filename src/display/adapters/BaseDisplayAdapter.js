/**
 * BaseDisplayAdapter - Abstract base class for display adapters
 */
const sharp = require('sharp');
const config = require('../../config/ConfigManager');

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
