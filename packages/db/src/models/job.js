/**
 * Job model for Infernet Protocol (Supabase backend).
 *
 * Supabase schema (after 20260419000000_cli_support_and_payments.sql):
 *   jobs(id uuid, title text, status text, payment_offer numeric,
 *        model_name text, client_name text, created_at timestamptz,
 *        type text default 'inference',
 *        client_id uuid FK, provider_id uuid FK, aggregator_id uuid FK,
 *        input_spec jsonb, result jsonb, error text,
 *        payment_coin text, payment_tx_hash text,
 *        payment_status text default 'unpaid', payment_invoice text,
 *        updated_at timestamptz, assigned_at timestamptz,
 *        completed_at timestamptz)
 *
 * FK linkage, type, timestamps, payment fields, and JSON result/input_spec
 * are now fully supported. The legacy `client_name` / `model_name` columns
 * are still populated on write so the legacy UI keeps working until it's
 * migrated.
 */

import { createLogger } from '@infernet/logger';

const logger = createLogger('model:job');
const TABLE = 'jobs';

function pickJobColumns(input = {}) {
    const out = {};
    if (input.title !== undefined) out.title = input.title;
    if (input.status !== undefined) out.status = input.status;
    if (input.payment_offer !== undefined) out.payment_offer = input.payment_offer;
    else if (input.paymentOffer !== undefined) out.payment_offer = input.paymentOffer;
    if (input.model_name !== undefined) out.model_name = input.model_name;
    else if (input.modelName !== undefined) out.model_name = input.modelName;
    if (input.client_name !== undefined) out.client_name = input.client_name;
    else if (input.clientName !== undefined) out.client_name = input.clientName;

    // New columns from 20260419 migration.
    if (input.type !== undefined) out.type = input.type;
    if (input.client_id !== undefined) out.client_id = input.client_id;
    else if (input.clientId !== undefined) out.client_id = input.clientId;
    if (input.provider_id !== undefined) out.provider_id = input.provider_id;
    else if (input.providerId !== undefined) out.provider_id = input.providerId;
    if (input.aggregator_id !== undefined) out.aggregator_id = input.aggregator_id;
    else if (input.aggregatorId !== undefined) out.aggregator_id = input.aggregatorId;
    if (input.input_spec !== undefined) out.input_spec = input.input_spec;
    else if (input.inputSpec !== undefined) out.input_spec = input.inputSpec;
    if (input.result !== undefined) out.result = input.result;
    if (input.error !== undefined) out.error = input.error;
    if (input.payment_coin !== undefined) out.payment_coin = input.payment_coin;
    else if (input.paymentCoin !== undefined) out.payment_coin = input.paymentCoin;
    if (input.payment_tx_hash !== undefined) out.payment_tx_hash = input.payment_tx_hash;
    else if (input.paymentTxHash !== undefined) out.payment_tx_hash = input.paymentTxHash;
    if (input.payment_status !== undefined) out.payment_status = input.payment_status;
    else if (input.paymentStatus !== undefined) out.payment_status = input.paymentStatus;
    if (input.payment_invoice !== undefined) out.payment_invoice = input.payment_invoice;
    else if (input.paymentInvoice !== undefined) out.payment_invoice = input.paymentInvoice;
    if (input.assigned_at !== undefined) out.assigned_at = input.assigned_at;
    else if (input.assignedAt !== undefined) out.assigned_at = input.assignedAt;
    if (input.completed_at !== undefined) out.completed_at = input.completed_at;
    else if (input.completedAt !== undefined) out.completed_at = input.completedAt;
    if (input.updated_at !== undefined) out.updated_at = input.updated_at;
    else if (input.updatedAt !== undefined) out.updated_at = input.updatedAt;

    return out;
}

class Job {
    constructor(db) {
        this.db = db;
        this.table = TABLE;
    }

    /**
     * Create a new job.
     * @param {Object} jobData
     * @returns {Promise<Object>}
     */
    async create(jobData = {}) {
        try {
            const supabase = this.db.getInstance();
            const payload = pickJobColumns({
                status: 'pending',
                payment_offer: 0,
                type: 'inference',
                input_spec: {},
                payment_status: 'unpaid',
                ...jobData
            });

            if (!payload.title) {
                payload.title = `Job-${Date.now()}`;
            }

            logger.info(`Creating new job: ${payload.title}`);
            const { data, error } = await supabase
                .from(this.table)
                .insert(payload)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error('Failed to create job:', error);
            throw error;
        }
    }

    /**
     * Find a job by id. (`jobId` name preserved for API compatibility.)
     * @param {string} jobId
     * @returns {Promise<Object|null>}
     */
    async findByJobId(jobId) {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase
                .from(this.table)
                .select('*')
                .eq('id', jobId)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch (error) {
            logger.error(`Failed to find job ${jobId}:`, error);
            throw error;
        }
    }

