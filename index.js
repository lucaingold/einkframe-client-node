/**
 * MQTT Client for einkframe
 * This client connects to an MQTT broker and displays images on an IT8951 e-ink display.
 * Optimized for fastest startup and image display with parallel initialization.
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

// Core dependencies
const config = require('./src/config/ConfigManager');
const DisplayController = require('./src/display/DisplayController');
const MQTTClient = require('./src/mqtt/MQTTClient');

// Defer GPIO loading for speed
let GPIOHandler = null;

// Simple buffer for images received during startup
let bufferedImage = null;
let bufferedImageTime = 0;

class Application {
  constructor() {
    this.displayController = null;
    this.mqttClient = null;
    this.gpioHandler = null;
    this.imageProcessed = false;
    this.configProcessed = false;
    this.shuttingDown = false;
    this.displayInitialized = false;

    logPerformance('Application constructor completed');
  }

  /**
   * Initialize application with parallel processing
   */
  async init() {
    console.log(`Starting einkframe client for device: ${config.device.id}`);

    // Run display and MQTT initialization in parallel
    console.log('Starting parallel initialization');

    const displayPromise = this.initDisplayAsync();
    const mqttPromise = this.initMqttAsync();

    // Start GPIO in background
    setTimeout(() => this.initGpio(), 1000);

    // Set up clean shutdown
    this.setupGracefulShutdown();

    // Wait for critical components with timeout
    try {
      await Promise.race([
        Promise.all([displayPromise, mqttPromise]),
        new Promise(resolve => setTimeout(resolve, 15000)) // Safety timeout
      ]);
    } catch (error) {
      console.error('Error during initialization:', error);
    }

    // Mark as fully initialized
    performanceMetrics.appFullyInitialized = Date.now() - performanceMetrics.startTimestamp;
    console.log(`[PERFORMANCE] App fully initialized in ${performanceMetrics.appFullyInitialized}ms`);

    // Print performance report
    this.logPerformanceReport();

    // Process any image that arrived during initialization
    this.processBufferedImage();
  }

  /**
   * Initialize display controller
   */
  async initDisplayAsync() {
    try {
      console.log('Initializing display controller');
      this.displayController = new DisplayController();
      await this.displayController.init();
      this.displayInitialized = true;

      // Record metrics
      performanceMetrics.displayInitialized = Date.now() - performanceMetrics.startTimestamp;
      logPerformance('Display initialization completed');

      console.log('Display ready - checking for buffered images');
      this.processBufferedImage();

      return true;
    } catch (error) {
      console.error('Display initialization error:', error);
      return false;
    }
  }

  /**
   * Initialize MQTT client
   */
  async initMqttAsync() {
    try {
      console.log('Initializing MQTT client');
      this.mqttClient = new MQTTClient({
        handleImageMessage: this.handleImageMessage.bind(this),
        handleConfigMessage: this.handleConfigMessage.bind(this),
        onMqttConnected: this.handleMqttConnected.bind(this)
      });

      await this.mqttClient.connect();
      return true;
    } catch (error) {
      console.error('MQTT initialization error:', error);
      return false;
    }
  }

  /**
   * Initialize GPIO with delay
   */
  initGpio() {
    try {
      if (!GPIOHandler) {
        GPIOHandler = require('./src/gpio/GPIOHandler');
      }
      this.gpioHandler = new GPIOHandler();
      this.gpioHandler.init();
      logPerformance('GPIO initialization completed');
    } catch (error) {
      console.error('GPIO initialization error:', error);
    }
  }

  /**
   * Handle MQTT connection established
   */
  handleMqttConnected() {
    performanceMetrics.mqttConnected = Date.now() - performanceMetrics.startTimestamp;
    console.log(`MQTT connection established in ${performanceMetrics.mqttConnected}ms`);
    logPerformance('MQTT connected');
    this.checkAutoShutdown();
  }

  /**
   * Handle image messages from MQTT
   */
  async handleImageMessage(imageData) {
    // Record time
    performanceMetrics.imageReceived = Date.now() - performanceMetrics.startTimestamp;
    console.log(`Received image after ${performanceMetrics.imageReceived}ms`);
    logPerformance('Image received');

    if (!this.displayInitialized) {
      // Buffer the image if display isn't ready yet
      console.log('Display not ready - buffering image for later');
      bufferedImage = imageData;
      bufferedImageTime = Date.now();
      return;
    }

    // Process image immediately
    await this.displayImage(imageData);
  }

  /**
   * Process buffered image if available
   */
  async processBufferedImage() {
    if (this.displayInitialized && bufferedImage) {
      const imageAge = Date.now() - bufferedImageTime;
      console.log(`Processing buffered image (received ${imageAge}ms ago)`);

      const image = bufferedImage;
      bufferedImage = null;

      await this.displayImage(image);
    }
  }

  /**
   * Display image on e-ink screen
   */
  async displayImage(imageData) {
    try {
      console.log('Displaying image on e-ink screen');

      // Track timing
      const displayStart = process.hrtime();
      await this.displayController.displayImage(imageData);
      const elapsed = process.hrtime(displayStart);
      const renderTimeMs = (elapsed[0] * 1000 + elapsed[1] / 1000000).toFixed(2);

      // Update metrics
      this.imageProcessed = true;
      performanceMetrics.imageDisplayed = Date.now() - performanceMetrics.startTimestamp;

      console.log(`Image displayed in ${renderTimeMs}ms (total: ${performanceMetrics.imageDisplayed}ms)`);
      logPerformance('Image displayed');

      // Update report and check shutdown
      this.logPerformanceReport();
      this.checkAutoShutdown();
    } catch (error) {
      console.error('Error displaying image:', error);
    }
  }

  /**
   * Handle config messages
   */
  handleConfigMessage(messageData) {
    try {
      console.log('Received configuration update');
      logPerformance('Config message received');

      const configData = JSON.parse(messageData.toString());
      console.log('Parsed config data:', JSON.stringify(configData, null, 2));

      // Check if display configuration exists and properly extract brightness
      if (configData.display && configData.display.brightness !== undefined) {
        const brightness = parseFloat(configData.display.brightness);
        if (!isNaN(brightness)) {
          console.log(`Extracted brightness value from MQTT: ${brightness}`);

          // Ensure the display config object exists before updating
          if (!configData.display) configData.display = {};

          // Set the brightness explicitly to ensure it's a number
          configData.display.brightness = brightness;
        }
      } else if (configData.brightness !== undefined) {
        // Also check for top-level brightness field for compatibility
        const brightness = parseFloat(configData.brightness);
        if (!isNaN(brightness)) {
          console.log(`Extracted top-level brightness value from MQTT: ${brightness}`);

          // Ensure the display config object exists
          if (!configData.display) configData.display = {};

          // Set the brightness in the proper structure
          configData.display.brightness = brightness;
        }
      }

      // Update configuration
      config.updateConfig(configData);
      this.configProcessed = true;

      // Apply brightness if initialized
      if (this.displayInitialized && config.display.brightness !== undefined) {
        console.log(`Applying brightness value to display: ${config.display.brightness}`);
        this.displayController.setBrightness(config.display.brightness);
      }

      this.checkAutoShutdown();
    } catch (error) {
      console.error('Error processing config message:', error);
    }
  }

  /**
   * Log performance report
   */
  logPerformanceReport() {
    console.log('\n--- PERFORMANCE REPORT ---');
    console.log(`Display initialization: ${performanceMetrics.displayInitialized}ms`);
    console.log(`MQTT connection: ${performanceMetrics.mqttConnected > 0 ? performanceMetrics.mqttConnected + 'ms' : 'not yet connected'}`);
    console.log(`Image reception: ${performanceMetrics.imageReceived > 0 ? performanceMetrics.imageReceived + 'ms' : 'no image received yet'}`);
    console.log(`Image displayed: ${performanceMetrics.imageDisplayed > 0 ? performanceMetrics.imageDisplayed + 'ms' : 'no image displayed yet'}`);
    console.log(`App fully initialized: ${performanceMetrics.appFullyInitialized}ms`);
    console.log('-------------------------\n');

    // Schedule another report if needed
    if (performanceMetrics.imageDisplayed === 0) {
      setTimeout(() => this.logPerformanceReport(), 10000);
    }
  }

  /**
   * Check if auto-shutdown criteria are met
   */
  checkAutoShutdown() {
    if (!this.mqttClient || !this.mqttClient.isConnected) {
      return;
    }

    if (this.imageProcessed && this.configProcessed && config.autoShutdown.enabled) {
      console.log('Auto-shutdown conditions met');
      this.shutdownSystem();
    }
  }

  /**
   * Shutdown the system
   */
  shutdownSystem() {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;

    console.log('Auto-shutdown initiated...');

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
   * Set up graceful shutdown
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

// Start application
console.log('Starting einkframe client...');
const app = new Application();
app.init().catch(err => {
  console.error('Application initialization error:', err);
});
