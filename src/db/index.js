/**
 * Database layer for Infernet Protocol using Supabase.
 *
 * This is the CLI / daemon Node.js data layer. It is NOT Next.js code,
 * so it does not import `server-only` or pull helpers from `@/lib/*` —
 * it instantiates its own Supabase client using the service role key.
 */
import { createClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';

import config from '../config.js';
import { createLogger } from '../utils/logger.js';

import Provider from './models/provider.js';
import Client from './models/client.js';
import Job from './models/job.js';
import Aggregator from './models/aggregator.js';

const logger = createLogger('database');

class Database extends EventEmitter {
    constructor() {
        super();
        this.supabase = null;
        this.isConnected = false;
        this.models = {};
    }

    /**
     * Initialize the Supabase client.
     * @param {string} [url] - Optional Supabase URL override.
     * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
     */
    async connect(url) {
        try {
            const supabaseUrl = url || config.supabase.url;
            const serviceRoleKey = config.supabase.serviceRoleKey;
            const schema = config.supabase.schema || 'public';

            if (!supabaseUrl) {
                throw new Error(
                    'Supabase URL is not configured. Set SUPABASE_URL in the environment.'
                );
            }
            if (!serviceRoleKey) {
                throw new Error(
                    'Supabase service role key is not configured. Set SUPABASE_SERVICE_ROLE_KEY in the environment.'
                );
            }

            logger.info(`Connecting to Supabase at ${supabaseUrl} (schema=${schema})`);

            this.supabase = createClient(supabaseUrl, serviceRoleKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                },
                db: { schema }
            });

            // Simple reachability check: a head-only count against a known table.
            const { error } = await this.supabase
                .from('nodes')
                .select('*', { count: 'exact', head: true });

            if (error) {
                throw new Error(`Supabase health probe failed: ${error.message}`);
            }

            this.isConnected = true;

            this._initModels();

            this.emit('connected');
            logger.info('Supabase connection established');
            return this.supabase;
        } catch (error) {
            logger.error('Failed to connect to Supabase:', error);
            throw error;
        }
    }

    /**
     * Get the Supabase client instance.
     * @returns {import('@supabase/supabase-js').SupabaseClient}
     */
    getInstance() {
        if (!this.isConnected || !this.supabase) {
            throw new Error('Database not connected. Call connect() first.');
        }
        return this.supabase;
    }

    /**
     * Initialize model classes.
     * @private
     */
    _initModels() {
        this.models = {
            provider: new Provider(this),
            client: new Client(this),
            job: new Job(this),
            aggregator: new Aggregator(this)
        };
        logger.info('Database models initialized');
    }

    /**
     * Get a model instance by name.
     * @param {string} modelName
     * @returns {Object}
     */
    model(modelName) {
        if (!this.models[modelName]) {
            throw new Error(`Model ${modelName} not found`);
        }
        return this.models[modelName];
    }

    /**
     * Realtime subscription helper — NOT IMPLEMENTED.
     *
     * For realtime updates, callers should use
     * `db.getInstance().channel(name).on('postgres_changes', ...).subscribe()`
     * directly. This stub preserves a legacy call site but logs a warning.
     *
     * @param {string} table
     * @returns {null}
     */
    subscribe(table) {
        logger.warn(
            `subscribe(${table}) is not implemented for the Supabase backend; ` +
                `use supabase.channel().on('postgres_changes', ...).subscribe() directly.`
        );
        return null;
    }

    /**
     * Disconnect and clean up.
     */
    async disconnect() {
        logger.info('Disconnecting from database...');
        if (this.supabase) {
            try {
                // Close any open realtime channels, if any were opened by callers.
                await this.supabase.removeAllChannels();
            } catch (err) {
                logger.warn('Error while removing realtime channels:', err);
            }
        }
        this.supabase = null;
        this.isConnected = false;
        this.models = {};
        this.emit('disconnected');
        logger.info('Database connection closed');
    }
}

// Singleton instance — callers share one Supabase client.
const db = new Database();

export default db;
