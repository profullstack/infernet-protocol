# @infernetprotocol/nim-adapter

NVIDIA NIM / [build.nvidia.com](https://build.nvidia.com/) adapter for the Infernet Protocol.

Treats NVIDIA's OpenAI-compatible inference endpoint as a fallback "virtual provider." When the P2P network has no live providers available for a chat job, we stream from NIM instead so the UX never breaks during the bootstrap phase.

## Environment

```bash
NVIDIA_NIM_API_KEY=...                                  # required
NVIDIA_NIM_API_URL=https://integrate.api.nvidia.com/v1  # optional override
NVIDIA_NIM_DEFAULT_MODEL=meta/llama-3.3-70b-instruct    # optional override
```

Grab a free API key at [build.nvidia.com](https://build.nvidia.com/) → click any model → **Get API Key** on the right sidebar.

## Usage

```js
import { streamChatCompletion, isNimConfigured, nimVirtualProvider } from "@infernetprotocol/nim-adapter";

if (isNimConfigured()) {
    for await (const ev of streamChatCompletion({
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 256,
        temperature: 0.7
    })) {
        if (ev.type === "token") process.stdout.write(ev.data.text);
        if (ev.type === "done")  console.log();
    }
}
```

Yielded events:

- `{ type: 'meta',  data: { provider: 'nvidia-nim', model, started_at } }`
- `{ type: 'token', data: { text } }` (repeating)
- `{ type: 'done',  data: { text, finished_at } }`
- `{ type: 'error', data: { message } }` — terminal

Same shape as Infernet's own `job_events` stream, so the chat SSE route can relay NIM output without an adapter layer on the server side.
