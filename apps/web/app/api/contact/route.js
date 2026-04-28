import { NextResponse } from "next/server";
import { parseAuthBody, wantsRedirect } from "@/lib/auth/parse-body";
import { appUrl } from "@/lib/auth/app-url";

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

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    const honeypot = String(body.website ?? "").trim();

    // Spam: bots fill the hidden honeypot. Pretend success.
    if (honeypot) {
        return reply({ ok: true, sent: true, wantHtml, status: 200 });
    }

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
                subject: `[contact] ${subject}`,
                text: buildPlainBody({ name, email, subject, message })
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

function buildPlainBody({ name, email, subject, message }) {
    return [
        `From: ${name} <${email}>`,
        `Subject: ${subject}`,
        "",
        message,
        "",
        "—",
        "Sent from the contact form at https://infernetprotocol.com/contact"
    ].join("\n");
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
