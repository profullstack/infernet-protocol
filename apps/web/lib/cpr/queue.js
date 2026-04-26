import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { classifyResult, isCprConfigured, submitReceipt } from "./cpr-client.js";

/**
 * IPIP-0007 phase 2 — CPR receipt queue helpers.
 *
 * Receipts are written to `cpr_receipts_queue` first (durable), then
 * an attempt is made to flush immediately. If CPR is down or the
 * issuer key isn't set, the row stays `pending` for a worker to
 * drain later (phase 3). Job completion never blocks on CPR.
 */

const MAX_ATTEMPTS = 8;
// Exponential back-off in seconds: 30, 60, 120, 240, 480, 960, 1920, 3840 (≈64 min).
const BACKOFF_BASE_S = 30;

function backoffSeconds(attempts) {
    return BACKOFF_BASE_S * Math.pow(2, Math.max(0, attempts));
}

export async function enqueueReceipt({ receipt, jobId }) {
    if (!receipt || !receipt.receipt_id) {
        throw new Error("enqueueReceipt: receipt.receipt_id is required");
    }
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("cpr_receipts_queue").insert({
        receipt_id: receipt.receipt_id,
        job_id: jobId ?? null,
        payload: receipt,
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString()
    });
    if (error) throw new Error(`enqueueReceipt: ${error.message}`);
}

/**
 * Try to send a receipt right now. Returns the queue's new status.
 * Never throws — failure paths update the queue row instead.
 */
export async function tryFlushReceipt({ receipt, jobId, fetchImpl } = {}) {
    if (!isCprConfigured()) {
        // Configured-but-not-yet — leave it queued, do nothing.
        return "pending";
    }
    let result;
    try {
        result = await submitReceipt(receipt, { fetchImpl });
    } catch (err) {
        await markRetry(receipt.receipt_id, err?.message ?? String(err));
        return "pending";
    }
    const verdict = classifyResult(result);
    if (verdict === "sent") {
        await markSent(receipt.receipt_id);
        return "sent";
    }
    if (verdict === "permanent_fail") {
        await markPermanentFail(receipt.receipt_id, JSON.stringify(result.body ?? {}));
        return "permanent_fail";
    }
    await markRetry(receipt.receipt_id, `HTTP ${result.status}`);
    return "pending";
}

/**
 * Convenience: enqueue + immediately attempt to flush. Used at job
 * completion time so CPR sees receipts promptly when reachable.
 */
export async function enqueueAndFlush({ receipt, jobId, fetchImpl } = {}) {
    await enqueueReceipt({ receipt, jobId });
    return tryFlushReceipt({ receipt, jobId, fetchImpl });
}

async function markSent(receiptId) {
    const supabase = getSupabaseServerClient();
    await supabase
        .from("cpr_receipts_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("receipt_id", receiptId);
}

async function markRetry(receiptId, lastError) {
    const supabase = getSupabaseServerClient();
    const { data: row } = await supabase
        .from("cpr_receipts_queue")
        .select("attempts")
        .eq("receipt_id", receiptId)
        .maybeSingle();
    const attempts = (row?.attempts ?? 0) + 1;
    const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    const next = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
    await supabase
        .from("cpr_receipts_queue")
        .update({
            status,
            attempts,
            last_error: String(lastError ?? "").slice(0, 1024),
            next_attempt_at: next
        })
        .eq("receipt_id", receiptId);
}

async function markPermanentFail(receiptId, lastError) {
    const supabase = getSupabaseServerClient();
    await supabase
        .from("cpr_receipts_queue")
        .update({
            status: "permanent_fail",
            last_error: String(lastError ?? "").slice(0, 1024)
        })
        .eq("receipt_id", receiptId);
}

export const __testables__ = {
    backoffSeconds,
    MAX_ATTEMPTS,
    BACKOFF_BASE_S
};
