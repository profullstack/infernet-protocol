/**
 * Supabase client for the Infernet Protocol mobile app.
 *
 * Uses AsyncStorage for session persistence (React Native compatible).
 * `expo-secure-store` is NOT used here for auth storage — Supabase's auth
 * storage option requires a synchronous-ish API surface that matches
 * AsyncStorage. Secrets unrelated to auth may still use SecureStore elsewhere.
 *
 * Config comes from Expo public env vars:
 *   - EXPO_PUBLIC_SUPABASE_URL
 *   - EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * The mobile app uses the **anon key** only. Row-level security (RLS)
 * policies on the Supabase project enforce what clients can do.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const DEFAULT_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Build a Supabase client configured for React Native.
 *
 * @param {string} url - Supabase project URL.
 * @param {string} anonKey - Supabase anon/public API key.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
const buildClient = (url, anonKey) =>
  createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

// Singleton client used by the rest of the app.
export const supabase = buildClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);

/**
 * Simple observable store for the current list of available nodes.
 * React-friendly: exposes subscribe(fn) / unsubscribe(fn), and pushes
 * updates from Supabase Realtime on the `nodes` table.
 */
class NodesStore {
  constructor() {
    this._value = [];
    this._listeners = new Set();
  }

  get value() {
    return this._value;
  }

  set(next) {
    this._value = Array.isArray(next) ? next : [];
    this._notify();
  }

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.add(fn);
    // Emit current value immediately, matching the Svelte store convention.
    try {
      fn(this._value);
    } catch (err) {
      console.error('availableNodes subscriber error:', err);
    }
    return () => this.unsubscribe(fn);
  }

  unsubscribe(fn) {
    this._listeners.delete(fn);
  }

  _notify() {
    for (const fn of this._listeners) {
      try {
        fn(this._value);
      } catch (err) {
        console.error('availableNodes subscriber error:', err);
      }
    }
  }
}

export const availableNodes = new NodesStore();

/**
 * Map a raw `nodes` row (snake_case) to a shape the rest of the app
 * expects. The legacy code filters on `source` and `status`, so we
 * normalize accordingly while preserving raw fields.
 *
 * @param {object} row - A row from the `nodes` table.
 * @returns {object} Normalized node.
 */
const mapNode = (row) => ({
  ...row,
  // Legacy code split by `source` ("local" | "remote"). We don't have a
  // `source` column — infer from region (`local-*`) or default to remote.
  source: row?.region && row.region.startsWith('local') ? 'local' : 'remote',
});

class MobileSupabaseService {
  constructor() {
    this.client = supabase;
    this.realtimeChannel = null;
    this.connected = false;
  }

  /**
   * Initialize the service. Optionally override the Supabase URL when
   * a user points the app at a self-hosted instance. When overridden,
   * we rebuild a private client but keep the exported singleton in sync
   * so downstream modules (e.g. AuthContext) see the new client.
   *
   * @param {string} [url] - Optional Supabase URL override.
   * @returns {Promise<boolean>} True when Realtime subscription is active.
   */
  async init(url) {
    try {
      if (url && url !== DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY) {
        this.client = buildClient(url, DEFAULT_SUPABASE_ANON_KEY);
      } else {
        this.client = supabase;
      }

      // Prime the store with current rows.
      await this.fetchNodes();

      // Subscribe to realtime changes on the nodes table.
      this._unsubscribeRealtime();
      this.realtimeChannel = this.client
        .channel('nodes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'nodes' },
          () => {
            // On any change, refetch to keep things simple and consistent.
            this.fetchNodes().catch((err) =>
              console.error('Failed to refresh nodes after realtime event:', err),
            );
          },
        )
        .subscribe((status) => {
          this.connected = status === 'SUBSCRIBED';
        });

      return true;
    } catch (error) {
      console.error('Supabase init failed:', error);
      this.connected = false;
      return false;
    }
  }

  /**
   * Disconnect the Realtime channel. The auth session is left intact so
   * the user stays logged in across reconnects.
   */
  disconnect() {
    this._unsubscribeRealtime();
    this.connected = false;
  }

  _unsubscribeRealtime() {
    if (this.realtimeChannel) {
      try {
        this.client.removeChannel(this.realtimeChannel);
      } catch (err) {
        console.warn('Failed to remove realtime channel:', err);
      }
      this.realtimeChannel = null;
    }
  }

  /**
   * Fetch all rows from the `nodes` table and update the store.
   *
   * @returns {Promise<{items: object[]}>}
   */
  async fetchNodes() {
    const { data, error } = await this.client
      .from('nodes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch nodes:', error);
      throw error;
    }

    const items = (data || []).map(mapNode);
    availableNodes.set(items);
    return { items };
  }

  /**
   * Insert a new job row.
   *
   * @param {object} jobData - Job fields; snake_case per the schema.
   * @returns {Promise<object>} The inserted row.
   */
  async submitJob(jobData) {
    const { data, error } = await this.client
      .from('jobs')
      .insert(jobData)
      .select()
      .single();

    if (error) {
      console.error('Failed to submit job:', error);
      throw error;
    }

    return data;
  }

  /**
   * Get a single job by id.
   *
   * @param {string} jobId - The job id.
   * @returns {Promise<object>} The job row.
   */
  async getJobStatus(jobId) {
    const { data, error } = await this.client
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      console.error('Failed to get job status:', error);
      throw error;
    }

    return data;
  }

  /**
   * Get jobs owned by a particular client.
   *
   * The schema has `client_name` (not a user id FK), so we filter on that.
   * Callers should pass the client's name as stored in the `clients` table.
   *
   * @param {string} userId - Client id/name to filter by.
   * @returns {Promise<object[]>} Matching job rows.
   */
  async getUserJobs(userId) {
    const { data, error } = await this.client
      .from('jobs')
      .select('*')
      .eq('client_name', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to get user jobs:', error);
      throw error;
    }

    return data || [];
  }
}

const service = new MobileSupabaseService();

export default service;
