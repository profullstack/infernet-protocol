/**
 * Client model for Infernet Protocol (Supabase backend).
 *
 * Supabase schema (after 20260419000000_cli_support_and_payments.sql):
 *   clients(id uuid, name text, status text, budget_usd numeric,
 *           created_at timestamptz, node_id text unique, public_key text,
 *           address text, last_seen timestamptz)
 *
 * All CLI-node fields (node_id, public_key, address, last_seen) are now
 * fully supported — no more compat stubs.
 */

import crypto from 'crypto';
import { createLogger } from '@infernetprotocol/logger';

const logger = createLogger('model:client');
const TABLE = 'clients';

function pickClientColumns(input = {}) {
    const out = {};
    if (input.name !== undefined) out.name = input.name;
    if (input.status !== undefined) out.status = input.status;
    if (input.budget_usd !== undefined) out.budget_usd = input.budget_usd;
    else if (input.budgetUsd !== undefined) out.budget_usd = input.budgetUsd;
    if (input.node_id !== undefined) out.node_id = input.node_id;
    else if (input.nodeId !== undefined) out.node_id = input.nodeId;
    if (input.public_key !== undefined) out.public_key = input.public_key;
    else if (input.publicKey !== undefined) out.public_key = input.publicKey;
    if (input.address !== undefined) out.address = input.address;
    if (input.last_seen !== undefined) out.last_seen = input.last_seen;
    else if (input.lastSeen !== undefined) out.last_seen = input.lastSeen;
    return out;
}

class Client {
    constructor(db) {
        this.db = db;
        this.table = TABLE;
    }

    /**
     * Register a new client (or update by node_id / row id if present).
     * @param {Object} clientData
     * @returns {Promise<Object>}
     */
    async register(clientData = {}) {
        const supabase = this.db.getInstance();
        const payload = pickClientColumns({
            status: 'active',
            budget_usd: 0,
            last_seen: new Date().toISOString(),
            ...clientData
        });

        if (!payload.name) {
            payload.name = `client_${crypto.randomBytes(6).toString('hex')}`;
        }

        try {
            const lookupNodeId = payload.node_id;
            if (lookupNodeId) {
                const existing = await this.findByNodeId(lookupNodeId);
                if (existing) {
                    logger.info(`Updating existing client: ${lookupNodeId}`);
                    const { data, error } = await supabase
                        .from(this.table)
                        .update(payload)
                        .eq('node_id', lookupNodeId)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
            } else if (clientData.id) {
                const { data: existing } = await supabase
                    .from(this.table)
                    .select('*')
                    .eq('id', clientData.id)
                    .maybeSingle();
                if (existing) {
                    logger.info(`Updating existing client: ${clientData.id}`);
                    const { data, error } = await supabase
                        .from(this.table)
                        .update(payload)
                        .eq('id', clientData.id)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
            }

            logger.info(`Registering new client: ${payload.name}`);
            const { data, error } = await supabase
                .from(this.table)
                .insert(payload)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error('Failed to register client:', error);
            throw error;
        }
    }

    /**
     * Find a client by node_id, falling back to row id.
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
            logger.error(`Failed to find client ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Find a client by public key.
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
            logger.error('Failed to find client by public_key:', error);
            throw error;
        }
    }

    /**
     * Update a client's network address. Also bumps last_seen.
     * @param {string} nodeId
     * @param {string} address
     * @returns {Promise<Object>}
     */
    async updateAddress(nodeId, address) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .update({
                    address,
                    last_seen: new Date().toISOString()
                })
                .eq('node_id', nodeId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to update client ${nodeId} address:`, error);
            throw error;
        }
    }

    /**
     * Return jobs for this client. Uses the real client_id FK now.
     * @param {string} nodeId - client row id or node_id.
     * @returns {Promise<Array>}
     */
    async getJobHistory(nodeId) {
        try {
            const client = await this.findByNodeId(nodeId);
            if (!client) {
                throw new Error(`Client ${nodeId} not found`);
            }
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from('jobs')
                .select('*')
                .eq('client_id', client.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error(`Failed to get job history for client ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a client.
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
            logger.error(`Failed to delete client ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get all clients.
     * @returns {Promise<Array>}
     */
    async getAll() {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase.from(this.table).select('*');
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('Failed to get all clients:', error);
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
            logger.error(`Failed to heartbeat client ${nodeId}:`, error);
            throw error;
        }
    }
}

export default Client;
