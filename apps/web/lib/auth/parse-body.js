import "server-only";

/**
 * Parse a Request body as either JSON or x-www-form-urlencoded /
 * multipart form data. Returns a plain object.
 *
 * Used by /api/auth/* routes so the same handler accepts:
 *   - HTML form POSTs from /auth/login, /auth/signup, etc.
 *   - JSON POSTs from the SDK / CLI / curl
 */
export async function parseAuthBody(request) {
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
        try { return await request.json(); }
        catch { return {}; }
    }
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        const form = await request.formData();
        const out = {};
        for (const [k, v] of form.entries()) {
            out[k] = typeof v === "string" ? v : "";
        }
        return out;
    }
    return {};
}

/**
 * Decide whether a request expects an HTML redirect (form POST from
 * a browser) or a JSON response (programmatic POST).
 */
export function wantsRedirect(request) {
    const accept = request.headers.get("accept") || "";
    const ct = request.headers.get("content-type") || "";
    if (accept.includes("application/json")) return false;
    if (ct.includes("application/json")) return false;
    return true;
}
