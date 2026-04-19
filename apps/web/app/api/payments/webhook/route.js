import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  verifyWebhookSignature,
  parseWebhookPayload,
  WEBHOOK_SIGNATURE_HEADER
} from "@infernet/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status, error, detail) {
  const body = { error };
  if (detail !== undefined) body.detail = detail;
  return NextResponse.json(body, { status });
}

export async function POST(request) {
  // Always read the raw body — signature verification depends on byte-exact input.
  const rawBody = await request.text();

  const signature = request.headers.get(WEBHOOK_SIGNATURE_HEADER);

  let valid = false;
  try {
    valid = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    return errorResponse(500, "Webhook verification failed", err.message);
  }
  if (!valid) {
    return errorResponse(401, "Invalid webhook signature");
  }

  let event;
  try {
    event = parseWebhookPayload(rawBody);
  } catch (err) {
    return errorResponse(400, "Malformed webhook payload", err.message);
  }

  if (!event.invoiceId) {
    return errorResponse(400, "Webhook payload missing invoice id");
  }

  const supabase = getSupabaseServerClient();

  // 1. Update the payment_transactions ledger row for this invoice.
  const txUpdate = {
    status: event.status
  };
  if (event.txHash) txUpdate.tx_hash = event.txHash;
  if (event.status === "confirmed") {
    txUpdate.confirmed_at = new Date().toISOString();
  }

  const { error: txErr } = await supabase
    .from("payment_transactions")
    .update(txUpdate)
    .eq("invoice_id", event.invoiceId);

  if (txErr) {
    return errorResponse(
      500,
      "Failed to update payment transaction",
      txErr.message
    );
  }

  // 2. Mirror status on the jobs row (matched by payment_invoice).
  const jobUpdate = {
    payment_status: event.status
  };
  if (event.status === "confirmed" && event.txHash) {
    jobUpdate.payment_tx_hash = event.txHash;
  }

  const { error: jobErr } = await supabase
    .from("jobs")
    .update(jobUpdate)
    .eq("payment_invoice", event.invoiceId);

  if (jobErr) {
    return errorResponse(500, "Failed to update job payment status", jobErr.message);
  }

  return NextResponse.json({ ok: true });
}
