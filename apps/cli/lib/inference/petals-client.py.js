/**
 * Bundled Python petals client. Spawned by the daemon when it accepts
 * an /v1/petals/inference POST. Fans out across the public Petals
 * swarm using AutoDistributedModelForCausalLM and streams JSON lines
 * (one per token) to stdout. The daemon converts those to SSE frames.
 */

export const PETALS_CLIENT_PY = `#!/usr/bin/env python3
"""Petals client — fans out across the swarm + streams tokens.

Reads:  JSON request from stdin: { model, messages, max_tokens, temperature }
Writes: JSON lines to stdout:    { event: 'token' | 'done' | 'error', ... }

Each output line is a single JSON object terminated with \\n so the
parent process can parse them line-by-line.
"""
import json
import sys
import time

def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\\n")
    sys.stdout.flush()

def main():
    try:
        req = json.loads(sys.stdin.read())
    except Exception as e:
        emit({"event": "error", "message": f"bad request: {e}"})
        sys.exit(2)

    model = req.get("model")
    messages = req.get("messages", [])
    max_tokens = int(req.get("max_tokens") or 256)
    temperature = float(req.get("temperature") or 0.7)
    if not model:
        emit({"event": "error", "message": "model required"})
        sys.exit(2)

    try:
        import torch
        from transformers import AutoTokenizer
        from petals import AutoDistributedModelForCausalLM
    except ImportError as e:
        emit({"event": "error", "message": f"petals not installed: {e}. Install: pip install -U petals"})
        sys.exit(2)

    emit({"event": "loading", "model": model})
    tokenizer = AutoTokenizer.from_pretrained(model)
    model_obj = AutoDistributedModelForCausalLM.from_pretrained(model, torch_dtype=torch.float16)

    # Compose a single prompt from messages using the tokenizer's chat template.
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    input_ids = tokenizer.encode(prompt, return_tensors="pt")

    emit({"event": "ready", "input_tokens": int(input_ids.shape[-1])})

    # Petals streams via inference_session — emit one JSON line per generated token.
    full_text = ""
    t0 = time.time()
    with model_obj.inference_session(max_length=int(input_ids.shape[-1]) + max_tokens) as session:
        # Prefill
        outputs = model_obj.generate(
            input_ids,
            max_new_tokens=1,
            do_sample=temperature > 0,
            temperature=max(temperature, 1e-3),
            session=session,
        )
        new_id = int(outputs[0, -1])
        token_text = tokenizer.decode([new_id], skip_special_tokens=True)
        full_text += token_text
        emit({"event": "token", "text": token_text})

        # IPIP-0031 per-layer attribution: after the first generate the
        # session has resolved which DHT peers serve which transformer
        # blocks. Emit that mapping so the control plane can split the
        # CPR receipt across layer-contributing operators by block share.
        try:
            chosen = []
            for s in getattr(session, "chosen_servers", []) or []:
                chosen.append({
                    "peer_id": str(getattr(s, "peer_id", "")),
                    "start_block": int(getattr(s, "start", getattr(s, "start_block", 0))),
                    "end_block":   int(getattr(s, "end",   getattr(s, "end_block",   0))),
                })
            if chosen:
                emit({"event": "routing", "peers": chosen})
        except Exception as e:
            emit({"event": "log", "warn": f"chosen_servers extract failed: {e}"})

        for _ in range(max_tokens - 1):
            outputs = model_obj.generate(
                outputs,
                max_new_tokens=1,
                do_sample=temperature > 0,
                temperature=max(temperature, 1e-3),
                session=session,
            )
            new_id = int(outputs[0, -1])
            if new_id == tokenizer.eos_token_id:
                break
            token_text = tokenizer.decode([new_id], skip_special_tokens=True)
            full_text += token_text
            emit({"event": "token", "text": token_text})

    emit({"event": "done", "text": full_text, "elapsed_s": round(time.time() - t0, 2)})

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit({"event": "error", "message": str(e)})
        sys.exit(1)
`;
