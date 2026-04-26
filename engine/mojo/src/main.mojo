# Infernet engine — Mojo entrypoint.
#
# Speaks the v1 NDJSON protocol defined in
# `packages/engine/src/protocol.js`. One JSON object per line, terminated
# by `\n`, on both stdin (commands) and stdout (events).
#
# Bumping the protocol version requires updating both this file and the
# JS side together — they are deliberately decoupled compilation units.
#
# Status: SCAFFOLD. This program reads commands and emits canned tokens
# so the JS daemon end-to-end works once a Mojo toolchain is installed.
# The real work — replacing `handle_generate()` with a MAX graph that
# loads a model and streams tokens — lives in a follow-up.
#
# Why Python interop for I/O: Mojo's stdlib stdin/stdout APIs are still
# in flux pre-1.0. Going through `sys.stdin` / `sys.stdout` via Python
# interop is the most-stable cross-version option until Mojo ships a
# settled native I/O API. Replace with native Mojo I/O once available.

from python import Python
from time import sleep

alias PROTOCOL_VERSION: Int = 1

fn make_msg(py: PythonObject, type_: String) raises -> PythonObject:
    var d = py.dict()
    d["v"] = PROTOCOL_VERSION
    d["type"] = type_
    return d

fn send(sys_mod: PythonObject, json_mod: PythonObject, msg: PythonObject) raises:
    var line = json_mod.dumps(msg)
    sys_mod.stdout.write(line)
    sys_mod.stdout.write("\n")
    sys_mod.stdout.flush()

fn handle_load(sys_mod: PythonObject, json_mod: PythonObject, req: PythonObject) raises:
    # TODO(MAX): load the model into a MAX graph here.
    var ack = make_msg(json_mod.__builtins__, "ready")
    ack["model"] = req.get("model", None)
    send(sys_mod, json_mod, ack)

fn handle_generate(sys_mod: PythonObject, json_mod: PythonObject, builtins: PythonObject, req: PythonObject) raises:
    # TODO(MAX): replace the canned token loop with a real MAX inference
    # streaming loop reading the prompt from req["messages"].
    var id = req["id"]

    var meta = make_msg(builtins, "meta")
    meta["id"] = id
    meta["model"] = req.get("model", None)
    meta["started_at"] = builtins.str(builtins.None)  # placeholder
    send(sys_mod, json_mod, meta)

    var tokens = builtins.list()
    tokens.append("Mojo ")
    tokens.append("engine ")
    tokens.append("scaffold ")
    tokens.append("— ")
    tokens.append("MAX ")
    tokens.append("not ")
    tokens.append("yet ")
    tokens.append("wired.")

    var acc = String("")
    var n = Int(builtins.len(tokens))
    for i in range(n):
        var tok_py = tokens[i]
        var tok_msg = make_msg(builtins, "token")
        tok_msg["id"] = id
        tok_msg["text"] = tok_py
        send(sys_mod, json_mod, tok_msg)
        acc += String(tok_py)
        sleep(0.04)

    var done = make_msg(builtins, "done")
    done["id"] = id
    done["reason"] = "stop"
    done["text"] = acc
    send(sys_mod, json_mod, done)

fn run() raises:
    var sys_mod = Python.import_module("sys")
    var json_mod = Python.import_module("json")
    var builtins = Python.import_module("builtins")

    # Announce readiness so the JS wrapper can resolve its `ready` promise.
    var ready = make_msg(builtins, "ready")
    ready["model"] = None
    send(sys_mod, json_mod, ready)

    while True:
        var line_py = sys_mod.stdin.readline()
        var line_str = String(line_py).strip()
        if len(line_str) == 0:
            return  # stdin closed

        var parsed = json_mod.loads(line_py)
        if Int(parsed.get("v", 0)) != PROTOCOL_VERSION:
            var err = make_msg(builtins, "error")
            err["message"] = "protocol version mismatch"
            send(sys_mod, json_mod, err)
            continue

        var t = String(parsed["type"])
        if t == "shutdown":
            return
        elif t == "generate":
            handle_generate(sys_mod, json_mod, builtins, parsed)
        elif t == "load":
            handle_load(sys_mod, json_mod, parsed)
        elif t == "cancel":
            # Single-threaded scaffold: nothing in flight to cancel. Real
            # MAX integration will track per-id stop flags.
            pass
        else:
            var err = make_msg(builtins, "error")
            err["message"] = "unknown message type: " + t
            send(sys_mod, json_mod, err)

fn main() raises:
    run()