    /**
     * Assign a job to a provider. Persists provider_id, flips status to
     * 'assigned', and sets assigned_at / updated_at.
     * @param {string} jobId
     * @param {string} providerId
     * @returns {Promise<Object>}
     */
    async assignToProvider(jobId, providerId) {
        try {
            const supabase = this.db.getInstance();
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from(this.table)
                .update({
                    provider_id: providerId,
                    status: 'assigned',
                    assigned_at: now,
                    updated_at: now
                })
                .eq('id', jobId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to assign job ${jobId} to provider:`, error);
            throw error;
        }
    }

    /**
     * Assign a job to an aggregator. Persists aggregator_id, flips status
     * to 'assigned_to_aggregator', and sets assigned_at / updated_at.
     * @param {string} jobId
     * @param {string} aggregatorId
     * @returns {Promise<Object>}
     */
    async assignToAggregator(jobId, aggregatorId) {
        try {
            const supabase = this.db.getInstance();
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from(this.table)
                .update({
                    aggregator_id: aggregatorId,
                    status: 'assigned_to_aggregator',
                    assigned_at: now,
                    updated_at: now
                })
                .eq('id', jobId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to assign job ${jobId} to aggregator:`, error);
            throw error;
        }
    }

    /**
     * Update job status and drive the timestamp state machine:
     *   running   -> assigned_at (if not set yet)
     *   completed -> completed_at
     *   failed    -> completed_at
     * Always bumps updated_at.
     * @param {string} jobId
     * @param {string} status
     * @returns {Promise<Object>}
     */
    async updateStatus(jobId, status) {
        try {
            const supabase = this.db.getInstance();
            const now = new Date().toISOString();
            const patch = { status, updated_at: now };

            if (status === 'running') {
                const existing = await this.findByJobId(jobId);
                if (existing && !existing.assigned_at) {
                    patch.assigned_at = now;
                }
            }
            if (status === 'completed' || status === 'failed') {
                patch.completed_at = now;
            }

            const { data, error } = await supabase
                .from(this.table)
                .update(patch)
                .eq('id', jobId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to update job ${jobId} status:`, error);
            throw error;
        }
    }

    /**
     * Update job payment information. Supports both the legacy numeric
     * `payment_offer` form and the new object form (coin / tx hash /
     * invoice / status). Always bumps updated_at.
     * @param {string} jobId
     * @param {Object|number} payment
     * @returns {Promise<Object>}
     */
    async updatePayment(jobId, payment) {
        try {
            const supabase = this.db.getInstance();
            const patch = { updated_at: new Date().toISOString() };

            if (typeof payment === 'number') {
                patch.payment_offer = payment;
            } else if (payment && typeof payment === 'object') {
                if (payment.payment_coin !== undefined) patch.payment_coin = payment.payment_coin;
                else if (payment.coin !== undefined) patch.payment_coin = payment.coin;

                if (payment.payment_tx_hash !== undefined)
                    patch.payment_tx_hash = payment.payment_tx_hash;
                else if (payment.txHash !== undefined) patch.payment_tx_hash = payment.txHash;
                else if (payment.tx_hash !== undefined) patch.payment_tx_hash = payment.tx_hash;

                if (payment.payment_invoice !== undefined)
                    patch.payment_invoice = payment.payment_invoice;
                else if (payment.invoice !== undefined) patch.payment_invoice = payment.invoice;

                if (payment.payment_status !== undefined)
                    patch.payment_status = payment.payment_status;
                else if (payment.status !== undefined) patch.payment_status = payment.status;

                if (typeof payment.amount === 'number') {
                    patch.payment_offer = payment.amount;
                } else if (typeof payment.payment_offer === 'number') {
                    patch.payment_offer = payment.payment_offer;
                }
            }

            const { data, error } = await supabase
                .from(this.table)
                .update(patch)
                .eq('id', jobId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to update job ${jobId} payment:`, error);
            throw error;
        }
    }

    /**
     * Record a successful job result.
     * @param {string} jobId
     * @param {*} result - JSON-serializable result payload.
     * @returns {Promise<Object>}
     */
    async recordResult(jobId, result) {
        try {
            const supabase = this.db.getInstance();
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from(this.table)
                .update({
                    result,
                    status: 'completed',
                    completed_at: now,
                    updated_at: now
                })
                .eq('id', jobId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to record result for job ${jobId}:`, error);
            throw error;
        }
    }

    /**
     * Record a failure for a job.
     * @param {string} jobId
     * @param {string} errorMessage
     * @returns {Promise<Object>}
     */
    async recordFailure(jobId, errorMessage) {
        try {
            const supabase = this.db.getInstance();
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from(this.table)
                .update({
                    error: errorMessage,
                    status: 'failed',
                    completed_at: now,
                    updated_at: now
                })
                .eq('id', jobId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Failed to record failure for job ${jobId}:`, error);
            throw error;
        }
    }

