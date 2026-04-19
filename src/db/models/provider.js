/**
 * Provider model for Infernet Protocol (Supabase backend).
 *
 * Supabase schema (after 20260419000000_cli_support_and_payments.sql):
 *   providers(id uuid, name text, status text, gpu_model text,
 *             price numeric, reputation int, created_at timestamptz,
 *             node_id text unique, public_key text, address text,
 *             port int, specs jsonb, last_seen timestamptz)
 *
 * All CLI-node fields (node_id, public_key, address, port, specs,
 * last_seen) are now fully supported — no more compat stubs.
 */

import crypto from 'crypto';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('model:provider');
const TABLE = 'providers';

/**
 * Return only the columns that actually exist in the providers table.
 * Accepts both snake_case and camelCase input keys.
 */
function pickProviderColumns(input = {}) {
    const out = {};
    if (input.name !== undefined) out.name = input.name;
    if (input.status !== undefined) out.status = input.status;
    if (input.gpu_model !== undefined) out.gpu_model = input.gpu_model;
    else if (input.gpuModel !== undefined) out.gpu_model = input.gpuModel;
    if (input.price !== undefined) out.price = input.price;
    if (input.reputation !== undefined) out.reputation = input.reputation;
    if (input.node_id !== undefined) out.node_id = input.node_id;
    else if (input.nodeId !== undefined) out.node_id = input.nodeId;
    if (input.public_key !== undefined) out.public_key = input.public_key;
    else if (input.publicKey !== undefined) out.public_key = input.publicKey;
    if (input.address !== undefined) out.address = input.address;
    if (input.port !== undefined) out.port = input.port;
    if (input.specs !== undefined) out.specs = input.specs;
    if (input.last_seen !== undefined) out.last_seen = input.last_seen;
    else if (input.lastSeen !== undefined) out.last_seen = input.lastSeen;
    return out;
}

class Provider {
    constructor(db) {
        this.db = db;
        this.table = TABLE;
    }

    /**
     * Register a new provider (or update if one already exists for the
     * given node_id). Always bumps last_seen to now.
     * @param {Object} providerData
     * @returns {Promise<Object>} - Provider record.
     */
    async register(providerData = {}) {
        const supabase = this.db.getInstance();
        const payload = pickProviderColumns({
            status: 'available',
            reputation: 0,
            price: 0,
            specs: {},
            last_seen: new Date().toISOString(),
            ...providerData
        });

        // Synthesize a name if one wasn't supplied.
        if (!payload.name) {
            payload.name = `provider_${crypto.randomBytes(6).toString('hex')}`;
        }

        try {
            // If caller gave us a node_id, upsert on that.
            const lookupNodeId = payload.node_id;
            if (lookupNodeId) {
                const existing = await this.findByNodeId(lookupNodeId);
                if (existing) {
                    logger.info(`Updating existing provider: ${lookupNodeId}`);
                    const { data, error } = await supabase
                        .from(this.table)
                        .update(payload)
                        .eq('node_id', lookupNodeId)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
            } else if (providerData.id) {
                // Fallback: caller gave us a row id.
                const { data: existing } = await supabase
                    .from(this.table)
                    .select('*')
                    .eq('id', providerData.id)
                    .maybeSingle();
                if (existing) {
                    logger.info(`Updating existing provider: ${providerData.id}`);
                    const { data, error } = await supabase
                        .from(this.table)
                        .update(payload)
                        .eq('id', providerData.id)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
            }

            logger.info(`Registering new provider: ${payload.name}`);
            const { data, error } = await supabase
                .from(this.table)
                .insert(payload)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error('Failed to register provider:', error);
            throw error;
        }
    }

    /**
     * Find a provider by node_id (with fallback to row id for callers that
     * still pass a uuid).
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

            // Fallback: treat the argument as a row id.
            const { data: byId, error: byIdErr } = await supabase
                .from(this.table)
                .select('*')
                .eq('id', nodeId)
                .maybeSingle();
            if (byIdErr) throw byIdErr;
            return byId || null;
        } catch (error) {
            logger.error(`Failed to find provider ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Find a provider by its public key.
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
            logger.error(`Failed to find provider by public_key:`, error);
            throw error;
        }
    }

    /**
     * Update provider status.
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
            logger.error(`Failed to update provider ${nodeId} status:`, error);
            throw error;
        }
    }

    /**
     * Update provider specs (jsonb). Also bumps last_seen.
     * @param {string} nodeId
     * @param {Object} specs
     * @returns {Promise<Object>}
     */
    async updateSpecs(nodeId, specs) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .update({
                    specs: specs ?? {},
                    last_seen: new Date().toISOString()
                })
                .eq('node_id', nodeId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to update provider ${nodeId} specs:`, error);
            throw error;
        }
    }

    /**
     * Update provider price.
     * @param {string} nodeId
     * @param {number} price
     * @returns {Promise<Object>}
     */
    async updatePrice(nodeId, price) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .update({ price })
                .eq('node_id', nodeId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to update provider ${nodeId} price:`, error);
            throw error;
        }
    }

    /**
     * Update provider reputation.
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
            logger.error(`Failed to update provider ${nodeId} reputation:`, error);
            throw error;
        }
    }

    /**
     * Find available providers, optionally filtered.
     * @param {Object} filters
     * @param {number} [filters.minReputation]
     * @param {number} [filters.maxPrice]
     * @param {number} [filters.minVram] - minimum vram from `specs->vram`.
     * @returns {Promise<Array>}
     */
    async findAvailable(filters = {}) {
        try {
            const supabase = this.db.getInstance();
            let query = supabase.from(this.table).select('*').eq('status', 'available');

            if (filters.minReputation !== undefined) {
                query = query.gte('reputation', filters.minReputation);
            }
            if (filters.maxPrice !== undefined) {
                query = query.lte('price', filters.maxPrice);
            }

            query = query
                .order('reputation', { ascending: false })
                .order('price', { ascending: true });

            const { data, error } = await query;
            if (error) throw error;
            let rows = data || [];

            // JS-side vram filter. jsonb comparisons via PostgREST are
            // tricky (values come back as text and numeric cast via
            // `specs->>vram` is unreliable across drivers), so we filter
            // client-side — the result set is already narrowed by status /
            // reputation / price, so this stays cheap.
            if (filters.minVram !== undefined) {
                const min = Number(filters.minVram);
                rows = rows.filter((row) => {
                    const vram = Number(row?.specs?.vram);
                    return Number.isFinite(vram) && vram >= min;
                });
            }

            return rows;
        } catch (error) {
            logger.error('Failed to find available providers:', error);
            throw error;
        }
    }

    /**
     * Delete a provider.
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
            logger.error(`Failed to delete provider ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get all providers.
     * @returns {Promise<Array>}
     */
    async getAll() {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase.from(this.table).select('*');
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('Failed to get all providers:', error);
            throw error;
        }
    }

    /**
     * Heartbeat — bump last_seen to now for the given node.
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
            logger.error(`Failed to heartbeat provider ${nodeId}:`, error);
            throw error;
        }
    }
}

export default Provider;
