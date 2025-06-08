/**
 * IT8951 Display Adapter for e-ink displays
 * Optimized for fastest possible initialization and display
 */
const BaseDisplayAdapter = require('./BaseDisplayAdapter');
const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Check if IT8951 tool is available in the system
let it8951Available = false;
let it8951Path = 'it8951'; // Default command path

try {
  // Check if the command exists using 'which it8951' or equivalent
  if (os.platform() === 'win32') {
    // Windows
    try {
      execSync('where it8951');
      it8951Available = true;
    } catch (e) {
      it8951Available = false;
    }
  } else {
    // Unix-like
    try {
      const commandPath = execSync('which it8951 2>/dev/null || echo ""').toString().trim();
      if (commandPath) {
        it8951Path = commandPath;
        it8951Available = true;
      } else {
        // Check common installation locations
        const possiblePaths = [
          '/usr/local/bin/it8951',
          '/usr/bin/it8951',
          '/opt/bin/it8951',
          path.join(process.cwd(), 'node_modules', '.bin', 'it8951')
        ];

        for (const possiblePath of possiblePaths) {
          if (fs.existsSync(possiblePath)) {
            it8951Path = possiblePath;
            it8951Available = true;
            console.log(`Found IT8951 at: ${it8951Path}`);
            break;
          }
        }
      }
    } catch (e) {
      it8951Available = false;
    }
  }
} catch (error) {
  console.warn('Error checking for IT8951 command:', error.message);
  it8951Available = false;
}

console.log(`IT8951 driver availability: ${it8951Available ? 'YES' : 'NO'}`);

// Flag to track if we've already initialized in this session
let isDriverWarmedUp = false;
try {
  // Skip initialization check if driver isn't available
  if (it8951Available) {
    const tmpFilePath = '/tmp/it8951_initialized';
    if (fs.existsSync(tmpFilePath)) {
      const stat = fs.statSync(tmpFilePath);
      // Try to get boot time, with fallback if it fails
      try {
        const bootTime = parseInt(execSync('cat /proc/stat | grep btime | awk \'{print $2}\'').toString());
        const fileTime = Math.floor(stat.birthtimeMs / 1000);

        if (fileTime >= bootTime) {
          isDriverWarmedUp = true;
        }
      } catch (e) {
        // If we can't determine boot time, use a simple age check (1 hour)
        const fileAge = Date.now() - stat.mtimeMs;
        if (fileAge < 3600000) {
          isDriverWarmedUp = true;
        }
      }
    }
  }
} catch (error) {
  // Ignore errors - we'll initialize normally
}

class IT8951DisplayAdapter extends BaseDisplayAdapter {
  constructor() {
    super();
    this.initialized = false;
    this.imageProcess = null;
    this.displayWidth = 1600;  // Default width
    this.displayHeight = 1200; // Default height
    this.vcom = -2270; // Default VCOM value
    this.initPromise = null; // Track initialization promise to avoid duplicates
    this.driverAvailable = it8951Available;
    console.log('IT8951 display adapter created');
  }

  /**
   * Initialize the IT8951 display with fallback for missing driver
   */
  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise(async (resolve, reject) => {
      try {
        // Check if driver is available
        if (!this.driverAvailable) {
          console.warn('IT8951 driver not found - using mock display adapter');

          // Use default dimensions and mark as initialized
          this.displayWidth = 1600;
          this.displayHeight = 1200;
          this.initialized = true;

          console.log('Display dimensions set to defaults:', this.displayWidth, 'x', this.displayHeight);
          console.log('Mock display initialized successfully');

          return resolve();
        }

        // Driver is available, proceed with normal initialization
        const maxAttempts = 3;
        let attempt = 1;

        // Need full initialization
        while (attempt <= maxAttempts) {
          try {
            console.log(`Initializing e-ink display (attempt ${attempt} of ${maxAttempts})...`);
            await this.initializeDisplay();

            // Mark as initialized
            this.initialized = true;

            // Mark driver as initialized
            this.markDriverInitialized();

            console.log('Display initialized successfully.');
            break;
          } catch (error) {
            if (attempt === maxAttempts) {
              console.error('Failed to initialize display after maximum attempts.');

              // Fallback to mock mode
              console.warn('Falling back to mock display mode');
              this.driverAvailable = false;
              this.initialized = true;

              return resolve();
            }
            console.error(`Display initialization failed (attempt ${attempt}): ${error.message}`);
            attempt++;
            // Wait before retry
            await new Promise(r => setTimeout(r, 500));
          }
        }

        resolve();
      } catch (error) {
        console.error('Display initialization error:', error);

        // Fallback to mock mode on critical error
        console.warn('Critical error in display initialization - falling back to mock mode');
        this.driverAvailable = false;
        this.initialized = true;
        resolve();
      }
    });

