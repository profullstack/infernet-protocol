/**
 * Payments façade.
 *
 * Re-exports the single active gateway (CoinPayPortal) behind a stable
 * surface so route handlers and the CLI can `import { createInvoice } from
 * "@infernet/payments"` without caring which provider is wired up.
 *
 * When we add more gateways later (e.g. Coinbase Commerce, NOWPayments),
 * this file becomes the router / feature-flag switch.
 */

export {
  createInvoice,
  getInvoice,
  verifyWebhookSignature,
  parseWebhookPayload,
  WEBHOOK_SIGNATURE_HEADER
} from "./coinpayportal.js";
