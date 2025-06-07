/**
 * DisplayController - Factory for display adapters based on the current platform
 */
const os = require('os');
const IT8951DisplayAdapter = require('./adapters/IT8951DisplayAdapter');
const MacDisplayAdapter = require('./adapters/MacDisplayAdapter');

class DisplayController {
  constructor() {
    // Select the appropriate adapter based on platform
    const isMac = os.platform() === 'darwin';

    if (isMac) {
      this.adapter = new MacDisplayAdapter();
    } else {
      this.adapter = new IT8951DisplayAdapter();
    }
  }

  /**
   * Initialize the display adapter
   */
  init() {
    this.adapter.init();
  }

  /**
   * Display an image using the selected adapter
   * @param {Buffer} imageData - Raw image data to display or save
   */
  async displayImage(imageData) {
    await this.adapter.displayImage(imageData);
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