    return this.initPromise;
  }

  /**
   * Fast path to just get display dimensions if already initialized
   */
  getDisplayDimensions() {
    const dims = execSync('cat /tmp/it8951_dimensions 2>/dev/null || echo "1600 1200"').toString().trim().split(' ');
    this.displayWidth = parseInt(dims[0]);
    this.displayHeight = parseInt(dims[1]);
    console.log(`width =  ${this.displayWidth}`);
    console.log(`height =  ${this.displayHeight}`);
    return { width: this.displayWidth, height: this.displayHeight };
  }

  /**
   * Mark driver as initialized for future fast paths
   */
  markDriverInitialized() {
    try {
      // Store dimensions for faster retrieval
      fs.writeFileSync('/tmp/it8951_dimensions', `${this.displayWidth} ${this.displayHeight}`);

      // Create initialization flag file
      fs.writeFileSync('/tmp/it8951_initialized', Date.now().toString());
    } catch (error) {
      // Ignore errors - this is just an optimization
    }
  }

  /**
   * Initialize the display hardware with optimized parallel processing
   * @private
   */
  async initializeDisplay() {
    return new Promise((resolve, reject) => {
      // Spawn process with optimized options - directly pipe output to save parsing time
      const process = spawn(it8951Path, ['info'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';

      // Process output as it comes in to extract info faster
      process.stdout.on('data', (data) => {
        const str = data.toString();
        stdoutData += str;

        // Parse dimensions and other info as they come in
        if (str.includes('width =')) {
          const match = str.match(/width\s+=\s+(\d+)/);
          if (match) this.displayWidth = parseInt(match[1]);
        } else if (str.includes('height =')) {
          const match = str.match(/height\s+=\s+(\d+)/);
          if (match) this.displayHeight = parseInt(match[1]);
        } else if (str.includes('VCOM =')) {
          const match = str.match(/VCOM\s+=\s+-([\d.]+)v/);
          if (match) this.vcom = -Math.round(parseFloat(match[1]) * 1000);
        }
      });

      process.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Display initialization failed with code ${code}: ${stderrData}`));
        }
      });
    });
  }

  /**
   * Display an image on the e-ink screen with parallel processing optimizations
   * @param {Buffer} imageData - The image data to display
   */
  async displayImage(imageData) {
    if (!this.initialized) {
      console.log('Display not initialized, initializing now');
      await this.init();
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Prepare for image processing
        console.log(`Processing image for e-ink display, size: ${imageData.length} bytes`);

        // Store image in RAM for faster processing - use /dev/shm if available
        const ramPath = fs.existsSync('/dev/shm') ? '/dev/shm' : os.tmpdir();
        const bufferPath = path.join(ramPath, `image_${Date.now()}.jpg`);

        // Write file asynchronously to not block
        await fs.promises.writeFile(bufferPath, imageData);

        console.log(`Drawing image (${this.displayWidth}x${this.displayHeight}) on e-ink display`);

        // Execute with optimized parameters
        const process = spawn(it8951Path, ['display', bufferPath, '-v', this.vcom], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';
        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        process.on('close', async (code) => {
          // Clean up buffer file
          try {
            await fs.promises.unlink(bufferPath);
          } catch (e) {
            // Ignore cleanup errors
          }

          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Display image failed with code ${code}: ${stderr}`));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Close the display adapter resources
   */
  close() {
    this.initialized = false;
    // Nothing specific to close for the IT8951 adapter
  }

  /**
   * Clear the e-ink display
   */
  clear() {
    if (!this.initialized) {
      console.log('Display not initialized, skipping clear');
      return;
    }

    try {
      execSync(`${it8951Path} clear`, { stdio: 'inherit' });
    } catch (error) {
      console.error('Error clearing display:', error);
    }
  }
}

module.exports = IT8951DisplayAdapter;
