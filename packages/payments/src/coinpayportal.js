/**
 * CoinPayPortal payment gateway integration.
 *
 * CoinPayPortal (https://coinpayportal.com) is a hosted crypto-payment
 * processor similar to Coinbase Commerce / NOWPayments. We create invoices
 * via their HTTP API and receive webhook callbacks when payments settle.
 *
 * The exact CoinPayPortal API shape is not verifiable from this sandbox,
 * so the endpoint paths, header names, and signature scheme live in the
 * constants block at the top of this file — adjust them once the real
 * CoinPayPortal documentation is in hand.
 *
 * Environment variables consumed:
 *   COINPAYPORTAL_API_KEY          (required)   API key sent with every request.
 *   COINPAYPORTAL_API_BASE_URL     (optional)   Defaults to https://api.coinpayportal.com/v1
 *   COINPAYPORTAL_WEBHOOK_SECRET   (required for webhook verification)
 *                                                HMAC-SHA256 shared secret used to
 *                                                verify the `x-cpp-signature` header.
 *
 * This module is framework-agnostic — it does NOT import `server-only`,
 * Next.js helpers, or the `@/lib/*` path alias, so it can be used from both
 * the Next.js API routes and the standalone CLI.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Configurable surface — update these as the real CoinPayPortal docs dictate.
// ---------------------------------------------------------------------------

const DEFAULT_API_BASE_URL = "https://api.coinpayportal.com/v1";

/** HTTP header used to authenticate requests to CoinPayPortal. */
const API_KEY_HEADER = "x-api-key";

/** HTTP header CoinPayPortal signs webhook payloads with. */
export const WEBHOOK_SIGNATURE_HEADER = "x-cpp-signature";

/** Algorithm used to sign webhook payloads. */
const WEBHOOK_SIGNATURE_ALGO = "sha256";

/** Relative paths for each supported API operation. */
const API_PATHS = {
  createInvoice: "/invoices",
  getInvoice: (invoiceId) => `/invoices/${encodeURIComponent(invoiceId)}`
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === "") {
    throw new Error(`[coinpayportal] Missing required env var: ${name}`);
  }
  return value;
}

function getApiBaseUrl() {
  return (
    process.env.COINPAYPORTAL_API_BASE_URL || DEFAULT_API_BASE_URL
  ).replace(/\/+$/, "");
}

function buildHeaders() {
  return {
    "content-type": "application/json",
    accept: "application/json",
    [API_KEY_HEADER]: requireEnv("COINPAYPORTAL_API_KEY")
  };
}

async function cppFetch(path, { method = "GET", body } = {}) {
  const url = `${getApiBaseUrl()}${path}`;
  const init = {
    method,
    headers: buildHeaders()
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `[coinpayportal] Network error calling ${method} ${url}: ${err.message}`
    );
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const detail =
      (payload && (payload.error || payload.message)) || `HTTP ${response.status}`;
    const err = new Error(
      `[coinpayportal] ${method} ${path} failed: ${detail}`
    );
    err.status = response.status;
    err.body = payload;
    throw err;
  }

  return payload ?? {};
}

/**
 * Normalise the raw CoinPayPortal invoice payload into our internal shape.
 * CoinPayPortal's fields are assumed — adjust to match their real response.
 */