    /**
     * Find pending jobs with optional filters.
     * @param {Object} filters
     * @param {string} [filters.type]
     * @param {string} [filters.clientId]
     * @param {string} [filters.clientName]
     * @returns {Promise<Array>}
     */
    async findPending(filters = {}) {
        try {
            const supabase = this.db.getInstance();
            let query = supabase.from(this.table).select('*').eq('status', 'pending');

            if (filters.type !== undefined) {
                query = query.eq('type', filters.type);
            }
            if (filters.clientId !== undefined) {
                query = query.eq('client_id', filters.clientId);
            }
            if (filters.clientName) {
                query = query.eq('client_name', filters.clientName);
            }

            query = query.order('created_at', { ascending: true });
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('Failed to find pending jobs:', error);
            throw error;
        }
    }

    /**
     * Find jobs for a provider via the provider_id FK.
     * @param {string} providerId
     * @param {Object} [filters]
     * @param {string} [filters.status]
     * @returns {Promise<Array>}
     */
    async findByProvider(providerId, filters = {}) {
        try {
            const supabase = this.db.getInstance();
            let query = supabase.from(this.table).select('*').eq('provider_id', providerId);
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.type !== undefined) {
                query = query.eq('type', filters.type);
            }
            query = query.order('created_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error(`Failed to find jobs for provider ${providerId}:`, error);
            throw error;
        }
    }

    /**
     * Find jobs for an aggregator via the aggregator_id FK.
     * @param {string} aggregatorId
     * @param {Object} [filters]
     * @param {string} [filters.status]
     * @returns {Promise<Array>}
     */
    async findByAggregator(aggregatorId, filters = {}) {
        try {
            const supabase = this.db.getInstance();
            let query = supabase.from(this.table).select('*').eq('aggregator_id', aggregatorId);
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.type !== undefined) {
                query = query.eq('type', filters.type);
            }
            query = query.order('created_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error(`Failed to find jobs for aggregator ${aggregatorId}:`, error);
            throw error;
        }
    }

    /**
     * Find jobs for a client via the client_id FK.
     * @param {string} clientId
     * @param {Object} [filters]
     * @param {string} [filters.status]
     * @param {string} [filters.type]
     * @returns {Promise<Array>}
     */
    async findByClient(clientId, filters = {}) {
        try {
            const supabase = this.db.getInstance();
            let query = supabase.from(this.table).select('*').eq('client_id', clientId);
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.type !== undefined) {
                query = query.eq('type', filters.type);
            }
            query = query.order('created_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error(`Failed to find jobs for client ${clientId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a job.
     * @param {string} jobId
     * @returns {Promise<boolean>}
     */
    async delete(jobId) {
        try {
            const existing = await this.findByJobId(jobId);
            if (!existing) return false;

            const supabase = this.db.getInstance();
            const { error } = await supabase
                .from(this.table)
                .delete()
                .eq('id', jobId);
            if (error) throw error;
            return true;
        } catch (error) {
            logger.error(`Failed to delete job ${jobId}:`, error);
            throw error;
        }
    }

    /**
     * Get all jobs.
     * @returns {Promise<Array>}
     */
    async getAll() {
        try {
            const supabase = this.db.getInstance();
            const { data, error } = await supabase.from(this.table).select('*');
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('Failed to get all jobs:', error);
            throw error;
        }
    }

    /**
     * Aggregate job counts by status and by type.
     * @returns {Promise<Object>}
     */
    async getStats() {
        try {
            const supabase = this.db.getInstance();
            const statuses = ['pending', 'assigned', 'assigned_to_aggregator', 'running', 'completed', 'failed'];

            const byStatus = {};
            for (const status of statuses) {
                const { count, error } = await supabase
                    .from(this.table)
                    .select('*', { count: 'exact', head: true })
                    .eq('status', status);
                if (error) throw error;
                byStatus[status] = count ?? 0;
            }

            // byType: fetch distinct type values then count each. We avoid
            // loading every row's full payload by just selecting `type`.
            const byType = {};
            const { data: typeRows, error: typeErr } = await supabase
                .from(this.table)
                .select('type');
            if (typeErr) throw typeErr;
            for (const row of typeRows || []) {
                const t = row.type || 'unknown';
                byType[t] = (byType[t] || 0) + 1;
            }

            const { count: total, error: totalErr } = await supabase
                .from(this.table)
                .select('*', { count: 'exact', head: true });
            if (totalErr) throw totalErr;

            return {
                total: total ?? 0,
                byStatus,
                byType
            };
        } catch (error) {
            logger.error('Failed to get job statistics:', error);
            throw error;
        }
    }
}

export default Job;
