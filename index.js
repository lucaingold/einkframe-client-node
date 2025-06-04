/**
 * MQTT Client for einkframe
 * This client connects to an MQTT broker, subscribes to topics for receiving images,
 * and displays them on an IT8951 e-ink display.
 */

const DisplayController = require('./src/display/DisplayController');
const MQTTClient = require('./src/mqtt/MQTTClient');
const config = require('./src/config/ConfigManager');

class Application {
  constructor() {
    this.displayController = new DisplayController();
    this.mqttClient = new MQTTClient({
      handleImageMessage: this.handleImageMessage.bind(this)
    });
  }

  /**
   * Initialize the application
   */
  init() {
    console.log(`MQTT client for einkframe starting...`);
    console.log(`Filtering messages for device ID: ${config.device.id}`);

    // Initialize display
    this.displayController.init();

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
    await this.displayController.displayImage(imageData);
  }

  /**
   * Set up graceful shutdown handlers
   */
  setupGracefulShutdown() {
    process.on('SIGINT', async () => {
      console.log('Closing MQTT connection and e-ink display');

      await this.mqttClient.disconnect();
      this.displayController.close();

      process.exit(0);
    });
  }
}

// Start the application
const app = new Application();
app.init();
