/**
 * Image buffer utility for storing and managing images received before the display is ready
 */

// Global singleton instance for image buffering across components
let instance = null;

class ImageBuffer {
  constructor() {
    // Only create one instance
    if (instance) {
      return instance;
    }

    this.imageData = null;         // The actual image data as Buffer
    this.received = false;         // Whether an image has been received
    this.receiveTimestamp = 0;     // When the image was received
    this.listeners = [];           // Callbacks to notify when new image arrives

    instance = this;
  }

  /**
   * Store an image in the buffer
   * @param {Buffer} data - The image data
   */
  storeImage(data) {
    this.imageData = data;
    this.received = true;
    this.receiveTimestamp = Date.now();

    // Notify any listeners
    this.listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in image listener:', error);
      }
    });

    return true;
  }

  /**
   * Retrieve the latest image
   * @returns {Object} Image info with data and timestamp
   */
  getImage() {
    if (!this.received) {
      return null;
    }

    return {
      data: this.imageData,
      timestamp: this.receiveTimestamp,
      age: Date.now() - this.receiveTimestamp
    };
  }

  /**
   * Clear the buffer
   */
  clear() {
    this.imageData = null;
    this.receiveTimestamp = 0;
    return true;
  }

  /**
   * Register a listener for new images
   * @param {Function} callback - Function to call when a new image arrives
   */
  onNewImage(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
    return this.listeners.length;
  }

  /**
   * Check if we have a buffered image
   * @returns {boolean} True if an image is buffered
   */
  hasImage() {
    return this.received && this.imageData !== null;
  }
}

// Export a singleton instance
module.exports = new ImageBuffer();
