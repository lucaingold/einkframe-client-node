/**
 * MQTT Client for einkframe
 * This client connects to an MQTT broker, subscribes to topics for receiving images,
 * and displays them on an IT8951 e-ink display.
 */

// Track performance metrics
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

// Import dependencies
const config = require('./src/config/ConfigManager');
const DisplayController = require('./src/display/DisplayController');
const MQTTClient = require('./src/mqtt/MQTTClient');
const imageBuffer = require('./src/util/ImageBuffer');

// Defer non-critical requires
let GPIOHandler = null;

class Application {
  constructor() {
    this.displayController = null; // Will initialize in parallel
    this.mqttClient = null;        // Will initialize in parallel
    this.gpioHandler = null;       // Will initialize with delay
    this.imageProcessed = false;
    this.configProcessed = false;
    this.shuttingDown = false;
    this.displayInitialized = false;

    // Performance tracking
    logPerformance('Application constructor completed');
  }

  /**
   * Initialize the application with parallel processing
   */
  async init() {
    console.log(`Starting einkframe client for device: ${config.device.id}`);

    // Start both critical components in parallel
    const initPromises = [
      this.initializeDisplayAsync(),  // Start display initialization
      this.initializeMQTTAsync()      // Start MQTT in parallel
    ];

    // Initialize GPIO handler with delay (lowest priority)
    setTimeout(() => this.initializeGPIO(), 1000);

    // Set up clean shutdown
    this.setupGracefulShutdown();

    // Wait for all critical components to initialize (with timeout protection)
    try {
      await Promise.race([
        Promise.all(initPromises),
        new Promise(resolve => setTimeout(resolve, 15000)) // Safety timeout
      ]);
    } catch (error) {
      console.error('Error initializing components:', error);
    }

    // Mark application as fully initialized
    performanceMetrics.appFullyInitialized = Date.now() - performanceMetrics.startTimestamp;
    console.log('Application startup complete - ready for image display');
    console.log(`[PERFORMANCE] App fully initialized in ${performanceMetrics.appFullyInitialized}ms`);

    // Log performance metrics
    this.logPerformanceReport();

    // Check for buffered images
    this.processBufferedImage();

    return true;
  }

  /**
   * Initialize display asynchronously
   */
  async initializeDisplayAsync() {
    try {
      console.log('Initializing display controller asynchronously');
      this.displayController = new DisplayController();
      await this.displayController.init();
      this.displayInitialized = true;

      // Track performance metrics
      performanceMetrics.displayInitialized = Date.now() - performanceMetrics.startTimestamp;
      logPerformance('Display initialization completed');

      console.log('Display ready for immediate rendering');

      // Listen for new images
      imageBuffer.onNewImage(imageData => {
        if (this.displayInitialized) {
          console.log('Processing new image from buffer');
          this.displayImage(imageData);
        }
      });

      // Process any image received during initialization
      this.processBufferedImage();

      return true;
    } catch (error) {
      console.error('Error initializing display:', error);
      return false;
    }
  }

  /**
   * Initialize MQTT client asynchronously
   */
  async initializeMQTTAsync() {
    try {
      console.log('Initializing MQTT client asynchronously');
      this.mqttClient = new MQTTClient({
        handleImageMessage: this.handleImageMessage.bind(this),
        handleConfigMessage: this.handleConfigMessage.bind(this),
        onMqttConnected: this.handleMqttConnected.bind(this)
      });

      // Connect to the broker
      await this.mqttClient.connect();

      return true;
    } catch (error) {
      console.error('Error initializing MQTT:', error);
      return false;
    }
  }

  /**
   * Initialize GPIO with delay
   */
  initializeGPIO() {
    try {
      if (!GPIOHandler) {
        GPIOHandler = require('./src/gpio/GPIOHandler');
      }
      this.gpioHandler = new GPIOHandler();
      this.gpioHandler.init();
      logPerformance('GPIO initialization completed');
    } catch (error) {
      console.error('Error initializing GPIO:', error);
    }
  }

  /**
   * Handler for MQTT connection established event
   */
  handleMqttConnected() {
    performanceMetrics.mqttConnected = Date.now() - performanceMetrics.startTimestamp;
    console.log(`MQTT connection established in ${performanceMetrics.mqttConnected}ms - ready for images`);
    logPerformance('MQTT connected');
    this.checkAutoShutdown();
  }

  /**
   * Handle image messages from MQTT with buffering support
   * @param {Buffer} imageData - The image data from MQTT
   */
  async handleImageMessage(imageData) {
    // Record image received time
    performanceMetrics.imageReceived = Date.now() - performanceMetrics.startTimestamp;
    console.log(`Received image after ${performanceMetrics.imageReceived}ms - buffering for display`);
    logPerformance('Image received');

    // Add to buffer regardless of display state
    imageBuffer.storeImage(imageData);

    // Display immediately if possible
    if (this.displayInitialized) {
      await this.displayImage(imageData);
    } else {
      console.log('Display not ready, image buffered for later display');
    }
  }

