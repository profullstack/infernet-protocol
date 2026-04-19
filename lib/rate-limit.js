import "server-only";

/**
 * Very simple in-memory rate limiter keyed on a string (typically an IP
 * address). Good enough for MVP chat; replace with a Redis/Supabase-
 * backed limiter before scaling beyond one Next.js process.
 *
 * Usage:
 *   const limit = rateLimit({ windowMs: 60_000, max: 20 });
 *   const res = limit.check(ip);
 *   if (!res.ok) return new Response('slow down', { status: 429 });
 */

export function rateLimit({ windowMs, max }) {
  /** @type {Map<string, { count: number, reset: number }>} */
  const bucket = new Map();

  function check(key) {
    const now = Date.now();
    let entry = bucket.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      bucket.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const ok = entry.count <= max;
    return { ok, remaining, resetAt: entry.reset };
  }

  // Periodically prune expired entries so the Map doesn't grow unbounded
  // in a long-running server process.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of bucket) if (v.reset <= now) bucket.delete(k);
  }, Math.max(windowMs, 30_000));
  // In Next.js' dev server this would otherwise prevent the process from
  // exiting when the app is stopped.
  if (typeof sweep.unref === "function") sweep.unref();

  return { check };
}

export function getClientIp(request) {
  const h = request.headers;
  const xf = h.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "anonymous";
}
