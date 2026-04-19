import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { findCoin } from "@/config/payment-coins";
import { createInvoice } from "@/src/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status, error, detail) {
  const body = { error };
  if (detail !== undefined) body.detail = detail;
  return NextResponse.json(body, { status });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { jobId, coin, network } = payload ?? {};

  if (!jobId || typeof jobId !== "string") {
    return errorResponse(400, "jobId is required");
  }
  if (!coin || typeof coin !== "string") {
    return errorResponse(400, "coin is required");
  }

  const coinMeta = findCoin(coin, network);
  if (!coinMeta) {
    return errorResponse(400, "Unsupported coin/network combination", {
      coin,
      network: network ?? null
    });
  }

  const supabase = getSupabaseServerClient();

  // 1. Look up the job.
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, payment_offer, payment_status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) {
    return errorResponse(500, "Failed to fetch job", jobErr.message);
  }
  if (!job) {
    return errorResponse(404, "Job not found", { jobId });
  }

  const amountUsd = job.payment_offer;
  if (amountUsd === null || amountUsd === undefined) {
    return errorResponse(400, "Job has no payment_offer set", { jobId });
  }

  // 2. Build callback URL against NEXT_PUBLIC_APP_URL.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const callbackUrl = appUrl ? `${appUrl}/api/payments/webhook` : undefined;
  const successUrl = appUrl ? `${appUrl}/jobs/${jobId}` : undefined;

  // 3. Create the invoice at CoinPayPortal.
  let invoice;
  try {
    invoice = await createInvoice({
      amountUsd,
      coin: coinMeta.code,
      network: coinMeta.network,
      orderId: jobId,
      metadata: { jobId, coin: coinMeta.code, network: coinMeta.network },
      callbackUrl,
      successUrl
    });
  } catch (err) {
    return errorResponse(502, "Failed to create invoice at gateway", err.message);
  }

  // 4. Update the job row.
  const { error: jobUpdErr } = await supabase
    .from("jobs")
    .update({
      payment_coin: coinMeta.code,
      payment_invoice: invoice.invoiceId,
      payment_status: "invoiced"
    })
    .eq("id", jobId);

  if (jobUpdErr) {
    return errorResponse(500, "Failed to update job with invoice", jobUpdErr.message);
  }

  // 5. Insert an inbound payment_transactions row.
  const { error: ledgerErr } = await supabase
    .from("payment_transactions")
    .insert({
      direction: "inbound",
      job_id: jobId,
      coin: coinMeta.code,
      network: coinMeta.network,
      amount: amountUsd,
      amount_usd: amountUsd,
      address: invoice.payAddress,
      invoice_id: invoice.invoiceId,
      status: "pending",
      provider_gateway: "coinpayportal",
      metadata: {
        hosted_url: invoice.hostedUrl ?? null,
        expires_at: invoice.expiresAt ?? null
      }
    });

  if (ledgerErr) {
    return errorResponse(
      500,
      "Failed to record payment transaction",
      ledgerErr.message
    );
  }

  // 6. Return the invoice details.
  return NextResponse.json({
    invoiceId: invoice.invoiceId,
    payAddress: invoice.payAddress,
    amount: invoice.amount,
    coin: invoice.coin,
    network: invoice.network,
    expiresAt: invoice.expiresAt,
    hostedUrl: invoice.hostedUrl
  });
}
