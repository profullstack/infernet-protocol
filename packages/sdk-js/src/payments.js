/**
 * Payments — invoice creation for chat/inference jobs.
 *
 * The control plane brokers CoinPayPortal on the server side; the SDK
 * just wraps the REST endpoints. Provider payouts and webhook handling
 * are never called from client code.
 */

/**
 * @param {import("./index.js").InfernetClient} client
 * @param {{ jobId: string, coin: string, network?: string }} opts
 */
export async function createInvoice(client, opts = {}) {
    const { jobId, coin, network } = opts;
    if (!jobId) throw new Error("createInvoice: jobId is required");
    if (!coin)  throw new Error("createInvoice: coin is required");
    return client._post("/api/payments/invoice", { jobId, coin, network });
}
