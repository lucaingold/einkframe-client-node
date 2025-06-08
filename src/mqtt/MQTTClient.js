/**
 * MQTTClient - Handles all MQTT connectivity and message processing
 * Optimized for fastest possible image reception
 */
const mqtt = require('mqtt');
const config = require('../config/ConfigManager');

class MQTTClient {
  constructor(messageHandler) {
    this.messageHandler = messageHandler;
    this.client = null;
    this.isConnected = false;
    this.connectionPromise = null;
    this.reconnecting = false;

    // Track subscription status to avoid duplicate subscriptions
    this.topicsSubscribed = new Set();

    // Connection attempt counter for progressive backoff
    this.connectionAttempts = 0;
  }

  /**
   * Connect to the MQTT broker with extreme optimization for fast startup
   * @returns {Promise} Promise that resolves when connected or rejects on error
   */
  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    console.log(`Ultra-fast connecting to MQTT broker at ${config.mqtt.broker.url}`);

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        // Extreme optimization settings for fastest possible connection
        const optimizedOptions = {
          ...config.mqtt.options,
          port: config.mqtt.broker.port,
          connectTimeout: 3000,          // Very aggressive timeout
          reconnectPeriod: 1000,         // Very fast reconnection attempts
          rejectUnauthorized: false,     // Skip TLS verification for speed
          clean: true,                   // Clean session for fresh start
          keepalive: 60,                 // Standard keepalive
          protocolVersion: 5,            // Use MQTT 5.0 if supported by broker
          properties: {                  // MQTT 5.0 specific properties
            requestResponseInformation: true,
            requestProblemInformation: true,
            receiveMaximum: 1000,
            topicAliasMaximum: 10,
          },
          // Immediate session control
          sessionExpiryInterval: 0       // Don't persist session - for clean startup
        };

        // Create client with optimized options
        this.client = mqtt.connect(
          `mqtts://${config.mqtt.broker.url}`,
          optimizedOptions
        );

