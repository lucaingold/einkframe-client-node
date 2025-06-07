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
      handleImageMessage: this.handleImageMessage.bind(this)
    });
    this.gpioHandler = new GPIOHandler();
    this.imageDisplayed = false;
  }

  /**
   * Initialize the application
   */
  init() {
    console.log(`MQTT client for einkframe starting...`);
    console.log(`Filtering messages for device ID: ${config.device.id}`);

    // Initialize display
    this.displayController.init();

    // Initialize GPIO handler for shutdown switch
    this.gpioHandler.init();

    // Connect to MQTT broker
    this.mqttClient.connect();

    // Set up clean shutdown
    this.setupGracefulShutdown();

    console.log('MQTT client for einkframe started');
  }

  /**
   * Handle image messages from MQTT
   * @param {Buffer} imageData - The image data from MQTT
   */
  async handleImageMessage(imageData) {
    try {
      console.log('Displaying image on e-ink screen');
      await this.displayController.displayImage(imageData);
      this.imageDisplayed = true;

      // Check if shutdown switch is on and this is the first image displayed
      if (this.imageDisplayed && this.gpioHandler.isShutdownSwitchOn()) {
        console.log('First image displayed and shutdown switch is ON');
        this.gpioHandler.shutdownSystem();
      }
    } catch (error) {
      console.error('Error displaying image:', error);
    }
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
