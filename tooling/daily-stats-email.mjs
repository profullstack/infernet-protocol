#!/usr/bin/env node
/**
 * Infernet Protocol — Daily stats email.
 *
 * Queries Supabase via PostgREST (no SDK dep) and emails a daily report via
 * Resend. Designed to be run from cron on the control-plane box.
 *
 * Usage:
 *   node tooling/daily-stats-email.mjs              # send to default
 *   node tooling/daily-stats-email.mjs --to me@x    # override recipient
 *   node tooling/daily-stats-email.mjs --dry-run    # print only, do not send
 *
 * Env (loaded from .env at repo root if present):
 *   NEXT_PUBLIC_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   STATS_FROM_EMAIL          (optional, default "Infernet Stats <stats@infernetprotocol.com>")
 *   STATS_TO_EMAIL            (optional, default anthony@profullstack.com)
 *
 * Cron:
 *   0 8 * * * cd /home/ubuntu/src/infernet-protocol && node tooling/daily-stats-email.mjs >> /tmp/infernet-daily-stats.log 2>&1
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ─── Tiny .env loader (matches tooling/cpr-canary.mjs) ─────────────────────
function loadDotenvIfPresent() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(here, "..", ".env"),
        join(process.cwd(), ".env")
    ];
    for (const p of candidates) {
        if (!existsSync(p)) continue;
        const txt = readFileSync(p, "utf8");
        for (const raw of txt.split("\n")) {
            const line = raw.trim();
            if (!line || line.startsWith("#")) continue;
            const eq = line.indexOf("=");
            if (eq < 0) continue;
            const k = line.slice(0, eq).trim();
            let v = line.slice(eq + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
            }
            // .env always wins over inherited shell env (intentional — keeps
            // each repo's daily-stats key isolated from any global export).
            process.env[k] = v;
        }
        return p;
    }
    return null;
}
loadDotenvIfPresent();

// ─── CLI args ──────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const toIdx = process.argv.findIndex((a) => a === "--to");
const TO_EMAIL =
    toIdx >= 0 && process.argv[toIdx + 1]
        ? process.argv[toIdx + 1]
        : process.env.STATS_TO_EMAIL || "anthony@profullstack.com";
const FROM_EMAIL =
    process.env.STATS_FROM_EMAIL || "Infernet Stats <stats@infernetprotocol.com>";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

// ─── PostgREST helpers ─────────────────────────────────────────────────────

function pgUrl(table, params = "") {
    const base = SUPABASE_URL.replace(/\/+$/, "");
    return `${base}/rest/v1/${table}${params ? `?${params}` : ""}`;
}

const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    Prefer: "count=exact",
    "Content-Type": "application/json",
};

function parseCountFromContentRange(cr) {
    // "0-0/12345" or "*/0"
    if (!cr) return 0;
    const slash = cr.lastIndexOf("/");
    if (slash < 0) return 0;
    const total = cr.slice(slash + 1);
    const n = Number(total);
    return Number.isFinite(n) ? n : 0;
}

async function count(table, filterQuery = "") {
    const url = pgUrl(table, `select=*&limit=1${filterQuery ? `&${filterQuery}` : ""}`);
    const res = await fetch(url, { method: "HEAD", headers });
    if (!res.ok) {
        // 404 = table missing (migration not applied); other = log and skip.
        if (res.status !== 404) {
            console.warn(`  count(${table}${filterQuery ? `?${filterQuery}` : ""}) → ${res.status}`);
        }
        return 0;
    }
    return parseCountFromContentRange(res.headers.get("content-range"));
}

async function countSinceHours(table, col, hours) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    return count(table, `${encodeURIComponent(col)}=gte.${encodeURIComponent(since)}`);
}

async function countSinceDays(table, col, days) {
    return countSinceHours(table, col, days * 24);
}

async function fetchRows(table, params) {
    const url = pgUrl(table, params);
    const res = await fetch(url, { headers });
    if (!res.ok) {
        console.warn(`  fetch(${table}?${params}) → ${res.status}`);
        return [];
    }
    return res.json();
}

// ─── Build report ──────────────────────────────────────────────────────────

