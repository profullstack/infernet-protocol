/**
 * IPIP-0026 Phase 1 — client-side secret detection patterns.
 * Scanned against prompt text before any network call.
 * Patterns are best-effort warnings, not a security guarantee.
 * Pure JS — no imports, no Node builtins — must bundle for the browser.
 */

export const SECRET_PATTERNS = [
    {
        id: "aws-access-key",
        label: "AWS access key",
        pattern: /AKIA[0-9A-Z]{16}/
    },
    {
        id: "aws-secret-key",
        label: "AWS secret key",
        pattern: /(?:aws[_-]?secret|AWS[_-]?SECRET)[^=\n]*[:=]\s*[A-Za-z0-9/+=]{36,44}/i
    },
    {
        id: "gcp-service-account",
        label: "GCP service account",
        pattern: /"type"\s*:\s*"service_account"/
    },
    {
        id: "github-token",
        label: "GitHub token",
        pattern: /gh[pousr]_[A-Za-z0-9]{36,}/
    },
    {
        id: "generic-api-key",
        label: "API key / secret",
        pattern: /(?:api[_-]?key|api[_-]?secret|access[_-]?token)\s*[:=]\s*\S{16,}/i
    },
    {
        id: "jwt",
        label: "JWT token",
        pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/
    },
    {
        id: "private-key-pem",
        label: "Private key (PEM)",
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
    },
    {
        id: "database-url",
        label: "Database URL",
        pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^@\s]+@/i
    },
    {
        id: "credit-card",
        label: "Credit card number",
        pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/
    }
];

/**
 * Scan text against all patterns. Returns array of matching pattern objects.
 * Never sends matched text anywhere — called entirely client-side.
 */
export function scanForSecrets(text) {
    if (!text || typeof text !== "string") return [];
    return SECRET_PATTERNS.filter((p) => p.pattern.test(text));
}
