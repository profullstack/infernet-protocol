import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * node_commands data layer — owner-side issuing + daemon-side polling.
 * Server-only; every entry point re-checks who's allowed to do what
 * before touching the table.
 */

const KNOWN_COMMANDS = new Set(["model_install", "model_remove"]);
const MAX_POLL_LIMIT = 10;

export function isValidCommand(verb) {
    return KNOWN_COMMANDS.has(verb);
}

/**
 * Verify that user_id owns the target pubkey via pubkey_links.
 * Returns true / false; throws only on DB errors.
 */
export async function userOwnsPubkey(userId, pubkey) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("pubkey_links")
        .select("id")
        .eq("user_id", userId)
        .eq("pubkey", pubkey)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return !!data;
}

/**
 * Owner inserts a command targeting a specific node. Caller MUST have
 * already verified the user owns the pubkey.
 */
export async function issueCommand({ userId, pubkey, command, args }) {
    if (!isValidCommand(command)) {
        const err = new Error(`unknown command: ${command}`);
        err.status = 400;
        throw err;
    }
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("node_commands")
        .insert({
            pubkey,
            command,
            args: args ?? {},
            issued_by: userId,
            status: "pending"
        })
        .select("id, command, args, status, issued_at")
        .single();
    if (error) {
        const err = new Error(error.message);
        err.status = 500;
        throw err;
    }
    return data;
}

/**
 * List recent commands targeting a pubkey. Owner-side dashboard view —
 * caller passes the user_id and we re-verify ownership.
 */
export async function listCommandsForPubkey({ userId, pubkey, limit = 20 }) {
    if (!(await userOwnsPubkey(userId, pubkey))) {
        const err = new Error("not the owner of that pubkey");
        err.status = 403;
        throw err;
    }
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("node_commands")
        .select("id, command, args, status, result, error, issued_at, started_at, completed_at")
        .eq("pubkey", pubkey)
        .order("issued_at", { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 100));
    if (error) throw new Error(error.message);
    return data ?? [];
}

/**
 * Daemon claims pending commands for itself: status pending → running,
 * starts_at = now, returns the rows it claimed. Atomic-ish via
 * select-then-update; in the rare race where two daemon instances poll
 * with the same pubkey, both might see the same row but only one will
 * succeed at flipping it (status='pending' guard in the update).
 */
export async function pollCommandsForNode({ pubkey, limit = 5 }) {
    const supabase = getSupabaseServerClient();
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), MAX_POLL_LIMIT);

    const { data: pending, error: peekErr } = await supabase
        .from("node_commands")
        .select("id, command, args, status")
        .eq("pubkey", pubkey)
        .eq("status", "pending")
        .order("issued_at", { ascending: true })
        .limit(safeLimit);
    if (peekErr) throw new Error(peekErr.message);

    const claimed = [];
    for (const row of pending ?? []) {
        const { data: updated, error: upErr } = await supabase
            .from("node_commands")
            .update({ status: "running", started_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("status", "pending")
            .select("id, command, args")
            .maybeSingle();
        if (upErr) continue;
        if (updated) claimed.push(updated);
    }
    return { commands: claimed };
}

/**
 * Daemon reports a command finished. Verifies the row's pubkey
 * matches the daemon's pubkey before updating — prevents one
 * compromised key from completing another node's commands.
 */
export async function completeCommandForNode({ pubkey, commandId, status, result, errorMessage }) {
    if (!commandId) {
        const err = new Error("commandId is required");
        err.status = 400;
        throw err;
    }
    if (!["completed", "failed"].includes(status)) {
        const err = new Error("status must be completed | failed");
        err.status = 400;
        throw err;
    }
    const supabase = getSupabaseServerClient();
    const { data: row, error: lookErr } = await supabase
        .from("node_commands")
        .select("id, pubkey")
        .eq("id", commandId)
        .maybeSingle();
    if (lookErr) throw new Error(lookErr.message);
    if (!row) {
        const err = new Error("command not found");
        err.status = 404;
        throw err;
    }
    if (row.pubkey !== pubkey) {
        const err = new Error("command does not target this pubkey");
        err.status = 403;
        throw err;
    }

    const patch = {
        status,
        completed_at: new Date().toISOString(),
        ...(result !== undefined ? { result } : {}),
        ...(errorMessage ? { error: errorMessage } : {})
    };
    const { error: upErr } = await supabase
        .from("node_commands")
        .update(patch)
        .eq("id", commandId);
    if (upErr) throw new Error(upErr.message);
    return { id: commandId, status };
}