function normaliseInvoice(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("[coinpayportal] Invalid invoice payload (not an object)");
  }

  const data = raw.data ?? raw.invoice ?? raw;

  const invoiceId =
    data.invoice_id ?? data.id ?? data.invoiceId ?? null;
  const payAddress =
    data.pay_address ?? data.address ?? data.payAddress ?? null;
  const amount =
    data.amount ?? data.pay_amount ?? data.crypto_amount ?? null;
  const coin = data.coin ?? data.currency ?? data.pay_currency ?? null;
  const network = data.network ?? data.pay_network ?? null;
  const expiresAt = data.expires_at ?? data.expiresAt ?? null;
  const hostedUrl =
    data.hosted_url ?? data.checkout_url ?? data.hostedUrl ?? null;
  const status = data.status ?? data.payment_status ?? null;
  const txHash = data.tx_hash ?? data.txid ?? data.transaction_id ?? null;

  return {
    invoiceId,
    payAddress,
    amount,
    coin,
    network,
    expiresAt,
    hostedUrl,
    status,
    txHash,
    raw: data
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an invoice at CoinPayPortal for a crypto payment.
 *
 * @param {object} params
 * @param {number} params.amountUsd         USD amount to charge.
 * @param {string} params.coin              Coin code, e.g. "BTC", "USDC".
 * @param {string} [params.network]         Network hint for multi-chain coins.
 * @param {string} params.orderId           External reference id (e.g. job id).
 * @param {object} [params.metadata]        Extra metadata to echo back on webhook.
 * @param {string} [params.callbackUrl]     Webhook URL.
 * @param {string} [params.successUrl]      Redirect URL after successful payment.
 * @returns {Promise<{invoiceId: string, payAddress: string, amount: string|number,
 *                    coin: string, network: string|null,
 *                    expiresAt: string|null, hostedUrl: string|null}>}
 */
export async function createInvoice({
  amountUsd,
  coin,
  network,
  orderId,
  metadata,
  callbackUrl,
  successUrl
}) {
  if (amountUsd === undefined || amountUsd === null) {
    throw new Error("[coinpayportal] createInvoice: amountUsd is required");
  }
  if (!coin) {
    throw new Error("[coinpayportal] createInvoice: coin is required");
  }
  if (!orderId) {
    throw new Error("[coinpayportal] createInvoice: orderId is required");
  }

  const body = {
    amount: amountUsd,
    currency: "USD",
    pay_currency: String(coin).toUpperCase(),
    order_id: String(orderId),
    metadata: metadata ?? {}
  };
  if (network) body.pay_network = network;
  if (callbackUrl) body.callback_url = callbackUrl;
  if (successUrl) body.success_url = successUrl;

  const raw = await cppFetch(API_PATHS.createInvoice, {
    method: "POST",
    body
  });
  const invoice = normaliseInvoice(raw);

  if (!invoice.invoiceId || !invoice.payAddress) {
    throw new Error(
      "[coinpayportal] createInvoice: gateway response missing invoiceId or payAddress"
    );
  }

  return {
    invoiceId: invoice.invoiceId,
    payAddress: invoice.payAddress,
    amount: invoice.amount ?? amountUsd,
    coin: invoice.coin ?? String(coin).toUpperCase(),
    network: invoice.network ?? network ?? null,
    expiresAt: invoice.expiresAt,
    hostedUrl: invoice.hostedUrl
  };
}

/**
 * Fetch the current state of an existing invoice.
 *
 * @param {string} invoiceId
 * @returns {Promise<object>} Normalised invoice object (see {@link normaliseInvoice}).
 */
export async function getInvoice(invoiceId) {
  if (!invoiceId) {
    throw new Error("[coinpayportal] getInvoice: invoiceId is required");
  }
  const raw = await cppFetch(API_PATHS.getInvoice(invoiceId), { method: "GET" });
  return normaliseInvoice(raw);
}

/**
 * Verify the signature on a CoinPayPortal webhook.
 *
 * @param {string|Buffer} rawBody         The exact raw request body.
 * @param {string|null|undefined} signatureHeader  Value of WEBHOOK_SIGNATURE_HEADER.
 * @returns {boolean} true if the signature matches.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  const secret = process.env.COINPAYPORTAL_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "[coinpayportal] Missing required env var: COINPAYPORTAL_WEBHOOK_SECRET"
    );
  }

  const bodyBuf = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody ?? "", "utf8");

  const expected = createHmac(WEBHOOK_SIGNATURE_ALGO, secret)
    .update(bodyBuf)
    .digest("hex");

  // Accept either a bare hex digest or a prefixed form like `sha256=...`.
  const provided = signatureHeader.includes("=")
    ? signatureHeader.split("=").pop().trim()
    : signatureHeader.trim();

  const expectedBuf = Buffer.from(expected, "hex");
  let providedBuf;
  try {
    providedBuf = Buffer.from(provided, "hex");
  } catch {
    return false;
  }
  if (providedBuf.length !== expectedBuf.length) return false;

  try {
    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

/**
 * Parse a CoinPayPortal webhook body into our internal shape.
 *
 * @param {string|object} rawBody  The raw JSON body (string or already-parsed object).
 * @returns {{invoiceId: string|null, status: string|null, txHash: string|null,
 *            coin: string|null, network: string|null, amount: string|number|null,
 *            raw: object}}
 */
export function parseWebhookPayload(rawBody) {
  let parsed;
  if (typeof rawBody === "string") {
    try {
      parsed = JSON.parse(rawBody);
    } catch (err) {
      throw new Error(
        `[coinpayportal] parseWebhookPayload: invalid JSON (${err.message})`
      );
    }
  } else if (rawBody && typeof rawBody === "object") {
    parsed = rawBody;
  } else {
    throw new Error(
      "[coinpayportal] parseWebhookPayload: rawBody must be string or object"
    );
  }

  const data = parsed.data ?? parsed.invoice ?? parsed;

  const rawStatus = (
    data.status ??
    data.payment_status ??
    data.event ??
    ""
  )
    .toString()
    .toLowerCase();

  let status = "pending";
  if (
    rawStatus.includes("confirmed") ||
    rawStatus.includes("completed") ||
    rawStatus.includes("paid") ||
    rawStatus.includes("success")
  ) {
    status = "confirmed";
  } else if (
    rawStatus.includes("failed") ||
    rawStatus.includes("expired") ||
    rawStatus.includes("cancelled") ||
    rawStatus.includes("canceled")
  ) {
    status = "failed";
  } else {
    status = "pending";
  }

  return {
    invoiceId: data.invoice_id ?? data.id ?? data.invoiceId ?? null,
    status,
    txHash: data.tx_hash ?? data.txid ?? data.transaction_id ?? null,
    coin: data.coin ?? data.currency ?? data.pay_currency ?? null,
    network: data.network ?? data.pay_network ?? null,
    amount: data.amount ?? data.pay_amount ?? data.crypto_amount ?? null,
    raw: parsed
  };
}