        // Use a shorter timeout for first connection
        const connectionTimeoutMs = 5000;
        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            console.warn('MQTT connection taking longer than expected - continuing startup');
            // Subscribe to topics even without confirmed connection
            this.subscribeToTopics();
            resolve(); // Resolve anyway to not block the app
          }
        }, connectionTimeoutMs);

        // Set up event handlers with optimized ordering
        // Connect first for fastest setup
        this.client.on('connect', () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          this.connectionAttempts = 0;

          // Subscribe to topics immediately on connect
          this.subscribeToTopics();

          // Only after subscription, tell the app we're connected
          this.handleConnect();
          resolve();
        });

        // Prioritize message handler for fastest image reception
        this.client.on('message', (topic, message) => {
          // Optimize message processing based on topic
          if (topic.includes('image/display')) {
            this.handlePriorityMessage(topic, message);
          } else {
            this.handleNormalMessage(topic, message);
          }
        });

        // Lower priority event handlers
        this.client.on('error', (err) => this.handleError(err, reject, connectionTimeout));
        this.client.on('close', () => this.handleClose());
        this.client.on('reconnect', () => this.handleReconnect());
        this.client.on('disconnect', () => {
          this.isConnected = false;
          console.log('MQTT client disconnected');
        });
        this.client.on('offline', () => {
          this.isConnected = false;
          console.log('MQTT client is offline');
        });

      } catch (error) {
        console.error('Error creating MQTT connection:', error);
        this.connectionPromise = null;
        // Don't reject - let the app continue without MQTT if needed
        resolve();
      }
    });

    return this.connectionPromise;
  }

  /**
   * Subscribe to required topics with optimization for image topic
   */
  subscribeToTopics() {
    // Skip if we've already subscribed
    if (this.topicsSubscribed.size > 0) return;

    // Subscribe to image topic first with highest priority
    const imageTopic = config.mqtt.topics.imageDisplay;
    if (imageTopic && !this.topicsSubscribed.has(imageTopic)) {
      this.client.subscribe(imageTopic, { qos: 1 }, (err) => {
        if (err) {
          console.error('Error subscribing to image topic:', err);
        } else {
          console.log(`Subscribed to image topic: ${imageTopic}`);
          this.topicsSubscribed.add(imageTopic);

          // Only after image topic is subscribed, handle config topic
          this.subscribeToConfigTopic();
        }
      });
    } else {
      this.subscribeToConfigTopic();
    }
  }

  /**
   * Subscribe to configuration topic - lower priority
   */
  subscribeToConfigTopic() {
    const configTopic = `device/${config.device.id}/config`;
    if (configTopic && !this.topicsSubscribed.has(configTopic)) {
      this.client.subscribe(configTopic, { qos: 0 }, (err) => {
        if (err) {
          console.error('Error subscribing to config topic:', err);
        } else {
          console.log(`Subscribed to config topic: ${configTopic}`);
          this.topicsSubscribed.add(configTopic);
        }
      });
    }
  }

  /**
   * Handle successful connection to MQTT broker
   */
  handleConnect() {
    console.log('Connected to MQTT broker - ready for image messages');
    this.isConnected = true;

    // Notify any connection state listeners
    if (this.messageHandler.onMqttConnected) {
      this.messageHandler.onMqttConnected();
    }
  }

  /**
   * Handle high-priority messages (image messages) with optimized processing
   */
  handlePriorityMessage(topic, message) {
    // Process immediately with highest priority
    const deviceId = this.extractDeviceIdFromTopic(topic);
    if (deviceId !== config.device.id) return;

    console.log(`Received high-priority image message - processing immediately`);

    // Direct call to image handler for fastest processing
    if (this.messageHandler.handleImageMessage) {
      this.messageHandler.handleImageMessage(message);
    }
  }

  /**
   * Handle normal priority messages (config, etc.)
   */
  handleNormalMessage(topic, message) {
    try {
      const deviceId = this.extractDeviceIdFromTopic(topic);
      if (deviceId !== config.device.id) return;

      if (topic.includes('/config')) {
        console.log(`Received config message`);
        // Process config in next tick to prioritize image processing
        process.nextTick(() => {
          if (this.messageHandler.handleConfigMessage) {
            this.messageHandler.handleConfigMessage(message);
          }
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  /**
   * Handle MQTT client errors with connection recovery
   */
  handleError(err, reject, connectionTimeout) {
    console.error('MQTT client error:', err.message);

    // Clear connection timeout if it exists
    if (connectionTimeout) clearTimeout(connectionTimeout);

    // Only reject if we're not connected and this is the initial connection
    if (!this.isConnected && this.connectionAttempts === 0) {
      this.connectionAttempts++;
      // Resolve anyway to not block the app
      console.warn('Continuing application despite MQTT connection error');
      if (reject) reject(err);
    }

    // Basic error troubleshooting
    if (err.message.includes('not authorized')) {
      console.error('Authentication failed. Check your username and password.');
    } else if (err.message.includes('connection refused')) {
      console.error('Connection refused. Check your broker URL and port.');
    }
  }

  /**
   * Handle MQTT connection close
   */
  handleClose() {
    this.isConnected = false;
    console.log('Connection to MQTT broker closed');
  }

  /**
   * Handle MQTT reconnection attempts
   */
  handleReconnect() {
    if (!this.reconnecting) {
      this.reconnecting = true;
      console.log('Attempting to reconnect to MQTT broker');
    }
  }

  /**
   * Extract device ID from MQTT topic
   * @param {string} topic - The MQTT topic
   * @returns {string} The device ID
   */
  extractDeviceIdFromTopic(topic) {
    // Expected format: device/<deviceId>/image/display or device/<deviceId>/config
    const parts = topic.split('/');
    return parts.length >= 3 ? parts[1] : 'unknown';
  }

  /**
   * Close the MQTT client connection
   * @returns {Promise} Promise that resolves when the client is closed
   */
  disconnect() {
    return new Promise((resolve) => {
      if (this.client && this.isConnected) {
        this.client.end(true, () => {
          console.log('MQTT client disconnected');
          this.isConnected = false;
          this.connectionPromise = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = MQTTClient;
