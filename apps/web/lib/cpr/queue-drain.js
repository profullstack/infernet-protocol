import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { tryFlushReceipt } from "./queue.js";

/**
 * IPIP-0007 phase 3 — drain pending CPR receipts.
 *
 * Picks up to `batchSize` rows where status='pending' and
 * next_attempt_at <= now, then calls tryFlushReceipt() for each.
 * tryFlushReceipt updates the row in place (sent / permanent_fail
 * / pending-with-bumped-attempts). Returns aggregate counts so the
 * caller (a scheduler hitting /api/cron/cpr) can log progress.
 *
 * Idempotent: a stuck-mid-flight row (network died after CPR
 * accepted but before our update) gets retried; CoinPay's CPR
 * deduplicates by receipt_id (409 Conflict on duplicate POST).
 */

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

export async function drainPendingReceipts({
    batchSize = DEFAULT_BATCH_SIZE,
    fetchImpl,
    now = new Date()
} = {}) {
    const limit = Math.max(1, Math.min(MAX_BATCH_SIZE, batchSize));
    const supabase = getSupabaseServerClient();

    const { data: rows, error } = await supabase
        .from("cpr_receipts_queue")
        .select("receipt_id, job_id, payload, attempts")
        .eq("status", "pending")
        .lte("next_attempt_at", now.toISOString())
        .order("next_attempt_at", { ascending: true })
        .limit(limit);

    if (error) throw new Error(`drainPendingReceipts: ${error.message}`);

    const result = {
        scanned:        (rows ?? []).length,
        sent:           0,
        retry:          0,
        permanent_fail: 0,
        errors:         []
    };

    for (const row of rows ?? []) {
        try {
            const verdict = await tryFlushReceipt({
                receipt: row.payload,
                jobId: row.job_id,
                fetchImpl
            });
            if (verdict === "sent") result.sent += 1;
            else if (verdict === "permanent_fail") result.permanent_fail += 1;
            else result.retry += 1;
        } catch (err) {
            result.errors.push({
                receipt_id: row.receipt_id,
                message: err?.message ?? String(err)
            });
        }
    }
    return result;
}

export const __testables__ = {
    DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE
};
