/**
 * DisplayController - Factory for display adapters based on the current platform
 */
const fs = require('fs');
const path = require('path');

// Fast adapter selection - done at module load time
// Read IS_RASPBERRY_PI directly from .env without dependencies
const envPath = path.join(process.cwd(), '.env');
let isRaspberryPi = true; // Default to Raspberry Pi
try {
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

// Lazy-load the appropriate adapter to improve startup time
const getAdapter = () => {
  if (isRaspberryPi) {
    const IT8951DisplayAdapter = require('./adapters/IT8951DisplayAdapter');
    return new IT8951DisplayAdapter();
  } else {
    const MacDisplayAdapter = require('./adapters/MacDisplayAdapter');
    return new MacDisplayAdapter();
  }
};

class DisplayController {
  constructor() {
    this.isInitialized = false;
    this.adapter = null; // Will be initialized on demand
  }

  /**
   * Initialize the display adapter with optimized loading
   */
  async init() {
    console.log(`Initializing display adapter for ${isRaspberryPi ? 'Raspberry Pi' : 'Mac'}`);

    // Load adapter just in time
    if (!this.adapter) {
      this.adapter = getAdapter();
    }

    // Initialize the adapter
    await this.adapter.init();
    this.isInitialized = true;
    console.log('Display initialized and ready for immediate rendering');
  }

  /**
   * Display an image using the selected adapter
   * @param {Buffer} imageData - Raw image data to display
   */
  async displayImage(imageData) {
    await this.adapter.displayImage(imageData);
  }

  /**
   * Set display brightness
   * @param {number} brightness - Brightness value
   */
  setBrightness(brightness) {
    if (this.adapter.setBrightness) {
      this.adapter.setBrightness(brightness);
    }
  }

  /**
   * Clear the display using the selected adapter
   */
  clear() {
    this.adapter.clear();
  }

  /**
   * Close the display adapter
   */
  close() {
    this.adapter.close();
  }
}

module.exports = DisplayController;
