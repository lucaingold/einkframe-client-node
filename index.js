/**
 * MQTT Client for einkframe
 * This client connects to an MQTT broker, subscribes to topics for receiving images,
 * and displays them on an IT8951 e-ink display.
 */

const DisplayController = require('./src/display/DisplayController');
const MQTTClient = require('./src/mqtt/MQTTClient');
const GPIOHandler = require('./src/gpio/GPIOHandler');
const config = require('./src/config/ConfigManager');

class Application {
  constructor() {
    this.displayController = new DisplayController();
    this.mqttClient = new MQTTClient({
      handleImageMessage: this.handleImageMessage.bind(this),
      handleConfigMessage: this.handleConfigMessage.bind(this)
    });
    this.gpioHandler = new GPIOHandler();
    this.imageProcessed = false;  // Track if at least one image message has been processed
    this.configProcessed = false; // Track if at least one config message has been processed
    this.shuttingDown = false;    // Prevent multiple shutdown attempts
    this.mqttConnected = false;   // Track if MQTT is properly connected
  }

  /**
   * Initialize the application
   */
  init() {
    console.log(`MQTT client for einkframe starting...`);
    console.log(`Filtering messages for device ID: ${config.device.id}`);

    // Initialize display
    this.displayController.init();

    // Initialize GPIO handler (but don't rely on it for auto-shutdown)
    this.gpioHandler.init();

    // Setup MQTT event handlers to track connection status
    this.setupMqttEventHandlers();

    // Connect to MQTT broker
    this.mqttClient.connect();

    // Set up clean shutdown
    this.setupGracefulShutdown();

    console.log('MQTT client for einkframe started');
  }

  /**
   * Setup MQTT event handlers to track connection status
   */
  setupMqttEventHandlers() {
    // Add handlers for connection status
    if (this.mqttClient.client) {
      this.mqttClient.client.on('connect', () => {
        this.mqttConnected = true;
        console.log('MQTT connection established - auto-shutdown logic enabled');
      });

      this.mqttClient.client.on('error', () => {
        this.mqttConnected = false;
        console.log('MQTT connection error - auto-shutdown logic disabled');
      });

      this.mqttClient.client.on('close', () => {
        this.mqttConnected = false;
        console.log('MQTT connection closed - auto-shutdown logic disabled');
      });
    }
  }

  /**
   * Handle image messages from MQTT
   * @param {Buffer} imageData - The image data from MQTT
   */
  async handleImageMessage(imageData) {
    try {
      console.log('Displaying image on e-ink screen');
      await this.displayController.displayImage(imageData);
      this.imageProcessed = true;  // Mark that we've processed an image message

      // Check for auto-shutdown after displaying image
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
      const configData = JSON.parse(messageData.toString());
      console.log('Received configuration update:', configData);

      // Update configuration
      config.updateConfig(configData);
      this.configProcessed = true;  // Mark that we've processed a config message

      // Apply display brightness if it was updated
      if (this.displayController.isInitialized) {
        this.displayController.setBrightness(config.display.brightness);
      }

      // Check for auto-shutdown after receiving config
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
    if (!this.mqttConnected) {
      console.log('Auto-shutdown check skipped - MQTT not connected');
      return;
    }

    // Auto-shutdown is only allowed if both an image message AND a config message have been processed
    if (this.imageProcessed && this.configProcessed && config.autoShutdown.enabled) {
      console.log('Auto-shutdown conditions met: image processed, config processed, and auto-shutdown enabled');
      this.shutdownSystem();
    } else {
      console.log(`Auto-shutdown status: MQTT connected=${this.mqttConnected}, image processed=${this.imageProcessed}, config processed=${this.configProcessed}, auto-shutdown enabled=${config.autoShutdown.enabled}`);
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
      await this.mqttClient.disconnect();
      this.displayController.close();
      this.gpioHandler.close();

      // Use the GPIOHandler's shutdownSystem method which has the appropriate OS checks
      this.gpioHandler.shutdownSystem();
    }, 2000);
  }

  /**
   * Set up graceful shutdown handlers
   */
  setupGracefulShutdown() {
    process.on('SIGINT', async () => {
      console.log('Closing MQTT connection and e-ink display');

      await this.mqttClient.disconnect();
      this.displayController.close();
      this.gpioHandler.close();

      process.exit(0);
    });
  }
}

// Start the application
const app = new Application();
app.init();
