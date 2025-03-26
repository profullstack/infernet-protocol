/**
 * Database layer for Infernet Protocol using PocketBase
 */
import PocketBase from 'pocketbase';
import config from '../config.js';
import pocketbaseService from './pocketbase.js';
import { createLogger } from '../utils/logger.js';
import { EventEmitter } from 'events';

// Import models - these will be dynamically instantiated
import Provider from './models/provider.js';
import Client from './models/client.js';
import Job from './models/job.js';
import Aggregator from './models/aggregator.js';

const logger = createLogger('database');

class Database extends EventEmitter {
    constructor() {
        super();
        this.pb = null;
        this.isConnected = false;
        this.collections = {};
        this.subscriptions = new Map();
        this.models = {};
    }

    /**
     * Initialize the database connection
     * @param {string} url - PocketBase server URL
     * @param {boolean} startEmbedded - Whether to start the embedded PocketBase server
     * @returns {Promise<PocketBase>} - PocketBase instance
     */
    async connect(url = config.pocketbase.url, startEmbedded = config.pocketbase.useEmbedded) {
        try {
            // Start embedded PocketBase server if configured
            if (startEmbedded) {
                logger.info('Starting embedded PocketBase server...');
                await pocketbaseService.start();
                url = pocketbaseService.getUrl();
            }
            
            logger.info(`Connecting to PocketBase at ${url}`);
            this.pb = new PocketBase(url);
            
            // Test connection by fetching health info
            const health = await this.pb.health.check();
            logger.info('PocketBase connection established:', health);
            
            this.isConnected = true;
            
            // Try to authenticate as admin if credentials are provided
            if (config.pocketbase.adminEmail && config.pocketbase.adminPassword) {
                try {
                    await this.pb.admins.authWithPassword(
                        config.pocketbase.adminEmail,
                        config.pocketbase.adminPassword
                    );
                    logger.info('Authenticated as admin');
                } catch (authError) {
                    logger.warn('Admin authentication failed:', authError);
                }
            }
            
            // Initialize schemas if needed
            await this._initializeSchemas();
            
            // Initialize collection subscriptions
            await this._initSubscriptions();
            
            // Initialize models
            this._initModels();
            
            this.emit('connected');
            return this.pb;
        } catch (error) {
            logger.error('Failed to connect to PocketBase:', error);
            throw error;
        }
    }
    
    /**
     * Get the PocketBase instance
     * @returns {PocketBase} - PocketBase instance
     */
    getInstance() {
        if (!this.isConnected) {
            throw new Error('Database not connected. Call connect() first.');
        }
        return this.pb;
    }
    
    /**
     * Initialize database schemas
     * @private
     */
    async _initializeSchemas() {
        logger.info('Initializing database schemas...');
        
        // Check if collections exist, create them if they don't
        try {
            // Define the collections we need
            const requiredCollections = [
                {
                    name: 'providers',
                    schema: {
                        name: 'providers',
                        type: 'base',
                        schema: [
                            {
                                name: 'nodeId',
                                type: 'text',
                                required: true,
                                unique: true
                            },
                            {
                                name: 'publicKey',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'address',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'port',
                                type: 'number',
                                required: true
                            },
                            {
                                name: 'status',
                                type: 'select',
                                options: {
                                    values: ['available', 'busy', 'offline']
                                },
                                required: true
                            },
                            {
                                name: 'reputation',
                                type: 'number',
                                default: 0
                            },
                            {
                                name: 'specs',
                                type: 'json'
                            },
                            {
                                name: 'price',
                                type: 'number',
                                default: 0
                            },
                            {
                                name: 'lastSeen',
                                type: 'date'
                            }
                        ]
                    }
                },
                {
                    name: 'clients',
                    schema: {
                        name: 'clients',
                        type: 'base',
                        schema: [
                            {
                                name: 'nodeId',
                                type: 'text',
                                required: true,
                                unique: true
                            },
                            {
                                name: 'publicKey',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'address',
                                type: 'text'
                            },
                            {
                                name: 'lastSeen',
                                type: 'date'
                            }
                        ]
                    }
                },
                {
                    name: 'jobs',
                    schema: {
                        name: 'jobs',
                        type: 'base',
                        schema: [
                            {
                                name: 'jobId',
                                type: 'text',
                                required: true,
                                unique: true
                            },
                            {
                                name: 'clientId',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'providerId',
                                type: 'text'
                            },
                            {
                                name: 'aggregatorId',
                                type: 'text'
                            },
                            {
                                name: 'type',
                                type: 'select',
                                options: {
                                    values: ['inference', 'training', 'other']
                                },
                                required: true
                            },
                            {
                                name: 'status',
                                type: 'select',
                                options: {
                                    values: ['pending', 'assigned', 'running', 'completed', 'failed']
                                },
                                required: true
                            },
                            {
                                name: 'specs',
                                type: 'json'
                            },
                            {
                                name: 'payment',
                                type: 'json'
                            },
                            {
                                name: 'created',
                                type: 'date',
                                required: true
                            },
                            {
                                name: 'updated',
                                type: 'date',
                                required: true
                            },
                            {
                                name: 'completed',
                                type: 'date'
                            }
                        ]
                    }
                },
                {
                    name: 'aggregators',
                    schema: {
                        name: 'aggregators',
                        type: 'base',
                        schema: [
                            {
                                name: 'nodeId',
                                type: 'text',
                                required: true,
                                unique: true
                            },
                            {
                                name: 'publicKey',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'address',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'port',
                                type: 'number',
                                required: true
                            },
                            {
                                name: 'status',
                                type: 'select',
                                options: {
                                    values: ['available', 'busy', 'offline']
                                },
                                required: true
                            },
                            {
                                name: 'reputation',
                                type: 'number',
                                default: 0
                            },
                            {
                                name: 'load',
                                type: 'number',
                                default: 0
                            },
                            {
                                name: 'maxLoad',
                                type: 'number',
                                default: 100
                            },
                            {
                                name: 'lastSeen',
                                type: 'date'
                            }
                        ]
                    }
                },
                {
                    name: 'reputation',
                    schema: {
                        name: 'reputation',
                        type: 'base',
                        schema: [
                            {
                                name: 'nodeId',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'publicKey',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'score',
                                type: 'number',
                                required: true
                            },
                            {
                                name: 'reason',
                                type: 'text'
                            },
                            {
                                name: 'reporterId',
                                type: 'text',
                                required: true
                            },
                            {
                                name: 'timestamp',
                                type: 'date',
                                required: true
                            }
                        ]
                    }
                }
            ];
            
            // Create collections if they don't exist
            for (const collection of requiredCollections) {
                try {
                    await this.pb.collections.getOne(collection.name);
                    logger.debug(`Collection ${collection.name} already exists`);
                } catch (error) {
                    if (error.status === 404) {
                        logger.info(`Creating collection ${collection.name}`);
                        await this.pb.collections.create(collection.schema);
                    } else {
                        throw error;
                    }
                }
            }
            
            logger.info('Database schemas initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize database schemas:', error);
            throw error;
        }
    }
    
