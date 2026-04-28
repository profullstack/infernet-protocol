import { describe, expect, it } from "vitest";
import { makeStreamSanitizer, sanitizeText } from "../apps/web/lib/sanitize-stream.js";

describe("makeStreamSanitizer", () => {
    it("passes clean text through unchanged", () => {
        const s = makeStreamSanitizer();
        expect(s.process("hello world") + s.flush()).toBe("hello world");
    });

    it("strips a complete <ip_reminder> block in one chunk", () => {
        const s = makeStreamSanitizer();
        const text = "before<ip_reminder>secret stuff</ip_reminder>after";
        expect(s.process(text) + s.flush()).toBe("beforeafter");
    });

    it("strips a leak block split across many tokens", () => {
        const s = makeStreamSanitizer();
        const tokens = ["hi ", "<ip_", "reminder", ">", "DON'T LEAK", "</ip_reminder", ">", " bye"];
        let out = "";
        for (const t of tokens) out += s.process(t);
        out += s.flush();
        expect(out).toBe("hi  bye");
    });

    it("strips system-reminder tags", () => {
        const s = makeStreamSanitizer();
        const text = "ok <system-reminder>internal</system-reminder> done";
        expect(s.process(text) + s.flush()).toBe("ok  done");
    });

    it("strips antml-namespaced tags", () => {
        const s = makeStreamSanitizer();
        // Build the tag name with string concat to keep the colon
        // intact (some markdown renderers strip namespaced tags).
        const open = "<" + "antml:foo>";
        const close = "<" + "/antml:foo>";
        const text = `x ${open}hidden${close} y`;
        expect(s.process(text) + s.flush()).toBe("x  y");
    });

    it("doesn't choke on legitimate angle brackets in code", () => {
        const s = makeStreamSanitizer();
        const text = "use <div> elements not <span>";
        // No leak tags; output should equal input.
        expect(s.process(text) + s.flush()).toBe("use <div> elements not <span>");
    });

    it("drops trailing buffer if mid-suppression at flush time", () => {
        const s = makeStreamSanitizer();
        // Open tag arrived but never closed before stream ended.
        const out = s.process("hello <ip_reminder>still going") + s.flush();
        expect(out).toBe("hello ");
    });

    it("handles back-to-back leak blocks", () => {
        const s = makeStreamSanitizer();
        const text = "a<ip_reminder>x</ip_reminder>b<system-reminder>y</system-reminder>c";
        expect(s.process(text) + s.flush()).toBe("abc");
    });

    it("emits prefix even when an open tag follows", () => {
        const s = makeStreamSanitizer();
        const out = s.process("safe text<ip_reminder>not safe");
        // Prefix emitted; mid-suppression buffer not yet drained.
        expect(out).toBe("safe text");
    });
});

describe("sanitizeText (one-shot)", () => {
    it("strips leak block", () => {
        expect(sanitizeText("a<ip_reminder>x</ip_reminder>b")).toBe("ab");
    });
    it("returns empty string unchanged", () => {
        expect(sanitizeText("")).toBe("");
    });
    it("returns null/undefined safely", () => {
        expect(sanitizeText(null)).toBe("");
        expect(sanitizeText(undefined)).toBe("");
    });
});
