import type { InfernetClient, Invoice, InvoiceOptions } from "./index.js";

export declare function createInvoice(
    client: InfernetClient,
    opts: InvoiceOptions
): Promise<Invoice>;
