/**
 * WebSocket server and client implementation for Infernet Protocol
 * Handles real-time, bidirectional communication between nodes
 */

const WebSocket = require('ws');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('websocket');

class WebSocketServer {
    constructor(port = config.server.port, host = config.server.host) {
        this.port = port;
        this.host = host;
        this.server = null;
        this.clients = new Map(); // Map of client connections
        this.messageHandlers = new Map(); // Message type handlers
    }

    /**
     * Start the WebSocket server
     * @returns {Promise<void>}
     */
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = new WebSocket.Server({ 
                    port: this.port,
                    host: this.host
                });

                this.server.on('connection', this._handleConnection.bind(this));
                
                this.server.on('listening', () => {
                    logger.info(`WebSocket server listening on ${this.host}:${this.port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    logger.error('WebSocket server error:', error);
                    reject(error);
                });
            } catch (error) {
                logger.error('Failed to start WebSocket server:', error);
                reject(error);
            }
        });
    }

    /**
     * Handle new WebSocket connections
     * @param {WebSocket} socket - WebSocket connection
     * @param {Object} request - HTTP request
     * @private
     */
    _handleConnection(socket, request) {
        const clientId = request.headers['x-client-id'] || `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        logger.info(`New WebSocket connection: ${clientId}`);
        
        this.clients.set(clientId, {
            socket,
            connectedAt: new Date(),
            metadata: {}
        });

        socket.on('message', (data) => this._handleMessage(clientId, data));
        
        socket.on('close', () => {
            logger.info(`WebSocket connection closed: ${clientId}`);
            this.clients.delete(clientId);
        });
        
        socket.on('error', (error) => {
            logger.error(`WebSocket error for client ${clientId}:`, error);
        });
        
        // Send welcome message
        this.sendToClient(clientId, {
            type: 'welcome',
            data: { id: clientId, timestamp: new Date().toISOString() }
        });
    }

    /**
     * Handle incoming WebSocket messages
     * @param {string} clientId - Client ID
     * @param {Buffer|ArrayBuffer|Buffer[]} data - Message data
     * @private
     */
    _handleMessage(clientId, data) {
        try {
            const message = JSON.parse(data.toString());
            logger.debug(`Received message from ${clientId}:`, message);
            
            if (!message.type) {
                logger.warn(`Received message without type from ${clientId}`);
                return;
            }
            
            // Handle message based on type
            if (this.messageHandlers.has(message.type)) {
                const handler = this.messageHandlers.get(message.type);
                handler(clientId, message.data || {});
            } else {
                logger.warn(`No handler for message type: ${message.type}`);
            }
        } catch (error) {
            logger.error(`Error handling message from ${clientId}:`, error);
        }
    }

    /**
     * Register a message handler
     * @param {string} messageType - Message type to handle
     * @param {Function} handler - Handler function(clientId, data)
     */
    registerHandler(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
        logger.debug(`Registered handler for message type: ${messageType}`);
    }

    /**
     * Send a message to a specific client
     * @param {string} clientId - Client ID
     * @param {Object} message - Message to send
     * @returns {boolean} - Success status
     */
    sendToClient(clientId, message) {
        try {
            const client = this.clients.get(clientId);
            
            if (!client) {
                logger.warn(`Attempted to send message to unknown client: ${clientId}`);
                return false;
            }
            
            if (client.socket.readyState !== WebSocket.OPEN) {
                logger.warn(`Client socket not open: ${clientId}`);
                return false;
            }
            
            client.socket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            logger.error(`Error sending message to client ${clientId}:`, error);
            return false;
        }
    }

    /**
     * Broadcast a message to all connected clients
     * @param {Object} message - Message to broadcast
     * @param {Array<string>} excludeClients - Client IDs to exclude
     */
    broadcast(message, excludeClients = []) {
        const excludeSet = new Set(excludeClients);
        
        for (const [clientId, client] of this.clients.entries()) {
            if (!excludeSet.has(clientId) && client.socket.readyState === WebSocket.OPEN) {
                client.socket.send(JSON.stringify(message));
            }
        }
    }

    /**
     * Stop the WebSocket server
     * @returns {Promise<void>}
     */
    stop() {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }
            
            // Close all client connections
            for (const [clientId, client] of this.clients.entries()) {
                try {
                    client.socket.close();
                } catch (error) {
                    logger.error(`Error closing client socket ${clientId}:`, error);
                }
            }
            
            this.clients.clear();
            
            // Close the server
            this.server.close(() => {
                logger.info('WebSocket server stopped');
                this.server = null;
                resolve();
            });
        });
    }
}

