/**
 * Thin REST client for the Infernet Protocol control-plane API.
 *
 * Talks to the same Next.js routes the dashboard uses (/api/jobs,
 * /api/providers, /api/overview). The mobile app does NOT hit
 * Supabase directly for these surfaces — that would require shipping
 * row-level-security-aware queries to the device. Instead the Next.js
 * API serves as the trust boundary.
 *
 * Override the host with EXPO_PUBLIC_INFERNET_API_URL (e.g. for local
 * dev against http://127.0.0.1:8080).
 */

const DEFAULT_BASE_URL = 'https://infernetprotocol.com';

export const INFERNET_API_URL =
    process.env.EXPO_PUBLIC_INFERNET_API_URL || DEFAULT_BASE_URL;

async function getJson(path, { signal } = {}) {
    const url = `${INFERNET_API_URL}${path}`;
    const res = await fetch(url, {
        signal,
        headers: { accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`GET ${path} failed: HTTP ${res.status}`);
    }
    return res.json();
}

export async function fetchOverview(opts) {
    return getJson('/api/overview', opts);
}

export async function fetchJobs({ limit = 20, status, signal } = {}) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (status) params.set('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const body = await getJson(`/api/jobs${qs}`, { signal });
    return Array.isArray(body?.data) ? body.data : [];
}

export async function fetchProviders({ limit = 20, status, signal } = {}) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (status) params.set('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const body = await getJson(`/api/providers${qs}`, { signal });
    return Array.isArray(body?.data) ? body.data : [];
}
