export interface InfernetClientOptions {
    baseUrl: string;
    apiKey?: string;
    fetch?: typeof fetch;
}

export interface ChatMessage {
    role: "user" | "assistant" | "system" | string;
    content: string;
}

export interface ChatOptions {
    messages: ChatMessage[];
    modelName?: string;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
}

export interface ChatEvent {
    type: "job" | "meta" | "token" | "done" | "error" | string;
    data: any;
    id?: number | string;
}

export interface ChatProvider {
    id: string;
    name: string | null;
    nodeId: string | null;
    gpuModel?: string | null;
}

export interface ChatJobInit {
    jobId: string;
    status: string;
    provider: ChatProvider | null;
    streamUrl: string;
}

export interface ChatCompleteResult {
    text: string;
    jobId: string | null;
    provider: ChatProvider | null;
    meta: any;
}

export interface InvoiceOptions {
    jobId: string;
    coin: string;
    network?: string;
}

export interface Invoice {
    invoiceId: string;
    payAddress: string;
    amount: number | string;
    coin: string;
    network: string;
    expiresAt?: string;
    hostedUrl?: string;
}

export interface ListOptions {
    limit?: number;
    offset?: number;
    [key: string]: unknown;
}

export declare class InfernetClient {
    constructor(opts: InfernetClientOptions);
    readonly baseUrl: string;

    getOverview(opts?: ListOptions): Promise<any>;
    listNodes(opts?: ListOptions): Promise<any>;
    listProviders(opts?: ListOptions): Promise<any>;
    listAggregators(opts?: ListOptions): Promise<any>;
    listClients(opts?: ListOptions): Promise<any>;
    listModels(opts?: ListOptions): Promise<any>;
    listJobs(opts?: ListOptions): Promise<any>;

    chat(opts: ChatOptions): AsyncIterableIterator<ChatEvent>;
    chatComplete(opts: ChatOptions): Promise<ChatCompleteResult>;

    createInvoice(opts: InvoiceOptions): Promise<Invoice>;
}

export default InfernetClient;
export { streamChat, sendChat } from "./chat.js";
export { createInvoice } from "./payments.js";
