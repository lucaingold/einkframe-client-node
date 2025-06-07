/**
 * IT8951DisplayAdapter - Adapter for IT8951 e-ink display
 */
const BaseDisplayAdapter = require('./BaseDisplayAdapter');
const config = require('../../config/ConfigManager');

class IT8951DisplayAdapter extends BaseDisplayAdapter {
  constructor() {
    super();
    this.initialized = false;

    // Initialize the display with configuration
    const IT8951 = require('node-it8951');
    this.display = new IT8951({
      MAX_BUFFER_SIZE: config.display.maxBufferSize,
      ALIGN4BYTES: config.display.align4Bytes,
      VCOM: config.display.vcom
    });

    console.log('IT8951 display adapter created');
  }

  /**
   * Initialize the e-ink display
   */
  init() {
    if (!this.initialized) {
      console.log('Initializing e-ink display...');
      this.display.init();
      console.log('Display initialized.');
      this.initialized = true;
    }
  }

  /**
   * Display an image on the e-ink display
   * @param {Buffer} imageData - Raw image data to display
   */
  async displayImage(imageData) {
    try {
      if (!this.initialized) {
        this.init();
      }

      console.log(`Processing image for e-ink display, size: ${imageData.length} bytes`);

      // Configure the display
      this.display.config.BPP = config.display.bpp;

      const width = this.display.width;
      const height = this.display.height;

      // Convert image to raw grayscale buffer with correct size for the display
      const sharp = require('sharp');
      const processedImage = await sharp(imageData)
        .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
        .grayscale()
        .raw()
        .toBuffer();

      // Convert 8-bit grayscale to 4-bit packed grayscale
      const displayBuffer = this.convert8bitTo4BPP(processedImage);

      // Clear the display before showing the new image
      this.display.clear();

      // Draw the image on the display
      console.log(`Drawing image (${width}x${height}) on e-ink display`);
      this.display.draw(displayBuffer, 0, 0, width, height);

      console.log('Image displayed successfully');
    } catch (error) {
      console.error(`Error displaying image on e-ink:`, error);
    }
  }

  /**
   * Packs two 4-bit pixels into each byte for the e-ink display
   * @param {Buffer} input - 8-bit grayscale buffer
   * @returns {Buffer} - 4-bit packed grayscale buffer
   */
  convert8bitTo4BPP(input) {
    const output = Buffer.alloc(Math.ceil(input.length / 2));
    for (let i = 0; i < input.length; i += 2) {
      const high = input[i] >> 4;
      const low = (i + 1 < input.length) ? (input[i + 1] >> 4) : 0x0;
      output[i >> 1] = (high << 4) | low;
    }
    return output;
  }

  /**
   * Clear the display
   */
  clear() {
    if (this.initialized) {
      this.display.clear();
    }
  }

  /**
   * Close the display connection
   */
  close() {
    if (this.initialized) {
      this.display.close();
      this.initialized = false;
      console.log('E-ink display closed');
    }
  }
}

module.exports = IT8951DisplayAdapter;
