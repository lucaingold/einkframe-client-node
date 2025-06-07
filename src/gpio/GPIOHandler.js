/**
 * GPIOHandler - Handles GPIO interactions for hardware switches
 * Uses onoff library for Raspberry Pi GPIO control
 */
const os = require('os');
const { exec } = require('child_process');
const config = require('../config/ConfigManager');

class GPIOHandler {
  constructor() {
    this.gpio = null;
    this.shutdownPin = config.gpio.shutdownPin;
    this.enabled = config.gpio.enableShutdownSwitch;
    this.isRaspberryPi = os.platform() === 'linux';
    this.shutdownInitiated = false;
  }

  /**
   * Initialize the GPIO handler
   */
  init() {
    if (!this.enabled) {
      console.log('GPIO shutdown switch feature is disabled');
      return;
    }

    if (!this.isRaspberryPi) {
      console.log('GPIO features are only available on Raspberry Pi');
      return;
    }

    try {
      // Dynamically import onoff library (only available/needed on Raspberry Pi)
      const Gpio = require('onoff').Gpio;

      // Setup GPIO pin 27 as input with pull-up resistor
      // This means the switch should connect the pin to ground when closed
      this.gpio = new Gpio(this.shutdownPin, 'in', 'both', { debounceTimeout: 10 });

      console.log(`GPIO shutdown switch initialized on pin ${this.shutdownPin}`);
    } catch (error) {
      console.error('Failed to initialize GPIO:', error.message);
      console.error('Make sure the onoff library is installed: npm install --save onoff');
      this.enabled = false;
    }
  }

  /**
   * Check if the shutdown switch is on (closed)
   * @returns {boolean} True if the switch is on (connected to ground)
   */
  isShutdownSwitchOn() {
    if (!this.enabled || !this.isRaspberryPi || !this.gpio) {
      return false;
    }

    try {
      // Read the value of the GPIO pin
      // 0 means the switch is closed (connected to ground)
      // 1 means the switch is open
      const value = this.gpio.readSync();
      return value === 0;
    } catch (error) {
      console.error('Failed to read GPIO state:', error.message);
      return false;
    }
  }

  /**
   * Shutdown the Raspberry Pi
   */
  shutdownSystem() {
    if (this.shutdownInitiated) {
      return; // Prevent multiple shutdown calls
    }

    this.shutdownInitiated = true;
    console.log('Shutdown switch is ON - Initiating system shutdown...');

    // Wait a moment to allow logs to be written
    setTimeout(() => {
      if (this.isRaspberryPi) {
        console.log('Executing system shutdown command');
        exec('sudo shutdown -h now', (error) => {
          if (error) {
            console.error('Failed to execute shutdown command:', error);
          }
        });
      } else {
        console.log('Shutdown simulation (not on Raspberry Pi)');
        process.exit(0);
      }
    }, 2000);
  }

  /**
   * Close GPIO resources
   */
  close() {
    if (this.gpio) {
      this.gpio.unexport();
      this.gpio = null;
    }
  }
}

module.exports = GPIOHandler;
