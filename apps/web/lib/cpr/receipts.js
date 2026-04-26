import "server-only";
import { createHash, randomUUID } from "node:crypto";

/**
 * IPIP-0007 phase 2 — CPR Receipt builder.
 *
 * Translates an Infernet job (post-completion) into the canonical CPR
 * Receipt shape per IPIP-0007. Pure function — no DB calls, no HTTP,
 * deterministic for a given input. Side effects (queueing, POSTing
 * to CoinPay) live in queue.js / cpr-client.js.
 *
 * The Receipt is the immutable record that anchors a provider's
 * reputation. Three-way signed in the full design (provider / client
 * / platform); phase 2 emits the platform half — provider/client
 * signatures land in phase 4.
 */

/**
 * Resolve the platform DID from NEXT_PUBLIC_APP_URL. Self-host
 * deployments at acme.example get did:web:acme.example automatically.
 */
export function platformDid({ appUrl } = {}) {
    const u = appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com";
    const host = String(u).replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `did:web:${host}`;
}

/**
 * `did:nostr:<hex64>` for any bare Nostr pubkey. Falls back to a
 * platform-anonymous DID for unauthenticated submissions (e.g.
 * /api/chat from a browser without a signed envelope).
 *
 * The anonymous form embeds the platform DID + job id so it's still
 * unique and resolvable, just not pubkey-backed.
 */
export function partyDid(pubkey, { fallbackJobId, appUrl } = {}) {
    if (typeof pubkey === "string" && /^[0-9a-f]{64}$/i.test(pubkey)) {
        return `did:nostr:${pubkey.toLowerCase()}`;
    }
    const platform = platformDid({ appUrl });
    return fallbackJobId
        ? `${platform}:anon:${fallbackJobId}`
        : `${platform}:anon`;
}

/**
 * Map Infernet job.type to CPR category. CPR uses "<job-type>:<sub>"
 * so reputation can be split per kind of work.
 */
export function categoryFor(jobType, jobSubtype) {
    const main = String(jobType ?? "inference").toLowerCase();
    if (jobSubtype) return `${main}:${String(jobSubtype).toLowerCase()}`;
    return main === "inference" ? "inference:chat" : main;
}

/**
 * Stable JSON serialization for hashing / signing. Sorted keys at
 * every depth, no insignificant whitespace, no `undefined`. This is
 * the byte stream signed by all three parties.
 */
export function canonicalize(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
        return "[" + value.map(canonicalize).join(",") + "]";
    }
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

/**
 * SHA-256 over the joined token text from a job's events. Used as
 * `artifact_hash` in the receipt — proves the provider produced a
 * specific output, irrespective of token boundaries.
 */
export function artifactHashFromEvents(events) {
    const tokens = (events ?? [])
        .filter((e) => e?.event_type === "token")
        .map((e) => e?.data?.text ?? "")
        .join("");
    return "sha256:" + createHash("sha256").update(tokens, "utf8").digest("hex");
}

/**
 * Map job status / failure reason to CPR outcome.
 */
export function outcomeFromJob(job, { disputed = false } = {}) {
    if (disputed) return { outcome: "disputed", dispute: true };
    if (job?.status === "failed") return { outcome: "rejected", dispute: false };
    return { outcome: "accepted", dispute: false };
}

/**
 * Build the receipt body (everything but signatures). Signatures are
 * computed by callers that hold the relevant keys.
 *
 * @param {{
 *   job: { id, type?, status, payment_offer?, payment_coin?, model_name?, payment_tx_hash? },
 *   provider: { public_key, id },
 *   client?: { public_key?, id? },
 *   events?: Array<{event_type:string,data:any}>,
 *   sla?: object,
 *   appUrl?: string
 * }} args
 */
export function buildReceiptBody(args) {
    const { job, provider, client, events, sla, appUrl } = args;
    if (!job || !job.id) throw new Error("buildReceiptBody: job.id is required");
    if (!provider || !provider.public_key) {
        throw new Error("buildReceiptBody: provider.public_key is required");
    }

    const platform = platformDid({ appUrl });
    const agentDid = partyDid(provider.public_key, { appUrl });
    const buyerDid = partyDid(client?.public_key, { fallbackJobId: job.id, appUrl });
    const { outcome, dispute } = outcomeFromJob(job);

    const body = {
        receipt_id:    randomUUID(),
        task_id:       job.id,
        agent_did:     agentDid,
        buyer_did:     buyerDid,
        platform_did:  platform,
        category:      categoryFor(job.type, job.input_spec?.subtype),
        amount:        Number.parseFloat(job.payment_offer ?? 0) || 0,
        currency:      job.payment_coin ?? null,
        escrow_tx:     job.payment_tx_hash ?? null,
        sla:           sla ?? null,
        outcome,
        dispute,
        artifact_hash: events ? artifactHashFromEvents(events) : null,
        created_at:    new Date().toISOString()
    };
    return body;
}

export const __testables__ = {
    canonicalize,
    artifactHashFromEvents,
    outcomeFromJob,
    categoryFor,
    partyDid,
    platformDid
};