    /**
     * Initialize real-time subscriptions for collections
     * @private
     */
    async _initSubscriptions() {
        logger.info('Initializing collection subscriptions...');
        
        const collections = ['providers', 'clients', 'jobs', 'aggregators', 'reputation'];
        
        for (const collection of collections) {
            try {
                const subscription = this.pb.collection(collection).subscribe('*', (data) => {
                    logger.debug(`${collection} update:`, data.action);
                    this.emit(`${collection}.${data.action}`, data.record);
                    this.emit(`${collection}.change`, data.action, data.record);
                });
                
                this.subscriptions.set(collection, subscription);
                logger.debug(`Subscribed to ${collection} collection`);
            } catch (error) {
                logger.error(`Failed to subscribe to ${collection} collection:`, error);
            }
        }
    }
    
    /**
     * Initialize model classes
     * @private
     */
    _initModels() {
        // Initialize models with database instance
        this.models = {
            provider: new Provider(this),
            client: new Client(this),
            job: new Job(this),
            aggregator: new Aggregator(this)
        };
        
        logger.info('Database models initialized');
    }
    
    /**
     * Get a model instance
     * @param {string} modelName - Model name
     * @returns {Object} - Model instance
     */
    model(modelName) {
        if (!this.models[modelName]) {
            throw new Error(`Model ${modelName} not found`);
        }
        return this.models[modelName];
    }
    
    /**
     * Check database health
     * @returns {Promise<Object>} - Health status
     */
    async checkHealth() {
        try {
            const health = await this.pb.health.check();
            return {
                status: 'healthy',
                details: health
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }
    
    /**
     * Get database statistics
     * @returns {Promise<Object>} - Database statistics
     */
    async getStats() {
        try {
            const stats = {
                providers: await this.pb.collection('providers').getFullList(),
                clients: await this.pb.collection('clients').getFullList(),
                jobs: await this.pb.collection('jobs').getFullList(),
                aggregators: await this.pb.collection('aggregators').getFullList()
            };
            
            return {
                counts: {
                    providers: stats.providers.length,
                    clients: stats.clients.length,
                    jobs: stats.jobs.length,
                    aggregators: stats.aggregators.length
                },
                jobStats: {
                    pending: stats.jobs.filter(job => job.status === 'pending').length,
                    running: stats.jobs.filter(job => job.status === 'running').length,
                    completed: stats.jobs.filter(job => job.status === 'completed').length,
                    failed: stats.jobs.filter(job => job.status === 'failed').length
                },
                providerStats: {
                    available: stats.providers.filter(provider => provider.status === 'available').length,
                    busy: stats.providers.filter(provider => provider.status === 'busy').length,
                    offline: stats.providers.filter(provider => provider.status === 'offline').length
                }
            };
        } catch (error) {
            logger.error('Failed to get database statistics:', error);
            throw error;
        }
    }
    
    /**
     * Close the database connection and clean up subscriptions
     */
    async disconnect() {
        logger.info('Disconnecting from database...');
        
        if (this.pb) {
            // Unsubscribe from all collections
            for (const [collection, subscription] of this.subscriptions.entries()) {
                try {
                    this.pb.collection(collection).unsubscribe();
                    logger.debug(`Unsubscribed from ${collection} collection`);
                } catch (error) {
                    logger.error(`Failed to unsubscribe from ${collection} collection:`, error);
                }
            }
            
            this.subscriptions.clear();
            this.isConnected = false;
            
            // Stop embedded PocketBase server if it was started
            if (config.pocketbase.useEmbedded) {
                await pocketbaseService.stop();
            }
            
            this.emit('disconnected');
            logger.info('Database connection closed');
        }
    }
}

// Create a singleton instance
const db = new Database();

export default db;
