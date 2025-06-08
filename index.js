/**
 * MQTT Client for einkframe
 * This client connects to an MQTT broker, subscribes to topics for receiving images,
 * and displays them on an IT8951 e-ink display.
 * Optimized for fastest possible startup and image display.
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

// Pre-optimized with lazy loading
const config = require('./src/config/ConfigManager');
const DisplayController = require('./src/display/DisplayController');
const MQTTClient = require('./src/mqtt/MQTTClient');

// Defer non-critical requires
let GPIOHandler = null;

class Application {
  constructor() {
    this.displayController = new DisplayController();
    this.mqttClient = null; // Initialize later for faster startup
    this.gpioHandler = null; // Initialize later for faster startup
    this.imageProcessed = false;
    this.configProcessed = false;
    this.shuttingDown = false;
    this.displayInitialized = false;

    // Performance tracking
    logPerformance('Application constructor completed');
  }

  /**
   * Initialize the application with extreme startup optimizations
   */
  async init() {
    console.log(`Starting einkframe client for device: ${config.device.id}`);

    // Start display initialization immediately (highest priority)
    await this.initDisplayFast();

    // Create MQTT client and connect in parallel (don't await)
    this.startMQTTConnection();

    // Initialize GPIO handler with lowest priority (non-blocking)
    this.initGPIOWithDelay();

    // Set up clean shutdown (non-blocking)
    this.setupGracefulShutdown();

    // Mark application as fully initialized
    performanceMetrics.appFullyInitialized = Date.now() - performanceMetrics.startTimestamp;
    console.log('Application startup complete - ready for image display');
    console.log(`[PERFORMANCE] App fully initialized in ${performanceMetrics.appFullyInitialized}ms`);

    // Print performance report
    this.logPerformanceReport();

    return true;
  }

  /**
   * Log a complete performance report
   */
  logPerformanceReport() {
    console.log('\n--- PERFORMANCE REPORT ---');
    console.log(`Display initialization: ${performanceMetrics.displayInitialized}ms`);
    console.log(`MQTT connection: ${performanceMetrics.mqttConnected > 0 ? performanceMetrics.mqttConnected + 'ms' : 'not yet connected'}`);
    console.log(`Image reception: ${performanceMetrics.imageReceived > 0 ? performanceMetrics.imageReceived + 'ms' : 'no image received yet'}`);
    console.log(`Image displayed: ${performanceMetrics.imageDisplayed > 0 ? performanceMetrics.imageDisplayed + 'ms' : 'no image displayed yet'}`);
    console.log(`App fully initialized: ${performanceMetrics.appFullyInitialized}ms`);
    console.log('-------------------------\n');

    // Schedule future performance report for image display if not yet received
    if (performanceMetrics.imageDisplayed === 0) {
      setTimeout(() => this.logPerformanceReport(), 10000);
    }
  }

  /**
   * Fast display initialization
   */
  async initDisplayFast() {
    try {
      const startDisplayInit = process.hrtime();
      console.log('Initializing display with highest priority');
      await this.displayController.init();
      this.displayInitialized = true;

      // Track performance
      performanceMetrics.displayInitialized = Date.now() - performanceMetrics.startTimestamp;
      logPerformance('Display initialization completed');

      console.log('Display ready for immediate rendering');
    } catch (error) {
      console.error('Display initialization error:', error);
    }
  }

  /**
   * Start MQTT connection without blocking startup
   */
  startMQTTConnection() {
    // Create the MQTT client with handlers
    this.mqttClient = new MQTTClient({
      handleImageMessage: this.handleImageMessage.bind(this),
      handleConfigMessage: this.handleConfigMessage.bind(this),
      onMqttConnected: this.handleMqttConnected.bind(this)
    });

    // Connect without blocking the main initialization flow
    console.log('Starting MQTT connection asynchronously');
    this.mqttClient.connect().catch(err => {
      console.error('MQTT connection error, will retry:', err.message);
    });

    logPerformance('MQTT client created and connection initiated');
  }

  /**
   * Init GPIO with delay to prioritize display and MQTT
   */
  initGPIOWithDelay() {
    // Delay GPIO initialization to prioritize display and MQTT
    setTimeout(() => {
      if (!GPIOHandler) {
        GPIOHandler = require('./src/gpio/GPIOHandler');
      }
      this.gpioHandler = new GPIOHandler();
      this.gpioHandler.init();
      logPerformance('GPIO initialization completed');
    }, 1000);
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
   * Handle image messages with highest priority
   * @param {Buffer} imageData - The image data from MQTT
   */
  async handleImageMessage(imageData) {
    // Record image received time
    performanceMetrics.imageReceived = Date.now() - performanceMetrics.startTimestamp;
    console.log(`Received image after ${performanceMetrics.imageReceived}ms - displaying with high priority`);
    logPerformance('Image received');

    try {
      // Ensure display is initialized
      if (!this.displayInitialized) {
        console.log('Waiting for display to initialize...');
        await this.waitForDisplay(5000);
      }

      // Display image immediately
      const imageDisplayStart = process.hrtime();
      await this.displayController.displayImage(imageData);
      const elapsed = process.hrtime(imageDisplayStart);
      const renderTimeMs = (elapsed[0] * 1000 + elapsed[1] / 1000000).toFixed(2);

      // Record performance metrics
      this.imageProcessed = true;
      performanceMetrics.imageDisplayed = Date.now() - performanceMetrics.startTimestamp;

      console.log(`Image displayed in ${renderTimeMs}ms (total time from startup: ${performanceMetrics.imageDisplayed}ms)`);
      logPerformance('Image displayed');

      // Log complete performance report now that image is displayed
      this.logPerformanceReport();

      // Check auto-shutdown
      this.checkAutoShutdown();
    } catch (error) {
      console.error('Error displaying image:', error);
    }
  }

  /**
   * Wait for display to initialize
   */
  waitForDisplay(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (this.displayInitialized) {
        return resolve();
      }

      const startTime = Date.now();
      const interval = setInterval(() => {
        if (this.displayInitialized) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(new Error('Display initialization timeout'));
        }
      }, 100);
    });
  }

  /**
   * Handle configuration messages - lower priority
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

// Start the application with immediate execution
console.log('Starting einkframe client...');
const app = new Application();
app.init().catch(err => {
  console.error('Application initialization error:', err);
});
