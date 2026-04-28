/**
 * Public-facing base URL for redirect Location headers.
 *
 * Don't use `request.url` for redirects — behind a proxy (Railway,
 * Vercel, etc.) `request.url` resolves to the container's internal
 * URL, so the browser ends up at e.g. `https://localhost:8080/...`.
 */
export function appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com";
}
