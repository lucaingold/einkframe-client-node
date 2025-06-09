/**
 * MQTT Client for einkframe
 * This client connects to an MQTT broker and displays images on an IT8951 e-ink display.
 * Ultra-optimized for fastest startup and image display with hyper-lazy-loading.
 */

// Performance tracking
const startTime = process.hrtime();
const performanceMetrics = {
  startTimestamp: Date.now(),
  displayInitialized: 0,
  mqttConnected: 0,
  imageReceived: 0,
  imageDisplayed: 0,
  appFullyInitialized: 0
};

// Log elapsed time since startup in ms
function logPerformance(label) {
  const elapsed = process.hrtime(startTime);
  const elapsedMs = (elapsed[0] * 1000 + elapsed[1] / 1000000).toFixed(2);
  console.log(`[PERFORMANCE] ${label}: ${elapsedMs}ms`);
  return elapsedMs;
}

// Only require fs and path at startup - everything else lazy loaded
const fs = require('fs');
const path = require('path');

// Ultra-fast device ID determination without loading full config
function getFastDeviceId() {
  try {
    // Try to get from environment first (fastest)
    if (process.env.DEVICE_ID) return process.env.DEVICE_ID;

    // Try to read MAC address directly from file (faster than loading os module)
    if (fs.existsSync('/sys/class/net/wlan0/address')) {
      return fs.readFileSync('/sys/class/net/wlan0/address', 'utf8').trim();
    }

    // Fall back to requiring os module
    return require('os').networkInterfaces()['wlan0']?.[0]?.mac || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

// Get device ID ultra-fast
const deviceId = getFastDeviceId();
console.log(`Starting einkframe client for device: ${deviceId}`);

// Buffer for images received during startup
let imageBuffer = null;

class Application {
  constructor() {
    // Initialize variables without loading any modules
    this.displayController = null;
    this.mqttClient = null;
    this.config = null;
    this.displayReady = false;
    this.mqttReady = false;
    this.shuttingDown = false;

    logPerformance('Application constructor completed');
  }

  /**
   * Ultra-fast initialization with display priority
   */
  async init() {
    // Start display initialization immediately (highest priority)
    const displayPromise = this.initDisplayWithPriority();

    // Start MQTT in parallel but slightly delayed to prioritize display
    const mqttPromise = new Promise(resolve => {
      // Small delay to ensure display gets CPU priority first
      setTimeout(() => this.initMqtt().then(resolve), 10);
    });

    // Wait for both critical components with timeout
    try {
      await Promise.race([
        Promise.all([displayPromise, mqttPromise]),
        new Promise(resolve => setTimeout(resolve, 10000)) // Safety timeout
      ]);
    } catch (error) {
      console.error('Error during initialization:', error);
    }

    // Mark as fully initialized
    performanceMetrics.appFullyInitialized = Date.now() - performanceMetrics.startTimestamp;
    logPerformance('App fully initialized');

    // Print performance report
    this.logPerformanceReport();

    // Process any image that arrived during initialization
    this.processBufferedImage();

    // Initialize non-critical components in background
    setTimeout(() => this.initLowPriorityComponents(), 1000);
  }

  /**
   * Initialize display with highest priority
   */
  async initDisplayWithPriority() {
    console.log('Initializing display controller with highest priority');

    try {
      // Lazy load display controller
      const DisplayController = require('./src/display/DisplayController');
      this.displayController = new DisplayController();

      // Initialize display
      await this.displayController.init();
      this.displayReady = true;

      // Record metrics
      performanceMetrics.displayInitialized = Date.now() - performanceMetrics.startTimestamp;
      logPerformance('Display initialization completed');

      console.log('Display initialized and ready for immediate rendering');
      console.log('Display ready - checking for buffered images');

      // Check if we have a last-displayed image to show
      this.checkForLastImage();

      return true;
    } catch (error) {
      console.error('Display initialization error:', error);
      return false;
    }
  }

  /**
   * Check for and display the last image that was shown
   */
  checkForLastImage() {
    // Only try if display is ready and no newer image is buffered
    if (this.displayReady && !imageBuffer) {
      try {
        // Check if we have a latest_image.jpg stored
        const deviceFolder = deviceId.replace(/:/g, '_');
        const latestImagePath = path.join(__dirname, 'images', deviceFolder, 'latest_image.jpg');
        if (fs.existsSync(latestImagePath)) {
          console.log('Found last displayed image, showing it immediately');
          const imageData = fs.readFileSync(latestImagePath);
          // Display without blocking further initialization
          this.displayController.displayImage(imageData).catch(e => console.error('Error displaying last image:', e));
        }
      } catch (error) {
        console.error('Error checking for last image:', error);
      }
    }
  }

  /**
   * Initialize MQTT client for messaging
   */
  async initMqtt() {
    console.log('Fast subscribing to MQTT topics');

    try {
      // Lazy load config and MQTT client
      const config = this.getConfig();
      const MQTTClient = require('./src/mqtt/MQTTClient');

      // Ultra-fast connection with minimal setup
      console.log(`Ultra-fast connecting to MQTT broker at ${config.mqtt.host}`);
      this.mqttClient = new MQTTClient();

      // Set up message handler with image buffering during startup
      this.mqttClient.onMessage((topic, message) => this.handleMqttMessage(topic, message));

      // Connect to broker
      await this.mqttClient.connect();
      this.mqttReady = true;

      // Record connection time
      performanceMetrics.mqttConnected = Date.now() - performanceMetrics.startTimestamp;
      logPerformance('MQTT connected');

      return true;
    } catch (error) {
      console.error('MQTT initialization error:', error);
      return false;
    }
  }

  /**
   * Initialize low-priority components after critical startup
   */
  initLowPriorityComponents() {
    // Set up graceful shutdown
    this.setupGracefulShutdown();

    // Initialize GPIO in background
    try {
      const GPIOHandler = require('./src/gpio/GPIOHandler');
      this.gpioHandler = new GPIOHandler();
      this.gpioHandler.init();
      logPerformance('GPIO initialization completed');
    } catch (error) {
      console.log('GPIO shutdown switch feature is disabled');
      logPerformance('GPIO initialization completed');
    }
  }

  /**
   * Get configuration with lazy loading
   */
  getConfig() {
    if (!this.config) {
      this.config = require('./src/config/ConfigManager');
    }
    return this.config;
  }

  /**
   * Process any buffered images that arrived during initialization
   */
  processBufferedImage() {
    if (imageBuffer && this.displayReady) {
      console.log(`Processing buffered image received during initialization`);
      this.displayImage(imageBuffer);
      imageBuffer = null;
    }
  }

  /**
   * Handle incoming MQTT messages with buffering during startup
   */
  handleMqttMessage(topic, message) {
    const config = this.getConfig();

    // Handle image display messages
    if (topic.includes('/image/display')) {
      console.log(`Received image message on topic: ${topic}`);
      const elapsed = Date.now() - performanceMetrics.startTimestamp;
      console.log(`Received image after ${elapsed}ms`);
      performanceMetrics.imageReceived = elapsed;
      logPerformance('Image received');

      if (this.displayReady) {
        this.displayImage(message);
      } else {
        // Buffer the image for later display
        console.log('Display not ready, buffering image for later');
        imageBuffer = message;
      }
    }

    // Handle configuration messages
    else if (topic.includes('/config')) {
      console.log(`Received config message on topic: ${topic}`);
      logPerformance('Config message received');
      try {
        const configUpdate = JSON.parse(message.toString());
        console.log('Received configuration update');
        // Apply config updates
      } catch (error) {
        console.error('Error parsing config message:', error);
      }
    }
  }

  /**
   * Display an image on the e-ink screen
   */
  async displayImage(imageData) {
    try {
      console.log('Displaying image on e-ink screen');
      await this.displayController.displayImage(imageData);

      // Save image for fast startup next time
      this.saveLatestImage(imageData);

      const elapsed = Date.now() - performanceMetrics.startTimestamp;
      const imageTime = elapsed - performanceMetrics.imageReceived;
      console.log(`Image displayed in ${imageTime.toFixed(2)}ms (total: ${elapsed}ms)`);
      performanceMetrics.imageDisplayed = elapsed;
      logPerformance('Image displayed');

      this.logPerformanceReport();
    } catch (error) {
      console.error('Error displaying image:', error);
    }
  }

  /**
   * Save the latest image for faster startup next time
   */
  saveLatestImage(imageData) {
    try {
      // Create directory if it doesn't exist
      const deviceFolder = deviceId.replace(/:/g, '_');
      const dirPath = path.join(__dirname, 'images', deviceFolder);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Save image
      const imagePath = path.join(dirPath, 'latest_image.jpg');
      fs.writeFile(imagePath, imageData, err => {
        if (err) console.error('Error saving latest image:', err);
      });
    } catch (error) {
      console.error('Error saving latest image:', error);
    }
  }

  /**
   * Log performance metrics
   */
  logPerformanceReport() {
    console.log('--- PERFORMANCE REPORT ---');
    console.log(`Display initialization: ${performanceMetrics.displayInitialized}ms`);
    console.log(`MQTT connection: ${performanceMetrics.mqttConnected}ms`);
    console.log(`Image reception: ${performanceMetrics.imageReceived}ms`);
    console.log(`Image displayed: ${performanceMetrics.imageDisplayed}ms`);
    console.log(`App fully initialized: ${performanceMetrics.appFullyInitialized}ms`);
    console.log('-------------------------');
  }

  /**
   * Set up graceful shutdown handlers
   */
  setupGracefulShutdown() {
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Clean shutdown of the application
   */
  shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    console.log('Shutting down einkframe client...');

    // Close MQTT connection
    if (this.mqttClient) {
      this.mqttClient.disconnect();
    }

    // Close display
    if (this.displayController) {
      this.displayController.close();
    }

    // Clean up GPIO
    if (this.gpioHandler) {
      this.gpioHandler.cleanup();
    }

    console.log('Shutdown complete.');
    process.exit(0);
  }
}

// Create and initialize the application
const app = new Application();
app.init().catch(error => {
  console.error('Fatal error during application initialization:', error);
});
