/**
 * Database utility functions for Infernet Protocol (Supabase backend).
 */
import db from './index.js';

const STAT_TABLES = ['nodes', 'providers', 'clients', 'aggregators', 'jobs', 'models'];

/**
 * Health check — runs a trivial head-count query to confirm Supabase is reachable.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function healthCheck() {
    try {
        const supabase = db.getInstance();
        const { error } = await supabase
            .from('nodes')
            .select('*', { count: 'exact', head: true });
        if (error) {
            return { ok: false, error: error.message };
        }
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Return row counts for each known table.
 * @returns {Promise<Object>} - `{ [table]: count }`
 */
async function getStats() {
    const supabase = db.getInstance();
    const stats = {};

    for (const table of STAT_TABLES) {
        try {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            if (error) {
                console.error(`Error counting ${table}:`, error.message);
                stats[table] = 0;
            } else {
                stats[table] = count ?? 0;
            }
        } catch (err) {
            console.error(`Error counting ${table}:`, err);
            stats[table] = 0;
        }
    }

    return stats;
}

/**
 * Return the number of rows in a single table.
 * @param {string} table
 * @returns {Promise<number>}
 */
async function getCollectionCount(table) {
    try {
        const supabase = db.getInstance();
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });
        if (error) {
            console.error(`Error counting ${table}:`, error.message);
            return 0;
        }
        return count ?? 0;
    } catch (err) {
        console.error(`Error counting ${table}:`, err);
        return 0;
    }
}

/**
 * Count available providers (status='available').
 * @returns {Promise<number>}
 */
async function getActiveProviderCount() {
    try {
        const supabase = db.getInstance();
        const { count, error } = await supabase
            .from('providers')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'available');
        if (error) {
            console.error('Error counting active providers:', error.message);
            return 0;
        }
        return count ?? 0;
    } catch (err) {
        console.error('Error counting active providers:', err);
        return 0;
    }
}

/**
 * Count available aggregators (status='available').
 * @returns {Promise<number>}
 */
async function getActiveAggregatorCount() {
    try {
        const supabase = db.getInstance();
        const { count, error } = await supabase
            .from('aggregators')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'available');
        if (error) {
            console.error('Error counting active aggregators:', error.message);
            return 0;
        }
        return count ?? 0;
    } catch (err) {
        console.error('Error counting active aggregators:', err);
        return 0;
    }
}

/**
 * Count jobs in a specific status.
 * @param {string} status
 * @returns {Promise<number>}
 */
async function getJobCountByStatus(status) {
    try {
        const supabase = db.getInstance();
        const { count, error } = await supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('status', status);
        if (error) {
            console.error(`Error counting ${status} jobs:`, error.message);
            return 0;
        }
        return count ?? 0;
    } catch (err) {
        console.error(`Error counting ${status} jobs:`, err);
        return 0;
    }
}

/**
 * Schema initialization is managed outside this module — the canonical
 * schema is declared in `supabase/migrations/*.sql` and applied via
 * `supabase db push` / `supabase db reset`. This stub exists so older
 * callers don't break on import.
 */
async function initializeSchema() {
    console.log(
        'initializeSchema(): schema is managed by Supabase migrations; nothing to do here.'
    );
}

// Backup/restore note:
// Supabase backups are handled out-of-band by `pg_dump` (for self-hosted) or
// the Supabase dashboard's point-in-time recovery (for hosted projects). No
// in-process backup helper is provided here.

export {
    initializeSchema,
    healthCheck,
    getStats,
    getCollectionCount,
    getActiveProviderCount,
    getActiveAggregatorCount,
    getJobCountByStatus
};