async function buildReport() {
    const dateStr = new Date().toISOString().split("T")[0];

    // Users (auth-linked profiles in our schema; tracked via `users` table)
    const totalUsers = await count("users");
    const newUsers24h = await countSinceHours("users", "created_at", 24);
    const newUsers7d = await countSinceDays("users", "created_at", 7);
    const newUsers30d = await countSinceDays("users", "created_at", 30);

    // Nodes (all roles unified)
    const totalNodes = await count("nodes");
    const availableNodes = await count("nodes", "status=eq.available");
    const busyNodes = await count("nodes", "status=eq.busy");
    const newNodes24h = await countSinceHours("nodes", "created_at", 24);
    const newNodes7d = await countSinceDays("nodes", "created_at", 7);

    // Providers / Aggregators / Clients (legacy split tables)
    const totalProviders = await count("providers");
    const availProviders = await count("providers", "status=eq.available");
    const totalAggregators = await count("aggregators");
    const totalClients = await count("clients");

    // Models
    const totalModels = await count("models");
    const publicModels = await count("models", "visibility=eq.public");
    const newModels7d = await countSinceDays("models", "created_at", 7);

    // Inference jobs
    const totalJobs = await count("jobs");
    const pendingJobs = await count("jobs", "status=eq.pending");
    const runningJobs = await count("jobs", "status=eq.running");
    const completedJobs = await count("jobs", "status=eq.completed");
    const failedJobs = await count("jobs", "status=eq.failed");
    const newJobs24h = await countSinceHours("jobs", "created_at", 24);
    const newJobs7d = await countSinceDays("jobs", "created_at", 7);

    // Distributed jobs
    const totalDistJobs = await count("distributed_jobs");
    const newDistJobs24h = await countSinceHours("distributed_jobs", "created_at", 24);

    // Training market
    const totalTraining = await count("training_jobs");
    const newTraining24h = await countSinceHours("training_jobs", "created_at", 24);
    const totalShards = await count("training_shards");
    const completedShards = await count("training_shards", "status=eq.completed");

    // CPR receipts queue (outbound to coinpayportal)
    const cprPending = await count("cpr_receipts_queue", "status=eq.pending");
    const cprSent = await count("cpr_receipts_queue", "status=eq.sent");
    const cprFailed = await count("cpr_receipts_queue", "status=eq.failed");
    const cprPermFail = await count("cpr_receipts_queue", "status=eq.permanent_fail");

    // Node commands
    const cmdPending = await count("node_commands", "status=eq.pending");
    const cmdRunning = await count("node_commands", "status=eq.running");
    const cmdCompleted = await count("node_commands", "status=eq.completed");
    const cmdFailed = await count("node_commands", "status=eq.failed");
    const newCmds24h = await countSinceHours("node_commands", "issued_at", 24);

    // Pubkey links + CLI sessions
    const pubkeyLinks = await count("pubkey_links");
    const newLinks24h = await countSinceHours("pubkey_links", "created_at", 24);
    const cliSessions = await count("cli_sessions");
    const newCliSessions24h = await countSinceHours("cli_sessions", "created_at", 24);

    // Payment transactions
    const totalPayTx = await count("payment_transactions");
    const newPayTx24h = await countSinceHours("payment_transactions", "created_at", 24);

    // Recent jobs preview
    const recentJobs = await fetchRows(
        "jobs",
        "select=title,status,model_name,client_name,created_at&order=created_at.desc&limit=5"
    );
    const recentNodes = await fetchRows(
        "nodes",
        "select=name,role,status,region,created_at&order=created_at.desc&limit=5"
    );

    // ── Text version ──
    const text = `
Infernet Protocol Daily Report — ${dateStr}
${"=".repeat(50)}

USERS
  Total: ${totalUsers}
  New (24h): ${newUsers24h}
  New (7d): ${newUsers7d}
  New (30d): ${newUsers30d}

NODES
  Total: ${totalNodes}
  Available: ${availableNodes}
  Busy: ${busyNodes}
  New (24h): ${newNodes24h}
  New (7d): ${newNodes7d}

RECENT NODES
${recentNodes.map((n) => `  • ${n.name} [${n.role}/${n.status}] ${n.region || ""} (${n.created_at?.slice(0, 10)})`).join("\n") || "  (none)"}

LEGACY ROLE TABLES
  Providers: ${totalProviders} (${availProviders} available)
  Aggregators: ${totalAggregators}
  Clients: ${totalClients}

MODELS
  Total: ${totalModels}
  Public: ${publicModels}
  New (7d): ${newModels7d}

INFERENCE JOBS
  Total: ${totalJobs}
  Pending: ${pendingJobs}
  Running: ${runningJobs}
  Completed: ${completedJobs}
  Failed: ${failedJobs}
  New (24h): ${newJobs24h}
  New (7d): ${newJobs7d}

RECENT JOBS
${recentJobs.map((j) => `  • ${j.title} [${j.status}] ${j.model_name || "?"} (${j.created_at?.slice(0, 10)})`).join("\n") || "  (none)"}

DISTRIBUTED JOBS
  Total: ${totalDistJobs}
  New (24h): ${newDistJobs24h}

TRAINING MARKET
  Training jobs: ${totalTraining} (+${newTraining24h} 24h)
  Total shards: ${totalShards}
  Completed shards: ${completedShards}

CPR RECEIPTS QUEUE
  Pending: ${cprPending}
  Sent: ${cprSent}
  Failed (retrying): ${cprFailed}
  Permanent fail: ${cprPermFail}

NODE COMMANDS
  Pending: ${cmdPending}
  Running: ${cmdRunning}
  Completed: ${cmdCompleted}
  Failed: ${cmdFailed}
  New (24h): ${newCmds24h}

AUTH / SESSIONS
  Pubkey links: ${pubkeyLinks} (+${newLinks24h} 24h)
  CLI sessions: ${cliSessions} (+${newCliSessions24h} 24h)

PAYMENT TRANSACTIONS
  Total: ${totalPayTx}
  New (24h): ${newPayTx24h}
`.trim();

    // ── HTML version ──
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e; background: #f8f9fa;">
  <div style="background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; padding: 20px 24px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">📊 Infernet Protocol Daily Report</h1>
    <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">${dateStr}</p>
  </div>

  <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0; border-top: none;">

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">👤 Users</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalUsers}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; font-weight: bold; color: ${newUsers24h > 0 ? "#16a34a" : "#666"};">${newUsers24h}</td></tr>
      <tr><td style="padding: 4px 0;">New (7d)</td><td style="text-align: right;">${newUsers7d}</td></tr>
      <tr><td style="padding: 4px 0;">New (30d)</td><td style="text-align: right;">${newUsers30d}</td></tr>
    </table>

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">🖥️ Nodes</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 12px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalNodes}</td></tr>
      <tr><td style="padding: 4px 0;">Available</td><td style="text-align: right; color: #16a34a;">${availableNodes}</td></tr>
      <tr><td style="padding: 4px 0;">Busy</td><td style="text-align: right;">${busyNodes}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; color: ${newNodes24h > 0 ? "#16a34a" : "#666"};">${newNodes24h}</td></tr>
      <tr><td style="padding: 4px 0;">New (7d)</td><td style="text-align: right;">${newNodes7d}</td></tr>
    </table>
    ${recentNodes.length > 0 ? `
    <ul style="font-size: 13px; padding-left: 20px; margin: 0 0 20px;">
      ${recentNodes.map((n) => `<li style="margin-bottom: 4px;"><strong>${n.name}</strong> <span style="color: #999;">[${n.role}/${n.status}] ${n.region || ""} · ${n.created_at?.slice(0, 10)}</span></li>`).join("")}
    </ul>
    ` : `<div style="margin-bottom: 20px;"></div>`}

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">🧩 Models</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalModels}</td></tr>
      <tr><td style="padding: 4px 0;">Public</td><td style="text-align: right;">${publicModels}</td></tr>
      <tr><td style="padding: 4px 0;">New (7d)</td><td style="text-align: right;">${newModels7d}</td></tr>
    </table>

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">⚙️ Inference Jobs</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 12px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalJobs}</td></tr>
      <tr><td style="padding: 4px 0;">Pending</td><td style="text-align: right;">${pendingJobs}</td></tr>
      <tr><td style="padding: 4px 0;">Running</td><td style="text-align: right; color: #d97706;">${runningJobs}</td></tr>
      <tr><td style="padding: 4px 0;">Completed</td><td style="text-align: right; color: #16a34a;">${completedJobs}</td></tr>
      <tr><td style="padding: 4px 0;">Failed</td><td style="text-align: right; color: ${failedJobs > 0 ? "#dc2626" : "#666"};">${failedJobs}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; color: ${newJobs24h > 0 ? "#16a34a" : "#666"};">${newJobs24h}</td></tr>
      <tr><td style="padding: 4px 0;">New (7d)</td><td style="text-align: right;">${newJobs7d}</td></tr>
    </table>
    ${recentJobs.length > 0 ? `
    <ul style="font-size: 13px; padding-left: 20px; margin: 0 0 20px;">
      ${recentJobs.map((j) => `<li style="margin-bottom: 4px;"><strong>${j.title}</strong> <span style="color: #999;">[${j.status}] ${j.model_name || "?"} · ${j.created_at?.slice(0, 10)}</span></li>`).join("")}
    </ul>
    ` : `<div style="margin-bottom: 20px;"></div>`}

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">🪜 Distributed & Training</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Distributed jobs</td><td style="text-align: right; font-weight: bold;">${totalDistJobs} <span style="color: #16a34a; font-weight: normal;">+${newDistJobs24h}</span></td></tr>
      <tr><td style="padding: 4px 0;">Training jobs</td><td style="text-align: right; font-weight: bold;">${totalTraining} <span style="color: #16a34a; font-weight: normal;">+${newTraining24h}</span></td></tr>
      <tr><td style="padding: 4px 0;">Total shards</td><td style="text-align: right;">${totalShards}</td></tr>
      <tr><td style="padding: 4px 0;">Completed shards</td><td style="text-align: right; color: #16a34a;">${completedShards}</td></tr>
    </table>

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">🧾 CPR Receipts Queue</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Pending</td><td style="text-align: right; color: ${cprPending > 0 ? "#d97706" : "#666"};">${cprPending}</td></tr>
      <tr><td style="padding: 4px 0;">Sent</td><td style="text-align: right; color: #16a34a;">${cprSent}</td></tr>
      <tr><td style="padding: 4px 0;">Failed (retrying)</td><td style="text-align: right; color: ${cprFailed > 0 ? "#d97706" : "#666"};">${cprFailed}</td></tr>
      <tr><td style="padding: 4px 0;">Permanent fail</td><td style="text-align: right; color: ${cprPermFail > 0 ? "#dc2626" : "#666"};">${cprPermFail}</td></tr>
    </table>

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">📡 Node Commands</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Pending</td><td style="text-align: right;">${cmdPending}</td></tr>
      <tr><td style="padding: 4px 0;">Running</td><td style="text-align: right; color: #d97706;">${cmdRunning}</td></tr>
      <tr><td style="padding: 4px 0;">Completed</td><td style="text-align: right; color: #16a34a;">${cmdCompleted}</td></tr>
      <tr><td style="padding: 4px 0;">Failed</td><td style="text-align: right; color: ${cmdFailed > 0 ? "#dc2626" : "#666"};">${cmdFailed}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; color: ${newCmds24h > 0 ? "#16a34a" : "#666"};">${newCmds24h}</td></tr>
    </table>

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">🔑 Auth / Sessions</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Pubkey links</td><td style="text-align: right; font-weight: bold;">${pubkeyLinks} <span style="color: #16a34a; font-weight: normal;">+${newLinks24h}</span></td></tr>
      <tr><td style="padding: 4px 0;">CLI sessions</td><td style="text-align: right;">${cliSessions} <span style="color: #16a34a; font-weight: normal;">+${newCliSessions24h}</span></td></tr>
    </table>

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">💰 Payment Transactions</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalPayTx}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; color: ${newPayTx24h > 0 ? "#16a34a" : "#666"};">${newPayTx24h}</td></tr>
    </table>

    <h2 style="font-size: 16px; color: #0ea5e9; margin: 0 0 12px;">📁 Legacy Role Tables</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Providers</td><td style="text-align: right;">${totalProviders} (${availProviders} available)</td></tr>
      <tr><td style="padding: 4px 0;">Aggregators</td><td style="text-align: right;">${totalAggregators}</td></tr>
      <tr><td style="padding: 4px 0;">Clients</td><td style="text-align: right;">${totalClients}</td></tr>
    </table>

  </div>

  <p style="text-align: center; font-size: 12px; color: #999; margin-top: 16px;">
    Sent by Infernet Stats · <a href="https://infernetprotocol.com" style="color: #0ea5e9;">infernetprotocol.com</a>
  </p>
</body>
</html>
`.trim();

    return {
        subject: `📊 Infernet Daily — ${dateStr} | ${totalNodes} nodes, ${totalJobs} jobs, ${totalModels} models`,
        html,
        text,
    };
}

// ─── Send via Resend HTTP API ──────────────────────────────────────────────

async function sendViaResend(to, subject, html, text) {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, text }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend ${res.status}: ${body.slice(0, 500)}`);
    }
    return res.json();
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log(`📊 Building infernet-protocol daily stats report...`);
    const report = await buildReport();

    if (DRY_RUN) {
        console.log(`\nSubject: ${report.subject}\nTo: ${TO_EMAIL}\n`);
        console.log(report.text);
        console.log("\n(dry run — email not sent)");
        return;
    }

    console.log(`📧 Sending to ${TO_EMAIL}...`);
    const result = await sendViaResend(TO_EMAIL, report.subject, report.html, report.text);
    console.log(`✅ Sent! ID: ${result?.id ?? "(unknown)"}`);
}

main().catch((err) => {
    console.error("❌ Failed:", err.message);
    process.exit(1);
});
