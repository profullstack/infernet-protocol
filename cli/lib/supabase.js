/**
 * Supabase client helper for the infernet CLI.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Build a Supabase client from a CLI config object.
 * @param {Object} config - The full CLI config.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseFromConfig(config) {
    if (!config || !config.supabase) {
        throw new Error('Config is missing a `supabase` section; run `infernet init`.');
    }
    const { url, serviceRoleKey } = config.supabase;
    const schema = config.supabase.schema ?? 'public';

    if (!url) {
        throw new Error('config.supabase.url is not set; run `infernet login`.');
    }
    if (!serviceRoleKey) {
        throw new Error('config.supabase.serviceRoleKey is not set; run `infernet login`.');
    }

    return createClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        },
        db: { schema }
    });
}
