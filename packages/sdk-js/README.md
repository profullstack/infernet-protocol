# @infernetprotocol/sdk

Official JavaScript/TypeScript SDK for the [Infernet Protocol](https://github.com/profullstack/infernet-protocol) — a peer-to-peer GPU inference marketplace.

Works in Node.js 18+ and modern browsers. Zero runtime dependencies (uses native `fetch`).

## Install

```bash
pnpm add @infernetprotocol/sdk
# or
npm install @infernetprotocol/sdk
```

## Quick start

```js
import { InfernetClient } from "@infernetprotocol/sdk";

const client = new InfernetClient({
  baseUrl: "https://infernetprotocol.com"      // or your self-hosted control plane
});

// Dashboard queries
const overview = await client.getOverview();
const nodes    = await client.listNodes({ limit: 20 });
const jobs     = await client.listJobs({ limit: 20 });

// Streaming chat
for await (const ev of client.chat({
  messages: [{ role: "user", content: "explain p2p inference in 2 sentences" }]
})) {
  if (ev.type === "job")   console.log("assigned provider:", ev.data.provider);
  if (ev.type === "token") process.stdout.write(ev.data.text);
  if (ev.type === "done")  console.log();
  if (ev.type === "error") throw new Error(ev.data.message);
}

// Non-streaming convenience
const { text, jobId, provider } = await client.chatComplete({
  messages: [{ role: "user", content: "one-liner about Infernet" }]
});

// Payments
const invoice = await client.createInvoice({
  jobId: "…",
  coin: "USDC",
  network: "base"
});
console.log(invoice.hostedUrl);
```

## Reference

See [`src/index.d.ts`](./src/index.d.ts) for the full TypeScript surface.

- `new InfernetClient({ baseUrl, apiKey?, fetch? })`
- `client.getOverview()`, `listNodes()`, `listProviders()`, `listAggregators()`, `listClients()`, `listModels()`, `listJobs()`
- `client.chat(opts)` — returns an async iterator of `{ type, data, id }` events
- `client.chatComplete(opts)` — accumulates tokens and resolves with the full text
- `client.createInvoice({ jobId, coin, network })`

The `apiKey` option sets an `Authorization: Bearer …` header. Use it against control planes that have auth enabled.

## License

MIT
