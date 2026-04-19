/**
 * Aggregator model for Infernet Protocol (Supabase backend).
 *
 * Supabase schema (after 20260419000000_cli_support_and_payments.sql):
 *   aggregators(id uuid, name text, status text, active_jobs int,
 *               created_at timestamptz, node_id text unique,
 *               public_key text, address text, port int,
 *               reputation int default 50, last_seen timestamptz)
 *
 * All CLI-node fields (node_id, public_key, address, port, reputation,
 * last_seen) and the aggregator_id linkage on jobs are now fully
 * supported — no more compat stubs.
 */

import crypto from 'crypto';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('model:aggregator');
const TABLE = 'aggregators';

function pickAggregatorColumns(input = {}) {
    const out = {};
    if (input.name !== undefined) out.name = input.name;
    if (input.status !== undefined) out.status = input.status;
    if (input.active_jobs !== undefined) out.active_jobs = input.active_jobs;
    else if (input.activeJobs !== undefined) out.active_jobs = input.activeJobs;
    else if (input.load !== undefined) out.active_jobs = input.load;
    if (input.node_id !== undefined) out.node_id = input.node_id;
    else if (input.nodeId !== undefined) out.node_id = input.nodeId;
    if (input.public_key !== undefined) out.public_key = input.public_key;
    else if (input.publicKey !== undefined) out.public_key = input.publicKey;
    if (input.address !== undefined) out.address = input.address;
    if (input.port !== undefined) out.port = input.port;
    if (input.reputation !== undefined) out.reputation = input.reputation;
    if (input.last_seen !== undefined) out.last_seen = input.last_seen;
    else if (input.lastSeen !== undefined) out.last_seen = input.lastSeen;
    return out;
}

class Aggregator {
    constructor(db) {
        this.db = db;
        this.table = TABLE;
    }

    /**
     * Register a new aggregator (or update by node_id / id if it exists).
     * @param {Object} aggregatorData
     * @returns {Promise<Object>}
     */
    async register(aggregatorData = {}) {
        const supabase = this.db.getInstance();
        const payload = pickAggregatorColumns({
            status: 'available',
            active_jobs: 0,
            reputation: 50,
            last_seen: new Date().toISOString(),
            ...aggregatorData
        });

        if (!payload.name) {
            payload.name = `aggregator_${crypto.randomBytes(6).toString('hex')}`;
        }

        try {
            const lookupNodeId = payload.node_id;
            if (lookupNodeId) {
                const existing = await this.findByNodeId(lookupNodeId);
                if (existing) {
                    logger.info(`Updating existing aggregator: ${lookupNodeId}`);
                    const { data, error } = await supabase
                        .from(this.table)
                        .update(payload)
                        .eq('node_id', lookupNodeId)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
            } else if (aggregatorData.id) {
                const { data: existing } = await supabase
                    .from(this.table)
                    .select('*')
                    .eq('id', aggregatorData.id)
                    .maybeSingle();
                if (existing) {
                    logger.info(`Updating existing aggregator: ${aggregatorData.id}`);
                    const { data, error } = await supabase
                        .from(this.table)
                        .update(payload)
                        .eq('id', aggregatorData.id)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
            }

            logger.info(`Registering new aggregator: ${payload.name}`);
            const { data, error } = await supabase
                .from(this.table)
                .insert(payload)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error('Failed to register aggregator:', error);
            throw error;
        }
    }

    /**
     * Find an aggregator by node_id, falling back to row id.
     * @param {string} nodeId
     * @returns {Promise<Object|null>}
     */
    async findByNodeId(nodeId) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .select('*')
                .eq('node_id', nodeId)
                .maybeSingle();
            if (error) throw error;
            if (data) return data;

            const { data: byId, error: byIdErr } = await supabase
                .from(this.table)
                .select('*')
                .eq('id', nodeId)
                .maybeSingle();
            if (byIdErr) throw byIdErr;
            return byId || null;
        } catch (error) {
            logger.error(`Failed to find aggregator ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Find an aggregator by public key.
     * @param {string} publicKey
     * @returns {Promise<Object|null>}
     */
    async findByPublicKey(publicKey) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .select('*')
                .eq('public_key', publicKey)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch (error) {
            logger.error('Failed to find aggregator by public_key:', error);
            throw error;
        }
    }

    /**
     * Update aggregator status.
     * @param {string} nodeId
     * @param {string} status
     * @returns {Promise<Object>}
     */
    async updateStatus(nodeId, status) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .update({ status })
                .eq('node_id', nodeId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to update aggregator ${nodeId} status:`, error);
            throw error;
        }
    }

    /**
     * Update aggregator load (mapped to `active_jobs` column).
     * @param {string} nodeId
     * @param {number} load
     * @returns {Promise<Object>}
     */
    async updateLoad(nodeId, load) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .update({ active_jobs: load })
                .eq('node_id', nodeId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to update aggregator ${nodeId} load:`, error);
            throw error;
        }
    }

    /**
     * Update aggregator reputation.
     * @param {string} nodeId
     * @param {number} reputation
     * @returns {Promise<Object>}
     */
    async updateReputation(nodeId, reputation) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .update({ reputation })
                .eq('node_id', nodeId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to update aggregator ${nodeId} reputation:`, error);
            throw error;
        }
    }

    /**
     * Find available aggregators, optionally filtered.
     * @param {Object} filters
     * @param {number} [filters.minReputation]
     * @param {number} [filters.maxLoad]
     * @returns {Promise<Array>}
     */
    async findAvailable(filters = {}) {
        try {
            const supabase = this.db.getInstance();
            let query = supabase.from(this.table).select('*').eq('status', 'available');

            if (filters.maxLoad !== undefined) {
                query = query.lte('active_jobs', filters.maxLoad);
            }
            if (filters.minReputation !== undefined) {
                query = query.gte('reputation', filters.minReputation);
            }

            query = query
                .order('reputation', { ascending: false })
                .order('active_jobs', { ascending: true });

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('Failed to find available aggregators:', error);
            throw error;
        }
    }

    /**
     * Delete an aggregator.
     * @param {string} nodeId
     * @returns {Promise<boolean>}
     */
    async delete(nodeId) {
        try {
            const existing = await this.findByNodeId(nodeId);
            if (!existing) return false;

            const supabase = this.db.getInstance();
            const { error } = await supabase
                .from(this.table)
                .delete()
                .eq('id', existing.id);
            if (error) throw error;
            return true;
        } catch (error) {
            logger.error(`Failed to delete aggregator ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get all aggregators.
     * @returns {Promise<Array>}
     */
    async getAll() {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase.from(this.table).select('*');
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('Failed to get all aggregators:', error);
            throw error;
        }
    }

    /**
     * Heartbeat — bump last_seen to now.
     * @param {string} nodeId
     * @returns {Promise<Object|null>}
     */
    async heartbeat(nodeId) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .update({ last_seen: new Date().toISOString() })
                .eq('node_id', nodeId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to heartbeat aggregator ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Return jobs currently associated with this aggregator (via the
     * aggregator_id FK on jobs).
     * @param {string} nodeId
     * @returns {Promise<Array>}
     */
    async getActiveJobs(nodeId) {
        try {
            const agg = await this.findByNodeId(nodeId);
            if (!agg) return [];

            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from('jobs')
                .select('*')
                .eq('aggregator_id', agg.id)
                .in('status', ['assigned', 'assigned_to_aggregator', 'running']);
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error(`Failed to get active jobs for aggregator ${nodeId}:`, error);
            throw error;
        }
    }
}

export default Aggregator;
