import type { InfernetClient, ChatOptions, ChatEvent, ChatCompleteResult } from "./index.js";

export declare function streamChat(
    client: InfernetClient,
    opts: ChatOptions
): AsyncIterableIterator<ChatEvent>;

export declare function sendChat(
    client: InfernetClient,
    opts: ChatOptions
): Promise<ChatCompleteResult>;
