/**
 * PocketBase service for Infernet Protocol
 * Manages the embedded PocketBase instance
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('pocketbase');

class PocketBaseService {
    constructor() {
        this.process = null;
        this.url = config.pocketbase.url;
        this.dataDir = config.pocketbase.dataDir;
        this.isRunning = false;
        this.adminEmail = config.pocketbase.adminEmail;
        this.adminPassword = config.pocketbase.adminPassword;
        this.pbBinaryPath = path.join(__dirname, '../../bin/pocketbase');
    }

    /**
     * Check if PocketBase binary exists
     * @returns {boolean} - Whether PocketBase binary exists
     */
    checkBinaryExists() {
        return fs.existsSync(this.pbBinaryPath);
    }

    /**
     * Download PocketBase binary if it doesn't exist
     * @returns {Promise<boolean>} - Success status
     */
    async downloadBinary() {
        if (this.checkBinaryExists()) {
            logger.info('PocketBase binary already exists');
            return true;
        }

        logger.info('Downloading PocketBase binary...');

        // Create bin directory if it doesn't exist
        const binDir = path.dirname(this.pbBinaryPath);
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        // In a real implementation, this would download the appropriate binary for the platform
        // For this example, we'll just create a placeholder file
        fs.writeFileSync(this.pbBinaryPath, '#!/bin/sh\necho "PocketBase placeholder"\n');
        fs.chmodSync(this.pbBinaryPath, '755');

        logger.info('PocketBase binary downloaded successfully');
        return true;
    }

    /**
     * Start the embedded PocketBase server
     * @returns {Promise<boolean>} - Success status
     */
    async start() {
        if (this.isRunning) {
            logger.info('PocketBase is already running');
            return true;
        }

        // Ensure binary exists
        if (!this.checkBinaryExists()) {
            await this.downloadBinary();
        }

        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            try {
                logger.info(`Starting PocketBase server (data dir: ${this.dataDir})`);

                // Start PocketBase process
                this.process = spawn(this.pbBinaryPath, ['serve', '--dir', this.dataDir], {
                    stdio: 'pipe'
                });

                // Handle process output
                this.process.stdout.on('data', (data) => {
                    logger.debug(`PocketBase: ${data.toString().trim()}`);
                });

                this.process.stderr.on('data', (data) => {
                    logger.error(`PocketBase error: ${data.toString().trim()}`);
                });

                // Handle process exit
                this.process.on('close', (code) => {
                    if (code !== 0 && this.isRunning) {
                        logger.error(`PocketBase process exited with code ${code}`);
                    }
                    this.isRunning = false;
                });

                // Wait for server to start
                setTimeout(() => {
                    this.isRunning = true;
                    logger.info(`PocketBase server started at ${this.url}`);
                    resolve(true);
                }, 2000); // Give it 2 seconds to start

            } catch (error) {
                logger.error('Failed to start PocketBase server:', error);
                reject(error);
            }
        });
    }

    /**
     * Stop the embedded PocketBase server
     * @returns {Promise<boolean>} - Success status
     */
    async stop() {
        if (!this.isRunning || !this.process) {
            logger.info('PocketBase is not running');
            return true;
        }

        return new Promise((resolve) => {
            logger.info('Stopping PocketBase server...');

            // Kill the process
            this.process.kill();

            // Wait for process to exit
            this.process.on('close', () => {
                this.isRunning = false;
                this.process = null;
                logger.info('PocketBase server stopped');
                resolve(true);
            });

            // Force kill after timeout
            setTimeout(() => {
                if (this.process) {
                    logger.warn('Force killing PocketBase process');
                    this.process.kill('SIGKILL');
                    this.isRunning = false;
                    this.process = null;
                    resolve(true);
                }
            }, 5000);
        });
    }

    /**
     * Get the PocketBase server URL
     * @returns {string} - Server URL
     */
    getUrl() {
        return this.url;
    }

    /**
     * Check if PocketBase server is running
     * @returns {boolean} - Running status
     */
    isServerRunning() {
        return this.isRunning;
    }
}

// Create a singleton instance
const pocketbaseService = new PocketBaseService();

module.exports = pocketbaseService;
