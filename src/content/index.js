/**
 * Content Delivery System for Infernet Protocol
 * Handles storage, retrieval, and distribution of large model files and datasets
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { createLogger } = require('../utils/logger');
const config = require('../config');
const { EventEmitter } = require('events');

// Promisify fs functions
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

const logger = createLogger('content');

class ContentDeliverySystem extends EventEmitter {
    constructor() {
        super();
        this.storageDir = config.contentDelivery.storageDir;
        this.tempDir = config.contentDelivery.tempDir;
        this.maxContentSize = config.contentDelivery.maxContentSize;
        this.contentExpiryHours = config.contentDelivery.contentExpiryHours;
        this.cleanupInterval = config.contentDelivery.cleanupInterval;
        this.cleanupTimer = null;
    }

    /**
     * Initialize the content delivery system
     */
    async initialize() {
        try {
            logger.info('Initializing content delivery system...');
            
            // Create storage and temp directories if they don't exist
            await this._ensureDirectoryExists(this.storageDir);
            await this._ensureDirectoryExists(this.tempDir);
            
            // Start cleanup timer
            this._startCleanupTimer();
            
            logger.info('Content delivery system initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize content delivery system:', error);
            throw error;
        }
    }

    /**
     * Store content in the system
     * @param {Buffer|string} content - Content to store
     * @param {string} contentType - Content type (e.g., 'model', 'dataset')
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} - Content information including contentId
     */
    async storeContent(content, contentType, metadata = {}) {
        try {
            // Validate content size
            const contentSize = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);
            
            if (contentSize > this.maxContentSize) {
                throw new Error(`Content size exceeds maximum allowed size of ${this.maxContentSize} bytes`);
            }
            
            // Generate content ID based on hash of content
            const contentId = this._generateContentId(content);
            
            // Create metadata object
            const contentMetadata = {
                contentId,
                contentType,
                size: contentSize,
                created: new Date().toISOString(),
                expires: new Date(Date.now() + this.contentExpiryHours * 60 * 60 * 1000).toISOString(),
                ...metadata
            };
            
            // Store content and metadata
            const contentPath = this._getContentPath(contentId);
            const metadataPath = this._getMetadataPath(contentId);
            
            await writeFile(contentPath, content);
            await writeFile(metadataPath, JSON.stringify(contentMetadata, null, 2));
            
            logger.info(`Content stored with ID: ${contentId}, type: ${contentType}, size: ${contentSize} bytes`);
            
            this.emit('content.stored', contentId, contentMetadata);
            
            return contentMetadata;
        } catch (error) {
            logger.error('Failed to store content:', error);
            throw error;
        }
    }

    /**
     * Retrieve content by ID
     * @param {string} contentId - Content ID
     * @returns {Promise<Object>} - Content and metadata
     */
    async retrieveContent(contentId) {
        try {
            const contentPath = this._getContentPath(contentId);
            const metadataPath = this._getMetadataPath(contentId);
            
            // Check if content exists
            try {
                await stat(contentPath);
                await stat(metadataPath);
            } catch (error) {
                throw new Error(`Content with ID ${contentId} not found`);
            }
            
            // Read content and metadata
            const content = await readFile(contentPath);
            const metadataStr = await readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataStr);
            
            // Check if content has expired
            if (new Date(metadata.expires) < new Date()) {
                throw new Error(`Content with ID ${contentId} has expired`);
            }
            
            logger.info(`Content retrieved with ID: ${contentId}`);
            
            this.emit('content.retrieved', contentId, metadata);
            
            return { content, metadata };
        } catch (error) {
            logger.error(`Failed to retrieve content with ID ${contentId}:`, error);
            throw error;
        }
    }

    /**
     * Delete content by ID
     * @param {string} contentId - Content ID
     * @returns {Promise<boolean>} - Success status
     */
    async deleteContent(contentId) {
        try {
            const contentPath = this._getContentPath(contentId);
            const metadataPath = this._getMetadataPath(contentId);
            
            // Check if content exists
            try {
                await stat(contentPath);
                await stat(metadataPath);
            } catch (error) {
                return false; // Content not found
            }
            
            // Delete content and metadata
            await unlink(contentPath);
            await unlink(metadataPath);
            
            logger.info(`Content deleted with ID: ${contentId}`);
            
            this.emit('content.deleted', contentId);
            
            return true;
        } catch (error) {
            logger.error(`Failed to delete content with ID ${contentId}:`, error);
            throw error;
        }
    }

    /**
     * Get content metadata by ID
     * @param {string} contentId - Content ID
     * @returns {Promise<Object>} - Content metadata
     */
    async getContentMetadata(contentId) {
        try {
            const metadataPath = this._getMetadataPath(contentId);
            
            // Check if metadata exists
            try {
                await stat(metadataPath);
            } catch (error) {
                throw new Error(`Content with ID ${contentId} not found`);
            }
            
            // Read metadata
            const metadataStr = await readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataStr);
            
            return metadata;
        } catch (error) {
            logger.error(`Failed to get metadata for content with ID ${contentId}:`, error);
            throw error;
        }
    }

    /**
     * List all content
     * @param {string} contentType - Optional content type filter
     * @returns {Promise<Array>} - Array of content metadata
     */
    async listContent(contentType = null) {
        try {
            const metadataFiles = await readdir(this.storageDir);
            const metadataList = [];
            
            for (const file of metadataFiles) {
                if (file.endsWith('.meta.json')) {
                    try {
                        const metadataPath = path.join(this.storageDir, file);
                        const metadataStr = await readFile(metadataPath, 'utf8');
                        const metadata = JSON.parse(metadataStr);
                        
                        // Filter by content type if specified
                        if (!contentType || metadata.contentType === contentType) {
                            metadataList.push(metadata);
                        }
                    } catch (error) {
                        logger.warn(`Failed to read metadata file ${file}:`, error);
                    }
                }
            }
            
            return metadataList;
        } catch (error) {
            logger.error('Failed to list content:', error);
            throw error;
        }
    }

    /**
     * Clean up expired content
     * @returns {Promise<number>} - Number of items cleaned up
     */
    async cleanupExpiredContent() {
        try {
            logger.info('Cleaning up expired content...');
            
            const now = new Date();
            const metadataFiles = await readdir(this.storageDir);
            let cleanupCount = 0;
            
            for (const file of metadataFiles) {
                if (file.endsWith('.meta.json')) {
                    try {
                        const metadataPath = path.join(this.storageDir, file);
                        const metadataStr = await readFile(metadataPath, 'utf8');
                        const metadata = JSON.parse(metadataStr);
                        
                        // Check if content has expired
                        if (new Date(metadata.expires) < now) {
                            const contentId = metadata.contentId;
                            await this.deleteContent(contentId);
                            cleanupCount++;
                        }
                    } catch (error) {
                        logger.warn(`Failed to process metadata file ${file} during cleanup:`, error);
                    }
                }
            }
            
            logger.info(`Cleaned up ${cleanupCount} expired content items`);
            return cleanupCount;
        } catch (error) {
            logger.error('Failed to clean up expired content:', error);
            throw error;
        }
    }

    /**
     * Clean up temporary directory
     * @returns {Promise<number>} - Number of items cleaned up
     */
    async cleanupTempDirectory() {
        try {
            logger.info('Cleaning up temporary directory...');
            
            const tempFiles = await readdir(this.tempDir);
            let cleanupCount = 0;
            
            for (const file of tempFiles) {
                try {
                    const filePath = path.join(this.tempDir, file);
                    const fileStat = await stat(filePath);
                    
                    // Delete files older than 24 hours
                    const fileAge = Date.now() - fileStat.mtime.getTime();
                    if (fileAge > 24 * 60 * 60 * 1000) {
                        await unlink(filePath);
                        cleanupCount++;
                    }
                } catch (error) {
                    logger.warn(`Failed to process temp file ${file} during cleanup:`, error);
                }
            }
            
            logger.info(`Cleaned up ${cleanupCount} temporary files`);
            return cleanupCount;
        } catch (error) {
            logger.error('Failed to clean up temporary directory:', error);
            throw error;
        }
    }

    /**
     * Shutdown the content delivery system
     */
    shutdown() {
        logger.info('Shutting down content delivery system...');
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        logger.info('Content delivery system shut down successfully');
    }

    /**
     * Generate a content ID based on content hash
     * @param {Buffer|string} content - Content to hash
     * @returns {string} - Content ID
     * @private
     */
    _generateContentId(content) {
        const hash = crypto.createHash('sha256');
        hash.update(Buffer.isBuffer(content) ? content : Buffer.from(content));
        return hash.digest('hex');
    }

    /**
     * Get the path to content file
     * @param {string} contentId - Content ID
     * @returns {string} - Path to content file
     * @private
     */
    _getContentPath(contentId) {
        return path.join(this.storageDir, `${contentId}.bin`);
    }

    /**
     * Get the path to metadata file
     * @param {string} contentId - Content ID
     * @returns {string} - Path to metadata file
     * @private
     */
    _getMetadataPath(contentId) {
        return path.join(this.storageDir, `${contentId}.meta.json`);
    }

    /**
     * Ensure a directory exists
     * @param {string} dir - Directory path
     * @returns {Promise<void>}
     * @private
     */
    async _ensureDirectoryExists(dir) {
        try {
            await stat(dir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await mkdir(dir, { recursive: true });
                logger.info(`Created directory: ${dir}`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Start the cleanup timer
     * @private
     */
    _startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanupExpiredContent();
                await this.cleanupTempDirectory();
            } catch (error) {
                logger.error('Error during scheduled cleanup:', error);
            }
        }, this.cleanupInterval);
        
        logger.info(`Scheduled content cleanup every ${this.cleanupInterval / 1000 / 60} minutes`);
    }
}

// Create a singleton instance
const contentDeliverySystem = new ContentDeliverySystem();

module.exports = contentDeliverySystem;
