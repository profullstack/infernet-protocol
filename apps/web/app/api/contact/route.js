import { NextResponse } from "next/server";
import { provenanceBlock, tagSubject } from "@profullstack/form-guard";
import { parseAuthBody, wantsRedirect } from "@/lib/auth/parse-body";
import { appUrl } from "@/lib/auth/app-url";
import { contactGuard } from "@/lib/contact-guard";

export const dynamic = "force-dynamic";

const TO = "hello@infernetprotocol.com";
const FROM = "Infernet Contact <hello@infernetprotocol.com>";
const MAX_MESSAGE_BYTES = 16 * 1024;

/**
 * Public contact form → Resend.
 *
 * The form posts as a regular HTML form, so we redirect back to
 * /contact?sent=1 (or ?error=…) on completion. Programmatic JSON
 * callers get a JSON response instead.
 *
 * RESEND_API_KEY must be set in the environment.
 */
export async function POST(request) {
    const body = await parseAuthBody(request);
    const wantHtml = wantsRedirect(request);

    // Spam checks run before field validation on purpose. A bot that gets
    // "all fields are required" back has learned what to send next time;
    // one that gets a plain success has learned nothing at all.
    const verdict = contactGuard
        ? await contactGuard.check({ fields: body, headers: request.headers })
        : null;

    if (verdict && !verdict.allow) {
        if (verdict.action === "drop") {
            // Silently discarded. Reported as success so the sender cannot
            // tell which check caught it.
            console.warn(`contact: dropped submission (${verdict.reason}) ip=${verdict.ip ?? "?"}`);
            return reply({ ok: true, sent: true, wantHtml, status: 200 });
        }
        if (verdict.action === "limited") {
            return reply({
                ok: false,
                error: "Too many messages from this connection. Please try again later.",
                wantHtml,
                status: 429
            });
        }
        // A real person whose token went stale or who submitted very
        // fast. Ask them to send it again rather than losing it.
        return reply({
            ok: false,
            error: "That took too long or came through too quickly. Please send it again.",
            wantHtml,
            status: 400
        });
    }

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!name || !email || !subject || !message) {
        return reply({
            ok: false,
            error: "All fields are required.",
            wantHtml,
            status: 400
        });
    }
    if (!isLikelyEmail(email)) {
        return reply({ ok: false, error: "That doesn't look like a valid email.", wantHtml, status: 400 });
    }
    if (Buffer.byteLength(message, "utf8") > MAX_MESSAGE_BYTES) {
        return reply({ ok: false, error: "Message is too long (16KB max).", wantHtml, status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error("contact: RESEND_API_KEY is not set");
        return reply({
            ok: false,
            error: "Email is temporarily unavailable. Please email hello@infernetprotocol.com directly.",
            wantHtml,
            status: 503
        });
    }

    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: FROM,
                to: [TO],
                reply_to: email,
                subject: tagSubject(`[contact] ${subject}`, verdict ?? {}),
                text: buildPlainBody({ name, email, subject, message, verdict })
            })
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            console.error(`contact: Resend rejected send (${res.status}): ${detail.slice(0, 500)}`);
            return reply({
                ok: false,
                error: "Could not send your message. Try again, or email hello@infernetprotocol.com directly.",
                wantHtml,
                status: 502
            });
        }
    } catch (err) {
        console.error(`contact: send threw: ${err?.message ?? err}`);
        return reply({
            ok: false,
            error: "Network error sending message. Try again in a minute.",
            wantHtml,
            status: 502
        });
    }

    return reply({ ok: true, sent: true, wantHtml, status: 200 });
}

function buildPlainBody({ name, email, subject, message, verdict }) {
    const lines = [
        `From: ${name} <${email}>`,
        `Subject: ${subject}`,
        "",
        message,
        "",
        "—",
        "Sent from the contact form at https://infernetprotocol.com/contact"
    ];
    if (verdict) {
        // Where the message came from and why it scored as it did. The
        // mail headers cannot tell you any of this: the message is sent
        // by us, to us, so it authenticates perfectly either way.
        lines.push("", provenanceBlock({ ip: verdict.ip, userAgent: verdict.userAgent, verdict }));
    }
    return lines.join("\n");
}

// RFC 5322-strict is overkill — this catches obvious garbage; Resend
// will reject anything actually unroutable.
function isLikelyEmail(s) {
    return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(s);
}

function reply({ ok, sent, error, wantHtml, status }) {
    if (wantHtml) {
        const path = ok && sent ? "/contact?sent=1" : `/contact?error=${encodeURIComponent(error ?? "send failed")}`;
        return NextResponse.redirect(new URL(path, appUrl()), { status: 303 });
    }
    return NextResponse.json(ok ? { ok: true } : { error }, { status });
}
