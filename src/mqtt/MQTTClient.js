/**
 * MQTTClient - Handles all MQTT connectivity and message processing
 * Optimized for fastest possible image reception during boot
 */
const mqtt = require('mqtt');
const config = require('../config/ConfigManager');
const fs = require('fs');
const path = require('path');

// Global module-level state to enable connection reuse across restarts
let globalClient = null;
let globalClientTimestamp = 0;
let globalConnectionPromise = null;

// Track connection stats
const connectionStats = {
  attempts: 0,
  lastConnectTime: 0
};

// Message buffer to store the latest image during initialization
let latestImageBuffer = null;
let imageReceived = false;

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

    // Try to restore from existing global connection
    if (globalClient && Date.now() - globalClientTimestamp < 60000) {
      console.log('Reusing existing MQTT connection from cache');
      this.client = globalClient;
      this.isConnected = this.client.connected;
      if (this.isConnected) {
        console.log('Restored MQTT connection is active');
      }
    }
  }

  /**
   * Connect to the MQTT broker with extreme optimization for fast startup
   * @returns {Promise} Promise that resolves when connected or rejects on error
   */
  connect() {
    // If we have a valid global promise, use it
    if (globalConnectionPromise && Date.now() - globalClientTimestamp < 30000) {
      console.log('Using existing MQTT connection promise');
      return globalConnectionPromise;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // If we already have a connected client, just use it
    if (this.client && this.client.connected) {
      this.isConnected = true;
      console.log('MQTT client already connected');
      this.subscribeToTopics();
      return Promise.resolve();
    }

    console.log(`Ultra-fast connecting to MQTT broker at ${config.mqtt.broker.url}`);

    this.connectionPromise = new Promise((resolve, reject) => {
      connectionStats.attempts++;
      connectionStats.lastConnectTime = Date.now();

      try {
        // Ultra-optimized connection settings
        const optimizedOptions = {
          ...config.mqtt.options,
          port: config.mqtt.broker.port,
          connectTimeout: 3000,          // Very aggressive timeout
          reconnectPeriod: 1000,         // Very fast reconnection attempts
          rejectUnauthorized: false,     // Skip TLS verification for speed
          clean: true,                   // Clean session for fresh start
          keepalive: 60,                 // Standard keepalive
          protocolVersion: 5,            // Use MQTT 5.0 if supported
          properties: {
            requestResponseInformation: true,
            requestProblemInformation: true
          },
          sessionExpiryInterval: 0
        };

        // Setup connection timeout that won't block the application
        const connectionTimeoutMs = 3000;
        let connectionTimeoutId = setTimeout(() => {
          console.warn('MQTT connection taking longer than expected - proceeding with application startup');

          if (!this.isConnected && this.client) {
            // Subscribe anyway, it will queue until connected
            this.subscribeToTopics();
          }

          // Resolve the promise to unblock application
          resolve();
        }, connectionTimeoutMs);

        // Create client with optimized options
        this.client = mqtt.connect(
          `mqtts://${config.mqtt.broker.url}`,
          optimizedOptions
        );

        // Store globally
        globalClient = this.client;
        globalClientTimestamp = Date.now();
        globalConnectionPromise = this.connectionPromise;

        // Connect first for fastest setup
        this.client.on('connect', () => {
          clearTimeout(connectionTimeoutId);
          connectionTimeoutId = null;
          this.isConnected = true;
          this.connectionAttempts = 0;

          // Subscribe immediately
          this.subscribeToTopicsFast();

          // After subscribing tell the app we're connected
          this.handleConnect();
          resolve();
        });

        // Process messages with priority handling
        this.client.on('message', (topic, message) => {
          if (topic.includes('image/display')) {
            this.handleImageMessage(topic, message);
          } else if (topic.includes('/config')) {
            this.handleConfigMessage(topic, message);
          }
        });

        // Lower priority handlers
        this.client.on('error', (err) => this.handleError(err, reject, connectionTimeoutId));

        this.client.on('close', () => {
          this.isConnected = false;
          console.log('MQTT connection closed');
        });

        this.client.on('disconnect', () => {
          this.isConnected = false;
          console.log('MQTT client disconnected');
        });

        this.client.on('offline', () => {
          this.isConnected = false;
          console.log('MQTT client is offline');
        });

        // Very aggressively try to establish connection fast
        this.client.on('packetsend', (packet) => {
          if (packet.cmd === 'connect' && !this.isConnected) {
            // As soon as we send the connect packet, start preparing for subscriptions
            this.prepareSubscriptions();
          }
        });

      } catch (error) {
        console.error('Error creating MQTT connection:', error);
        this.connectionPromise = null;
        if (globalConnectionPromise === this.connectionPromise) {
          globalConnectionPromise = null;
        }
        resolve(); // Don't block application startup
      }
    });

    return this.connectionPromise;
  }

  /**
   * Prepare subscription data structures before actual connection
   */
  prepareSubscriptions() {
    // Pre-compute topic paths
    this.imageDisplayTopic = config.mqtt.topics.imageDisplay;
    this.configTopic = `device/${config.device.id}/config`;
  }

  /**
   * Subscribe to topics with aggressive parallel execution
   */
  subscribeToTopicsFast() {
    console.log('Fast subscribing to MQTT topics');
    this.prepareSubscriptions();

    // Subscribe to both topics in parallel for speed
    const imagePromise = new Promise(resolve => {
      if (!this.topicsSubscribed.has(this.imageDisplayTopic)) {
        this.client.subscribe(this.imageDisplayTopic, { qos: 1 }, (err) => {
          if (err) {
            console.error('Error subscribing to image topic:', err);
          } else {
            console.log(`Subscribed to image topic: ${this.imageDisplayTopic}`);
            this.topicsSubscribed.add(this.imageDisplayTopic);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });

    const configPromise = new Promise(resolve => {
      if (!this.topicsSubscribed.has(this.configTopic)) {
        this.client.subscribe(this.configTopic, { qos: 0 }, (err) => {
          if (err) {
            console.error('Error subscribing to config topic:', err);
          } else {
            console.log(`Subscribed to config topic: ${this.configTopic}`);
            this.topicsSubscribed.add(this.configTopic);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });

    // Fire and forget - don't block on subscriptions
    Promise.all([imagePromise, configPromise]).catch(e => {
      console.error('Error in topic subscription:', e);
    });
  }

  /**
   * Legacy method for compatibility
   */
  subscribeToTopics() {
    this.subscribeToTopicsFast();
  }

  /**
   * Handle successful connection to MQTT broker
   */
  handleConnect() {
    console.log('Connected to MQTT broker - ready for image messages');
    this.isConnected = true;

    // Notify any connection state listeners
    if (this.messageHandler.onMqttConnected) {
      setImmediate(() => this.messageHandler.onMqttConnected());
    }
  }

  /**
   * Handle image messages from MQTT with buffering capability
   * @param {string} topic - MQTT topic
   * @param {Buffer} message - Image data buffer
   */
  handleImageMessage(topic, message) {
    // Filter for correct device
    const deviceId = this.extractDeviceIdFromTopic(topic);
    if (deviceId !== config.device.id) return;

    console.log(`Received image message on topic: ${topic}`);

    // Store the message and mark as received for status tracking
    latestImageBuffer = message;
    imageReceived = true;

    // Pass to the message handler if available
    if (this.messageHandler && this.messageHandler.handleImageMessage) {
      this.messageHandler.handleImageMessage(message);
    }
  }

  /**
   * Handle config messages from MQTT
   * @param {string} topic - MQTT topic
   * @param {Buffer} message - Config data buffer
   */
  handleConfigMessage(topic, message) {
    // Filter for correct device
    const deviceId = this.extractDeviceIdFromTopic(topic);
    if (deviceId !== config.device.id) return;

    console.log(`Received config message on topic: ${topic}`);

    // Pass to the message handler if available
    if (this.messageHandler && this.messageHandler.handleConfigMessage) {
      this.messageHandler.handleConfigMessage(message);
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
      // Execute at max priority
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
        setImmediate(() => {
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
  handleError(err, reject, connectionTimeoutId) {
    console.error('MQTT client error:', err.message);

    // Clear connection timeout if it exists
    if (connectionTimeoutId) clearTimeout(connectionTimeoutId);

    // Don't reject - let the app continue without MQTT if needed
    if (reject) {
      console.warn('Continuing application despite MQTT connection error');
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
   * Check if we have received an image since startup
   * @returns {boolean} True if an image has been received
   */
  hasReceivedImage() {
    return imageReceived;
  }

  /**
   * Get the latest image buffer if available
   * @returns {Buffer|null} The latest image buffer or null if none received
   */
  getLatestImage() {
    return latestImageBuffer;
  }

  /**
   * Clear the latest image buffer
   */
  clearLatestImage() {
    latestImageBuffer = null;
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
