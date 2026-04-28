import { describe, expect, it } from "vitest";
import { decideRoute } from "../apps/cli/lib/route.js";

const KNOWN = new Set([
    "init", "login", "register", "update", "remove",
    "start", "status", "stop", "stats", "logs",
    "payout", "payments", "gpu", "firewall",
    "chat", "setup", "model", "tui", "doctor", "service",
    "help"
]);

describe("decideRoute — explicit help shortcuts", () => {
    it("'help' → help command", () => {
        expect(decideRoute(["help"], KNOWN)).toEqual({ command: "help", rest: [] });
    });
    it("'--help' → help command", () => {
        expect(decideRoute(["--help"], KNOWN)).toEqual({ command: "help", rest: [] });
    });
    it("'-h' → help command", () => {
        expect(decideRoute(["-h"], KNOWN)).toEqual({ command: "help", rest: [] });
    });
});

describe("decideRoute — bare invocation", () => {
    it("no args + TTY → help (don't surprise with a chat REPL)", () => {
        const r = decideRoute([], KNOWN, { isTTY: true });
        expect(r).toEqual({ command: "help", rest: [] });
    });

    it("no args + piped stdin → chat (read prompt from stdin)", () => {
        const r = decideRoute([], KNOWN, { isTTY: false });
        expect(r).toEqual({ command: "chat", rest: [] });
    });
});

describe("decideRoute — known subcommands", () => {
    it("dispatches a known subcommand verbatim", () => {
        expect(decideRoute(["init"], KNOWN)).toEqual({ command: "init", rest: [] });
    });

    it("forwards remaining args as rest", () => {
        expect(decideRoute(["init", "--url", "https://x"], KNOWN))
            .toEqual({ command: "init", rest: ["--url", "https://x"] });
    });

    it("explicit chat still works (rest carries the prompt)", () => {
        expect(decideRoute(["chat", "what is 2+2?"], KNOWN))
            .toEqual({ command: "chat", rest: ["what is 2+2?"] });
    });

    it("explicit chat + flags", () => {
        expect(decideRoute(["chat", "--backend", "stub", "ping"], KNOWN))
            .toEqual({ command: "chat", rest: ["--backend", "stub", "ping"] });
    });
});

describe("decideRoute — implicit chat (default verb)", () => {
    it("a single non-command word routes to chat", () => {
        expect(decideRoute(["hello"], KNOWN))
            .toEqual({ command: "chat", rest: ["hello"] });
    });

    it("a quoted multi-word prompt routes to chat with all of argv", () => {
        expect(decideRoute(["what is 2+2?"], KNOWN))
            .toEqual({ command: "chat", rest: ["what is 2+2?"] });
    });

    it("multi-word unquoted argv routes to chat with the whole argv as rest", () => {
        expect(decideRoute(["what", "is", "2+2?"], KNOWN))
            .toEqual({ command: "chat", rest: ["what", "is", "2+2?"] });
    });

    it("flags before a non-command first token still route to chat", () => {
        expect(decideRoute(["--json", "what is 2+2?"], KNOWN))
            .toEqual({ command: "chat", rest: ["--json", "what is 2+2?"] });
    });
});

describe("decideRoute — defensive contracts", () => {
    it("requires argv to be an array", () => {
        expect(() => decideRoute("init", KNOWN)).toThrow(/argv must be an array/);
    });

    it("requires knownCommands to be a Set", () => {
        expect(() => decideRoute(["init"], ["init", "chat"])).toThrow(/must be a Set/);
    });

    it("does not mutate argv", () => {
        const argv = ["chat", "ping"];
        decideRoute(argv, KNOWN);
        expect(argv).toEqual(["chat", "ping"]);
    });
});

describe("decideRoute — protects against subcommand collision", () => {
    // If we ever name a subcommand "what" or "hello", we'd accidentally
    // capture user prompts. These tests pin the current command list so
    // a future rename-to-something-common gets a CI failure that points
    // at this property.
    it("'init' is reserved and not a chat prompt", () => {
        expect(decideRoute(["init", "stuff"], KNOWN).command).toBe("init");
    });

    it("a one-letter unknown token routes to chat (no future subcommand should be a single letter)", () => {
        expect(decideRoute(["x"], KNOWN).command).toBe("chat");
    });
});
