/**
 * Logger utility for Infernet Protocol
 * Provides structured logging with different levels and formats
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

// Ensure log directory exists
function ensureLogDirectory() {
    const logDir = path.dirname(config.logging.file);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
}

// Log levels and their numeric values
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

/**
 * Create a logger instance for a specific module
 * @param {string} module - Module name
 * @returns {Object} - Logger object with log methods
 */
function createLogger(module) {
    const logLevel = LOG_LEVELS[config.logging.level] || LOG_LEVELS.info;
    const logFormat = config.logging.format;
    
    // Ensure log directory exists if file logging is enabled
    if (config.logging.file) {
        ensureLogDirectory();
    }
    
    /**
     * Log a message at a specific level
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Additional data to log
     */
    function log(level, message, data) {
        if (LOG_LEVELS[level] < logLevel) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            module,
            message,
            data
        };
        
        // Format the log entry
        let formattedLog;
        if (logFormat === 'json') {
            formattedLog = JSON.stringify(logEntry);
        } else {
            // Simple text format
            formattedLog = `${timestamp} [${level.toUpperCase()}] [${module}] ${message}`;
            if (data) {
                formattedLog += ` ${JSON.stringify(data)}`;
            }
        }
        
        // Output to console
        if (level === 'error') {
            console.error(formattedLog);
        } else if (level === 'warn') {
            console.warn(formattedLog);
        } else {
            console.log(formattedLog);
        }
        
        // Write to log file if configured
        if (config.logging.file) {
            fs.appendFileSync(config.logging.file, formattedLog + '\n');
        }
    }
    
    return {
        debug: (message, data) => log('debug', message, data),
        info: (message, data) => log('info', message, data),
        warn: (message, data) => log('warn', message, data),
        error: (message, data) => log('error', message, data)
    };
}

module.exports = {
    createLogger
};
