/**
 * Utility for updating environment variables in .env file
 */
const fs = require('fs');
const path = require('path');

class EnvUpdater {
  /**
   * Update a value in .env file
   * @param {string} key - The environment variable name
   * @param {string|number} value - The new value to set
   * @returns {boolean} - Success status
   */
  static updateEnvFile(key, value) {
    try {
      const envPath = path.join(process.cwd(), '.env');

      // Check if file exists
      if (!fs.existsSync(envPath)) {
        console.error('Cannot update .env file: file does not exist');
        return false;
      }

      // Read the current .env content
      let envContent = fs.readFileSync(envPath, 'utf8');

      // Create regex to match the key
      const keyRegex = new RegExp(`^${key}=.*$`, 'm');

      if (keyRegex.test(envContent)) {
        // Key exists, update it
        envContent = envContent.replace(keyRegex, `${key}=${value}`);
      } else {
        // Key doesn't exist, add it
        envContent += `\n${key}=${value}`;
      }

      // Write the updated content back
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log(`Updated ${key}=${value} in .env file`);
      return true;
    } catch (error) {
      console.error(`Error updating .env file:`, error);
      return false;
    }
  }
}

module.exports = EnvUpdater;
