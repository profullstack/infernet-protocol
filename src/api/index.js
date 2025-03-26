/**
 * API Module for Infernet Protocol
 * Provides HTTP endpoints for provider, client, and aggregator nodes
 * Using Hono as the web framework
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { createLogger } from '../utils/logger.js';
import config from '../config.js';
import { registerNodeRoutes } from './routes/nodes.js';

const logger = createLogger('api');

class ApiServer {
    constructor() {
        this.app = new Hono();
        this.server = null;
        this.port = config.server.port;
        this.host = config.server.host;
        this.apiPrefix = config.server.apiPrefix;
        this.corsOrigins = config.server.corsOrigins;
        this.routes = {};
    }

    /**
     * Initialize the API server
     */
    initialize() {
        // Configure middleware
        this.app.use('*', cors({
            origin: this.corsOrigins === '*' ? '*' : this.corsOrigins,
            allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization']
        }));
        
        // Add request logging
        this.app.use('*', honoLogger({
            logFunc: (message) => logger.debug(message)
        }));
        
        // Set up basic routes
        this.app.get('/', (c) => {
            return c.json({ message: 'Infernet Protocol API' });
        });
        
        this.app.get('/health', (c) => {
            return c.json({ status: 'healthy' });
        });
        
        // Register node routes
        registerNodeRoutes(this.app, this.apiPrefix);
        logger.info('Registered node routes');
        
        // Set up API routes
        this._setupRoutes();
        
        // Error handling middleware
        this.app.onError((err, c) => {
            logger.error('API error:', err);
            return c.json({
                error: err.message || 'Internal Server Error'
            }, err.status || 500);
        });
        
        logger.info('API server initialized');
    }

    /**
     * Start the API server
     * @returns {Promise<void>}
     */
    async start() {
        try {
            this.server = serve({
                fetch: this.app.fetch,
                port: this.port,
                hostname: this.host
            });
            
            logger.info(`API server listening on ${this.host}:${this.port}`);
        } catch (error) {
            logger.error('Failed to start API server:', error);
            throw error;
        }
    }

    /**
     * Stop the API server
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.server) {
            return;
        }
        
        try {
            await this.server.close();
            logger.info('API server stopped');
            this.server = null;
        } catch (error) {
            logger.error('Failed to stop API server:', error);
            throw error;
        }
    }

    /**
     * Register API routes
     * @param {string} name - Route name
     * @param {Object} routes - Hono routes object
     */
    registerRoutes(name, routes) {
        this.routes[name] = routes;
        this.app.route(`${this.apiPrefix}/${name}`, routes);
        logger.info(`Registered API routes for ${name}`);
    }

    /**
     * Set up API routes
     * @private
     */
    async _setupRoutes() {
        // Load route modules
        const { default: providerRoutes } = await import('./routes/provider.js');
        const { default: clientRoutes } = await import('./routes/client.js');
        const { default: aggregatorRoutes } = await import('./routes/aggregator.js');
        const { default: jobRoutes } = await import('./routes/job.js');
        
        // Register routes
        this.registerRoutes('provider', providerRoutes);
        this.registerRoutes('client', clientRoutes);
        this.registerRoutes('aggregator', aggregatorRoutes);
        this.registerRoutes('job', jobRoutes);
    }
}

// Create a singleton instance
const apiServer = new ApiServer();

export default apiServer;
