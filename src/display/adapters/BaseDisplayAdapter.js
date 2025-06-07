/**
 * BaseDisplayAdapter - Abstract base class for display adapters
 */
class BaseDisplayAdapter {
  /**
   * Initialize the display
   */
  init() {
    throw new Error('Method init() must be implemented by subclass');
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
