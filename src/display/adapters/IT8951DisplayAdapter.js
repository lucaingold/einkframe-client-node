/**
 * IT8951DisplayAdapter - Adapter for IT8951 e-ink display
 */
const BaseDisplayAdapter = require('./BaseDisplayAdapter');
const config = require('../../config/ConfigManager');

class IT8951DisplayAdapter extends BaseDisplayAdapter {
  constructor() {
    super();
    this.initialized = false;
    this.initializationTimeout = null;
    this.initializationRetries = 0;
    this.maxRetries = 3;

    try {
      // Initialize the display with configuration
      const IT8951 = require('node-it8951');
      this.display = new IT8951({
        MAX_BUFFER_SIZE: config.display.maxBufferSize,
        ALIGN4BYTES: config.display.align4Bytes,
        VCOM: config.display.vcom
      });

      console.log('IT8951 display adapter created');
    } catch (error) {
      console.error('Error creating IT8951 display adapter:', error.message);
      // Create a dummy display object to prevent null references
      this.display = {
        init: () => { throw new Error('Display initialization failed'); },
        clear: () => {},
        draw: () => {},
        close: () => {}
      };
    }
  }

  /**
   * Initialize the e-ink display with timeout and retry logic
   */
  init() {
    if (this.initialized) {
      return;
    }

    // Clear any existing timeout
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
    }

    console.log(`Initializing e-ink display (attempt ${this.initializationRetries + 1} of ${this.maxRetries})...`);

    try {
      // Set a timeout to detect hanging initialization
      this.initializationTimeout = setTimeout(() => {
        if (!this.initialized) {
          console.error('Display initialization timed out after 10 seconds');

          // Try to retry initialization if under max attempts
          if (this.initializationRetries < this.maxRetries) {
            this.initializationRetries++;
            console.log('Retrying display initialization...');
            this.init();
          } else {
            console.error(`Failed to initialize display after ${this.maxRetries} attempts`);
          }
        }
      }, 10000); // 10 second timeout

      // Initialize the display
      this.display.init();

      // If we get here without error, clear timeout and mark as initialized
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
      this.initialized = true;
      console.log('Display initialized successfully.');

      // Reset retry counter
      this.initializationRetries = 0;
    } catch (error) {
      // Clear the timeout if there's an error
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }

      console.error(`Error initializing e-ink display: ${error.message}`);

      // Try to retry initialization if under max attempts
      if (this.initializationRetries < this.maxRetries) {
        this.initializationRetries++;

        // Wait a bit before retrying
        setTimeout(() => {
          console.log('Retrying display initialization after error...');
          this.init();
        }, 2000);
      } else {
        console.error(`Failed to initialize display after ${this.maxRetries} attempts`);
      }
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

      // Process image to adjust brightness using the base class method
      const brightnessAdjustedImage = await this.processImage(imageData);

      // Configure the display
      this.display.config.BPP = config.display.bpp;

      const width = this.display.width;
      const height = this.display.height;

      // Convert image to raw grayscale buffer with correct size for the display
      const sharp = require('sharp');
      const processedImage = await sharp(brightnessAdjustedImage)
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
    // Clear any pending initialization timeout
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
    }

    if (this.initialized) {
      try {
        this.display.close();
      } catch (error) {
        console.error('Error closing display:', error.message);
      }
      this.initialized = false;
      console.log('E-ink display closed');
    }
  }
}

module.exports = IT8951DisplayAdapter;
