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

      // Split content into lines for safer processing
      let lines = envContent.split('\n');
      let found = false;

      // Process each line to find and update the key
      for (let i = 0; i < lines.length; i++) {
        // Check if this line contains the key (ignoring comments)
        if (lines[i].match(new RegExp(`^\\s*${key}\\s*=`))) {
          // Preserve any comments after the value
          const commentMatch = lines[i].match(/#.*$/);
          const comment = commentMatch ? commentMatch[0] : '';

          // Update the line with new value, preserving any trailing comment
          lines[i] = `${key}=${value}${comment ? ' ' + comment : ''}`;
          found = true;
          break;
        }
      }

      // If key wasn't found, add it at the end
      if (!found) {
        lines.push(`${key}=${value}`);
      }

      // Reconstruct the file content and write it back
      const updatedContent = lines.join('\n');
      fs.writeFileSync(envPath, updatedContent, 'utf8');

      console.log(`Updated ${key}=${value} in .env file`);
      return true;
    } catch (error) {
      console.error(`Error updating .env file:`, error);
      return false;
    }
  }
}

module.exports = EnvUpdater;
