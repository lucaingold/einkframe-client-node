/**
 * DisplayController - Factory for display adapters with ultra-fast initialization
 */

// Fast platform detection without loading any modules initially
let isRaspberryPi = true; // Default assumption - we'll check just in time

// Deferred adapter loading - no requires at module level
class DisplayController {
  constructor() {
    this.isInitialized = false;
    this.adapter = null;
    this.initPromise = null;

    // Pre-determine if we're on a Pi without loading modules
    // This is even faster than reading .env file
    try {
      // Fastest check: look for Raspberry Pi-specific files
      const fs = require('fs');
      isRaspberryPi = fs.existsSync('/proc/device-tree/model') &&
                      fs.readFileSync('/proc/device-tree/model', 'utf8').includes('Raspberry Pi');
    } catch (e) {
      // Fallback to checking environment variable
      try {
        const path = require('path');
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const match = envContent.match(/IS_RASPBERRY_PI\s*=\s*(true|false)/i);
          if (match) {
            isRaspberryPi = match[1].toLowerCase() === 'true';
          }
        }
      } catch (e) {
        // Silently default to Raspberry Pi on error
      }
    }

    console.log(`Display controller created for ${isRaspberryPi ? 'Raspberry Pi' : 'Mac'} platform`);
  }

  /**
   * Initialize the display adapter with ultra-optimized initialization
   * Returns a promise that resolves when display is ready
   */
  async init() {
    // Return existing initialization if already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (this.isInitialized) {
      return Promise.resolve();
    }

    console.log(`Initializing display adapter for ${isRaspberryPi ? 'Raspberry Pi' : 'Mac'}`);

    // Create initialization promise
    this.initPromise = new Promise(async (resolve, reject) => {
      try {
        // Create adapter just in time - load required modules only when needed
        if (!this.adapter) {
          if (isRaspberryPi) {
            const IT8951DisplayAdapter = require('./adapters/IT8951DisplayAdapter');
            this.adapter = new IT8951DisplayAdapter();
          } else {
            const MacDisplayAdapter = require('./adapters/MacDisplayAdapter');
            this.adapter = new MacDisplayAdapter();
          }
        }

        // Initialize the adapter with high priority
        await this.adapter.init();

        this.isInitialized = true;
        console.log('Display initialized and ready for immediate rendering');
        resolve();
      } catch (error) {
        console.error('Display initialization failed:', error);
        reject(error);
      } finally {
        // Clear promise reference to allow retries if needed
        this.initPromise = null;
      }
    });

    return this.initPromise;
  }

  /**
   * Display an image using the selected adapter
   * @param {Buffer} imageData - Raw image data to display
   */
  async displayImage(imageData) {
    // Initialize if needed
    if (!this.isInitialized) {
      await this.init();
    }

    console.log(`Display controller processing image of ${imageData.length} bytes`);
    return this.adapter.displayImage(imageData);
  }

  /**
   * Set display brightness with fast response
   * @param {number} brightness - Brightness value
   */
  setBrightness(brightness) {
    if (this.adapter && this.adapter.setBrightness) {
      this.adapter.setBrightness(brightness);
    }
  }

  /**
   * Clear the display using the selected adapter
   */
  clear() {
    if (this.adapter) {
      this.adapter.clear();
    }
  }

  /**
   * Close the display adapter and release resources
   */
  close() {
    if (this.adapter) {
      this.adapter.close();
      this.isInitialized = false;
    }
  }
}

module.exports = DisplayController;
