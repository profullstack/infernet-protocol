# Streaming Chat

Streaming delivers tokens to the client as they're generated instead of waiting for the full response. For any user-facing chat application, streaming is essential — it dramatically improves perceived responsiveness.

## SSE Event Format

The stream endpoint returns [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). Each token arrives as:

```
data: {"text": "Paris"}

data: {"text": " is"}

data: {"text": " the"}

data: {"text": " capital"}

data: {"text": " of"}

data: {"text": " France"}

data: {"text": "."}

data: [DONE]
```

Each `data:` line is a JSON object with a `text` field containing the token(s). The final event is `[DONE]` (a literal string, not JSON), signaling the stream is complete.

Error events look like:

```
data: {"error": "node_disconnected", "message": "Node went offline mid-stream"}
```

## Opening a Stream

There are two ways to get a stream:

**Option 1: Submit with `stream: true`**

The job submission itself returns a stream immediately:

```bash
curl https://app.infernet.sh/api/v1/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "model": "qwen2.5:14b",
    "messages": [{"role": "user", "content": "Tell me about Paris."}],
    "stream": true
  }'
```

**Option 2: Stream a previously submitted job**

Submit first, get a job ID, then stream:

```bash
# Submit
JOB_ID=$(curl -s https://app.infernet.sh/api/v1/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen2.5:14b", "messages": [...]}' | jq -r .id)

# Stream
curl "https://app.infernet.sh/api/v1/jobs/$JOB_ID/stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream"
```

## JavaScript Example

Using the native `EventSource` API or `fetch` with a ReadableStream:

```javascript
// Using fetch (works in browsers and Node.js 18+)
async function streamInference(prompt) {
  const response = await fetch('https://app.infernet.sh/api/v1/jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.INFERNET_BEARER_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model: 'qwen2.5:14b',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`API error: ${err.error_message}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();

      if (data === '[DONE]') return;

      try {
        const event = JSON.parse(data);
        if (event.error) {
          throw new Error(`Stream error: ${event.message}`);
        }
        if (event.text) {
          process.stdout.write(event.text); // or append to UI
        }
      } catch (e) {
        if (e.message.startsWith('Stream error')) throw e;
        // Skip malformed events
      }
    }
  }
}

// Usage
streamInference('What is the capital of France?')
  .then(() => console.log('\nDone'))
  .catch(console.error);
```

### React Example

```jsx
import { useState, useCallback } from 'react';

function ChatMessage({ content }) {
  return <div className="message">{content}</div>;
}

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    
    // Add empty assistant message to fill in
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const response = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_INFERNET_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model: 'qwen2.5:14b',
          messages: [...messages, { role: 'user', content: userMessage }],
          stream: true,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const { text } = JSON.parse(data);
            if (text) {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + text,
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming]);

  return (
    <div>
      {messages.map((m, i) => <ChatMessage key={i} content={m.content} />)}
      <input value={input} onChange={e => setInput(e.target.value)} />
      <button onClick={sendMessage} disabled={streaming}>Send</button>
    </div>
  );
}
```

## Python Example

Using `httpx` (supports streaming) or `requests`:

```python
import httpx
import json
import os

def stream_inference(prompt: str, model: str = "qwen2.5:14b"):
    token = os.environ["INFERNET_BEARER_TOKEN"]
    
    with httpx.Client(timeout=120) as client:
        with client.stream(
            "POST",
            "https://app.infernet.sh/api/v1/jobs",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            
            buffer = ""
            for chunk in response.iter_text():
                buffer += chunk
                lines = buffer.split("\n")
                buffer = lines[-1]  # Keep incomplete line
                
                for line in lines[:-1]:
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    
                    if data == "[DONE]":
                        return
                    
                    try:
                        event = json.loads(data)
                        if "error" in event:
                            raise RuntimeError(f"Stream error: {event['message']}")
                        if "text" in event:
                            print(event["text"], end="", flush=True)
                    except json.JSONDecodeError:
                        pass  # Skip malformed events

# Usage
stream_inference("Explain how neural networks learn in three sentences.")
print()  # newline after stream
```

### Async Python

```python
import asyncio
import httpx
import json
import os

async def stream_inference_async(prompt: str, model: str = "qwen2.5:14b"):
    token = os.environ["INFERNET_BEARER_TOKEN"]
    
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            "https://app.infernet.sh/api/v1/jobs",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            full_response = ""
            
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                
                if data == "[DONE]":
                    break
                
                try:
                    event = json.loads(data)
                    if "text" in event:
                        full_response += event["text"]
                        print(event["text"], end="", flush=True)
                except json.JSONDecodeError:
                    pass
            
            return full_response

# Usage
result = asyncio.run(stream_inference_async("What is 2 + 2?"))
```

## Handling Disconnections

Streams can be interrupted if a node goes offline mid-response. The stream will emit an error event and close:

```
data: {"error": "node_disconnected", "message": "Node went offline during inference"}
```

When this happens:
1. The partial response received so far is valid
2. The job is re-queued automatically by the control plane
3. You can either display the partial response or retry the full job

For a retry strategy, see [Job Lifecycle](job-lifecycle.md).

## Done Event

The `[DONE]` event signals successful completion. After receiving it, you can safely close the connection. The full response text is everything accumulated from the `text` fields of all preceding events.

The control plane sends `[DONE]` only after the inference backend confirms the generation is complete. You won't receive `[DONE]` after a node disconnection error — only after a clean finish.