class WebSocketClient {
    constructor() {
        this.socket = null;
        this.url = null;
        this.clientId = `node_${config.node.id || Date.now()}`;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start with 1 second
        this.messageHandlers = new Map();
        this.messageQueue = [];
    }

    /**
     * Connect to a WebSocket server
     * @param {string} url - WebSocket server URL
     * @returns {Promise<void>}
     */
    connect(url) {
        return new Promise((resolve, reject) => {
            this.url = url;
            
            try {
                this.socket = new WebSocket(url, {
                    headers: {
                        'X-Client-Id': this.clientId,
                        'X-Node-Type': config.node.type
                    }
                });
                
                this.socket.on('open', () => {
                    logger.info(`Connected to WebSocket server: ${url}`);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    
                    // Process any queued messages
                    this._processQueue();
                    
                    resolve();
                });
                
                this.socket.on('message', (data) => this._handleMessage(data));
                
                this.socket.on('close', () => {
                    logger.info(`WebSocket connection closed: ${url}`);
                    this.isConnected = false;
                    this._attemptReconnect();
                });
                
                this.socket.on('error', (error) => {
                    logger.error(`WebSocket connection error:`, error);
                    if (!this.isConnected) {
                        reject(error);
                    }
                });
            } catch (error) {
                logger.error(`Failed to connect to WebSocket server:`, error);
                reject(error);
            }
        });
    }

    /**
     * Handle incoming WebSocket messages
     * @param {Buffer|ArrayBuffer|Buffer[]} data - Message data
     * @private
     */
    _handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            logger.debug(`Received message:`, message);
            
            if (!message.type) {
                logger.warn(`Received message without type`);
                return;
            }
            
            // Handle message based on type
            if (this.messageHandlers.has(message.type)) {
                const handler = this.messageHandlers.get(message.type);
                handler(message.data || {});
            } else {
                logger.warn(`No handler for message type: ${message.type}`);
            }
        } catch (error) {
            logger.error(`Error handling message:`, error);
        }
    }

    /**
     * Register a message handler
     * @param {string} messageType - Message type to handle
     * @param {Function} handler - Handler function(data)
     */
    registerHandler(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
        logger.debug(`Registered handler for message type: ${messageType}`);
    }

    /**
     * Send a message to the server
     * @param {Object} message - Message to send
     * @returns {boolean} - Success status
     */
    send(message) {
        if (!this.isConnected) {
            // Queue message for later sending
            this.messageQueue.push(message);
            logger.debug(`Queued message for later sending:`, message);
            return false;
        }
        
        try {
            this.socket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            logger.error(`Error sending message:`, error);
            return false;
        }
    }

    /**
     * Process queued messages
     * @private
     */
    _processQueue() {
        if (this.messageQueue.length === 0) {
            return;
        }
        
        logger.debug(`Processing ${this.messageQueue.length} queued messages`);
        
        const queue = [...this.messageQueue];
        this.messageQueue = [];
        
        for (const message of queue) {
            this.send(message);
        }
    }

    /**
     * Attempt to reconnect to the server
     * @private
     */
    _attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error(`Maximum reconnect attempts (${this.maxReconnectAttempts}) reached`);
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(30000, this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1));
        
        logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            logger.info(`Reconnecting to ${this.url}...`);
            
            this.connect(this.url).catch((error) => {
                logger.error(`Reconnect attempt failed:`, error);
            });
        }, delay);
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        if (!this.socket) {
            return;
        }
        
        try {
            this.socket.close();
            this.socket = null;
            this.isConnected = false;
            logger.info(`Disconnected from WebSocket server`);
        } catch (error) {
            logger.error(`Error disconnecting from WebSocket server:`, error);
        }
    }
}

module.exports = {
    WebSocketServer,
    WebSocketClient
};
