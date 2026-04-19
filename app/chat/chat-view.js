"use client";

import { useEffect, useRef, useState } from "react";

const EXAMPLE_PROMPTS = [
  "Explain how Infernet's P2P GPU network scales compared to a centralized data center.",
  "Write a Python function that streams tokens from a local llama.cpp server.",
  "Summarize the tradeoffs between tensor parallelism and pipeline parallelism."
];

/**
 * Chat playground UI.
 *
 * Talks to:
 *   POST /api/chat            → creates a chat job, returns { jobId, provider, streamUrl }
 *   GET  /api/chat/stream/:id → Server-Sent Events with tokens, then 'done' | 'error'
 *
 * State model:
 *   messages: [{ role: 'user'|'assistant'|'system', content, provider?, done? }]
 *   streaming: true while an assistant message is being assembled
 *   currentEventSource: the open EventSource, closed on unmount / done / error
 */
export default function ChatView({ initialModels = [] }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [modelName, setModelName] = useState(initialModels[0]?.name ?? "");
  const [error, setError] = useState(null);
  const [provider, setProvider] = useState(null);

  const esRef = useRef(null);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (esRef.current) {
        try { esRef.current.close(); } catch { /* ignore */ }
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setInput("");
    const nextUser = { role: "user", content: text };
    // Assistant placeholder we'll append tokens into.
    const pendingAssistant = { role: "assistant", content: "", provider: null, pending: true };
    setMessages((prev) => [...prev, nextUser, pendingAssistant]);
    setStreaming(true);

    let res;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, nextUser].map((m) => ({ role: m.role, content: m.content })),
          modelName,
          maxTokens: 512,
          temperature: 0.7
        })
      });
    } catch (e) {
      failPending(`Network error: ${e?.message ?? e}`);
      return;
    }

    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.error ?? ""; } catch { /* ignore */ }
      failPending(`Server returned ${res.status}${detail ? `: ${detail}` : ""}`);
      return;
    }

    const { jobId, streamUrl, provider: pickedProvider } = await res.json();
    setProvider(pickedProvider);

    const es = new EventSource(streamUrl);
    esRef.current = es;

    es.addEventListener("meta", (e) => {
      try {
        const data = JSON.parse(e.data);
        setMessages((prev) => updateLastAssistant(prev, (m) => ({
          ...m,
          provider: {
            nodeId: data.provider_node_id,
            name: data.provider_name,
            model: data.model
          }
        })));
      } catch { /* ignore */ }
    });

    es.addEventListener("token", (e) => {
      try {
        const data = JSON.parse(e.data);
        setMessages((prev) => updateLastAssistant(prev, (m) => ({
          ...m,
          content: (m.content ?? "") + (data.text ?? "")
        })));
      } catch { /* ignore */ }
    });

    es.addEventListener("done", () => {
      setMessages((prev) => updateLastAssistant(prev, (m) => ({ ...m, pending: false, done: true })));
      setStreaming(false);
      try { es.close(); } catch { /* ignore */ }
      esRef.current = null;
    });

    es.addEventListener("error", (e) => {
      let msg = "Stream error";
      try {
        const data = JSON.parse(e.data);
        msg = data?.message ?? msg;
      } catch { /* ignore */ }
      failPending(msg);
    });

    // If the browser closes the EventSource on network loss, surface it.
    es.onerror = () => {
      if (streaming && esRef.current === es) {
        failPending("Connection to the provider was lost.");
      }
    };
  }

  function failPending(message) {
    setError(message);
    setStreaming(false);
    setMessages((prev) => updateLastAssistant(prev, (m) => ({
      ...m,
      pending: false,
      failed: true,
      content: m.content || `⚠️ ${message}`
    })));
    if (esRef.current) {
      try { esRef.current.close(); } catch { /* ignore */ }
      esRef.current = null;
    }
  }

  function onComposerKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearConversation() {
    setMessages([]);
    setError(null);
    setProvider(null);
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--accent)]">Infernet Playground</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Chat on the P2P GPU network</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
              Every message you send is routed to a random live GPU node running the <code>infernet</code> CLI. No data center in the middle — the network scales as providers come online.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <label className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Model</label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              disabled={streaming}
              className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-sm text-white outline-none disabled:opacity-50"
            >
              <option value="">(any available)</option>
              {initialModels.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        <section
          ref={scrollRef}
          className="flex-1 min-h-[50vh] max-h-[65vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-inner"
        >
          {messages.length === 0 ? (
            <EmptyState onPick={(t) => setInput(t)} />
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((m, i) => (
                <Bubble key={i} message={m} />
              ))}
            </div>
          )}
        </section>

        {error ? (
          <div className="rounded-2xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-sm text-[var(--warn)]">
            {error}
          </div>
        ) : null}

        <footer className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.25)]">
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onComposerKey}
            placeholder={streaming ? "Streaming from a provider…" : "Ask anything. Shift+Enter for a newline."}
            rows={2}
            disabled={streaming}
            className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-white outline-none placeholder:text-[var(--muted)]/70 disabled:opacity-60"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs text-[var(--muted)]">
              {provider ? (
                <>Running on <span className="text-white">{provider.name ?? provider.nodeId}</span>{provider.gpuModel ? ` · ${provider.gpuModel}` : ""}.</>
              ) : (
                <>Public playground — rate limited per IP. No sign-in required.</>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearConversation}
                disabled={streaming || messages.length === 0}
                className="rounded-full border border-[var(--line)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:border-[var(--accent)] hover:bg-white/5 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={sendMessage}
                disabled={streaming || input.trim() === ""}
                className="rounded-full bg-[var(--accent-strong)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:brightness-110 disabled:opacity-40"
              >
                {streaming ? "…" : "Send"}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function updateLastAssistant(list, mutator) {
  const next = list.slice();
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role === "assistant") {
      next[i] = mutator(next[i]);
      return next;
    }
  }
  return next;
}

function Bubble({ message }) {
  const { role, content, provider, pending, failed } = message;
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6",
          isUser
            ? "bg-[var(--accent-strong)] text-black shadow-[0_8px_24px_rgba(20,184,166,0.25)]"
            : "border border-[var(--line)] bg-[var(--panel-strong)] text-white"
        ].join(" ")}
      >
        {!isUser && provider ? (
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            {provider.name ?? provider.nodeId}{provider.model ? ` · ${provider.model}` : ""}
          </p>
        ) : null}
        {content || (pending ? <TypingDots /> : null)}
        {failed ? <span className="ml-2 text-xs text-[var(--warn)]">failed</span> : null}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:240ms]" />
    </span>
  );
}

function EmptyState({ onPick }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-10 text-center">
      <div>
        <p className="text-sm uppercase tracking-[0.35em] text-[var(--accent)]">Decentralized inference</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">Ask the network anything</h2>
        <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
          Your prompt hits a live <code>infernet</code> provider over Supabase + Server-Sent Events, and tokens stream back as they're generated.
        </p>
      </div>
      <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-1">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPick(prompt)}
            className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-left text-sm text-white transition hover:border-[var(--accent)] hover:bg-white/5"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
