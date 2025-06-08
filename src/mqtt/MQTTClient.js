/**
 * MQTTClient - Handles all MQTT connectivity and message processing
 */
const mqtt = require('mqtt');
const config = require('../config/ConfigManager');

class MQTTClient {
  constructor(messageHandler) {
    this.messageHandler = messageHandler;
    this.client = null;
    this.isConnected = false; // Add explicit connection state tracking
  }

  /**
   * Connect to the MQTT broker
   */
  connect() {
    console.log(`Connecting to MQTT broker at ${config.mqtt.broker.url}`);
    console.log(`Using client ID: ${config.mqtt.options.clientId}`);

    try {
      this.client = mqtt.connect(
        `mqtts://${config.mqtt.broker.url}`,
        { ...config.mqtt.options, port: config.mqtt.broker.port }
      );

      // Set up event handlers
      this.client.on('connect', () => this.handleConnect());
      this.client.on('message', (topic, message) => this.handleMessage(topic, message));
      this.client.on('error', (err) => this.handleError(err));
      this.client.on('close', () => this.handleClose());
      this.client.on('reconnect', () => this.handleReconnect());

      // Add more detailed connection problem handling
      this.client.on('disconnect', () => {
        this.isConnected = false;
        console.log('Disconnected from MQTT broker');
      });

      this.client.on('offline', () => {
        this.isConnected = false;
        console.log('MQTT client is offline');
      });

      // Add connection timeout handling
      setTimeout(() => {
        if (!this.client.connected) {
          console.error('MQTT connection timeout - could not connect within 30 seconds');
          console.error('Please check your credentials and network connection');
          console.error('Broker URL:', config.mqtt.broker.url);
          console.error('Username:', config.mqtt.options.username);
          console.error('Password:', config.mqtt.options.password ? '[PROVIDED]' : '[EMPTY]');
        }
      }, 30000);
    } catch (error) {
      console.error('Error creating MQTT connection:', error);
    }
  }

  /**
   * Handle successful connection to MQTT broker
   */
  handleConnect() {
    console.log('Connected to MQTT broker');
    this.isConnected = true; // Set connection state to true when connected

    // Notify any connection state listeners
    if (this.messageHandler.onMqttConnected) {
      this.messageHandler.onMqttConnected();
    }

    // Subscribe to image display topic for all devices
    this.client.subscribe(config.mqtt.topics.imageDisplay, { qos: 1 }, (err) => {
      if (err) {
        console.error('Error subscribing to image display topic:', err);
      } else {
        console.log(`Subscribed to topic: ${config.mqtt.topics.imageDisplay}`);
      }
    });

    // Subscribe to config topic for this device
    const configTopic = `device/${config.device.id}/config`;
    this.client.subscribe(configTopic, { qos: 1 }, (err) => {
      if (err) {
        console.error('Error subscribing to config topic:', err);
      } else {
        console.log(`Subscribed to topic: ${configTopic}`);
      }
    });
  }

  /**
   * Handle incoming MQTT messages
   * @param {string} topic - The topic the message was received on
   * @param {Buffer} message - The message payload
   */
  async handleMessage(topic, message) {
    try {
      console.log(`Received message on topic: ${topic}`);

      // Parse device ID from topic
      const deviceId = this.extractDeviceIdFromTopic(topic);

      // Only process messages for the specific device ID
      if (deviceId !== config.device.id) {
        console.log(`Ignoring message for device ${deviceId} - not the target device`);
        return;
      }

      if (topic.includes('image/display')) {
        // Pass the message to the handler
        await this.messageHandler.handleImageMessage(message);
      } else if (topic.includes('/config')) {
        // Handle configuration message
        this.messageHandler.handleConfigMessage(message);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  /**
   * Handle MQTT client errors
   * @param {Error} err - The error object
   */
  handleError(err) {
    console.error('MQTT client error:', err.message);
    console.error('Error details:', err);

    // Common error troubleshooting tips
    if (err.message.includes('not authorized')) {
      console.error('Authentication failed. Please check your username and password.');
    } else if (err.message.includes('connection refused')) {
      console.error('Connection refused. Please check your broker URL and port.');
    } else if (err.message.includes('SSL')) {
      console.error('SSL/TLS error. There might be an issue with the secure connection.');
    }
  }

  /**
   * Handle MQTT connection close
   */
  handleClose() {
    console.log('Connection to MQTT broker closed');
  }

  /**
   * Handle MQTT reconnection attempts
   */
  handleReconnect() {
    console.log('Attempting to reconnect to MQTT broker');
  }

  /**
   * Extract device ID from MQTT topic
   * @param {string} topic - The MQTT topic
   * @returns {string} The device ID
   */
  extractDeviceIdFromTopic(topic) {
    // Expected format: device/<deviceId>/image/display or device/<deviceId>/status/online
    const parts = topic.split('/');
    return parts.length >= 3 ? parts[1] : 'unknown';
  }

  /**
   * Close the MQTT client connection
   * @returns {Promise} Promise that resolves when the client is closed
   */
  disconnect() {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(true, () => {
          console.log('MQTT client disconnected');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = MQTTClient;