  /**
   * Process any image that was buffered during initialization
   */
  async processBufferedImage() {
    if (this.displayInitialized && imageBuffer.hasImage()) {
      const image = imageBuffer.getImage();
      console.log(`Processing buffered image (age: ${image.age}ms)`);
      await this.displayImage(image.data);
      imageBuffer.clear();
    }
  }

  /**
   * Display image on the e-ink display
   * @param {Buffer} imageData - Image data to display
   */
  async displayImage(imageData) {
    try {
      console.log('Displaying image on e-ink screen');

      // Track image display time
      const displayStart = process.hrtime();
      await this.displayController.displayImage(imageData);
      const elapsed = process.hrtime(displayStart);
      const renderTimeMs = (elapsed[0] * 1000 + elapsed[1] / 1000000).toFixed(2);

      // Update performance metrics
      this.imageProcessed = true;
      performanceMetrics.imageDisplayed = Date.now() - performanceMetrics.startTimestamp;

      console.log(`Image displayed in ${renderTimeMs}ms (total time from startup: ${performanceMetrics.imageDisplayed}ms)`);
      logPerformance('Image displayed');

      // Update performance report
      this.logPerformanceReport();

      // Check auto-shutdown
      this.checkAutoShutdown();
    } catch (error) {
      console.error('Error displaying image:', error);
    }
  }

  /**
   * Handle configuration messages from MQTT
   * @param {Buffer} messageData - The config data from MQTT
   */
  handleConfigMessage(messageData) {
    try {
      console.log('Received configuration update');
      logPerformance('Config message received');

      // Update configuration
      const configData = JSON.parse(messageData.toString());
      config.updateConfig(configData);
      this.configProcessed = true;

      // Apply display brightness if initialized
      if (this.displayInitialized) {
        this.displayController.setBrightness(config.display.brightness);
      }

      // Check for auto-shutdown
      this.checkAutoShutdown();
    } catch (error) {
      console.error('Error processing configuration message:', error);
    }
  }

  /**
   * Log a performance report
   */
  logPerformanceReport() {
    console.log('\n--- PERFORMANCE REPORT ---');
    console.log(`Display initialization: ${performanceMetrics.displayInitialized}ms`);
    console.log(`MQTT connection: ${performanceMetrics.mqttConnected > 0 ? performanceMetrics.mqttConnected + 'ms' : 'not yet connected'}`);
    console.log(`Image reception: ${performanceMetrics.imageReceived > 0 ? performanceMetrics.imageReceived + 'ms' : 'no image received yet'}`);
    console.log(`Image displayed: ${performanceMetrics.imageDisplayed > 0 ? performanceMetrics.imageDisplayed + 'ms' : 'no image displayed yet'}`);
    console.log(`App fully initialized: ${performanceMetrics.appFullyInitialized}ms`);
    console.log('-------------------------\n');

    // Schedule future performance report if needed
    if (performanceMetrics.imageDisplayed === 0) {
      setTimeout(() => this.logPerformanceReport(), 10000);
    }
  }

  /**
   * Check if we need to auto-shutdown the system
   */
  checkAutoShutdown() {
    // Only consider auto-shutdown if MQTT is properly connected
    if (!this.mqttClient || !this.mqttClient.isConnected) {
      return;
    }

    // Auto-shutdown conditions
    if (this.imageProcessed && this.configProcessed && config.autoShutdown.enabled) {
      console.log('Auto-shutdown conditions met');
      this.shutdownSystem();
    }
  }

  /**
   * Shutdown the system
   */
  shutdownSystem() {
    // Prevent multiple shutdown calls
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;

    console.log('Auto-shutdown initiated...');

    // Wait a moment to allow logs to be written
    setTimeout(async () => {
      console.log('Closing MQTT connection and e-ink display');

      if (this.mqttClient) {
        await this.mqttClient.disconnect();
      }

      if (this.displayController) {
        this.displayController.close();
      }

      if (this.gpioHandler) {
        this.gpioHandler.close();
        this.gpioHandler.shutdownSystem();
      }
    }, 2000);
  }

  /**
   * Set up graceful shutdown handlers
   */
  setupGracefulShutdown() {
    process.on('SIGINT', async () => {
      console.log('Graceful shutdown initiated');

      if (this.mqttClient) {
        await this.mqttClient.disconnect();
      }

      if (this.displayController) {
        this.displayController.close();
      }

      if (this.gpioHandler) {
        this.gpioHandler.close();
      }

      process.exit(0);
    });
  }
}

// Start the application with parallel initialization
console.log('Starting einkframe client...');
const app = new Application();
app.init().catch(err => {
  console.error('Application initialization error:', err);
});
