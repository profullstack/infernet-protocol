import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { buildServiceUnit, getServicePath, SERVICE_NAME } from "../apps/cli/commands/service.js";

describe("getServicePath", () => {
    it("targets ~/.config/systemd/user/infernet.service", () => {
        const p = getServicePath();
        expect(p).toBe(path.join(os.homedir(), ".config", "systemd", "user", `${SERVICE_NAME}.service`));
    });

    it("uses the constant SERVICE_NAME", () => {
        expect(SERVICE_NAME).toBe("infernet");
    });
});

describe("buildServiceUnit", () => {
    const baseArgs = {
        nodeBin: "/usr/bin/node",
        cliEntry: "/home/ubuntu/.infernet/source/apps/cli/index.js"
    };

    it("renders all three required systemd sections", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit).toContain("[Unit]");
        expect(unit).toContain("[Service]");
        expect(unit).toContain("[Install]");
    });

    it("uses Type=simple so systemd doesn't expect a fork", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit).toContain("Type=simple");
    });

    it("ExecStart calls infernet start --foreground", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit).toContain(
            "ExecStart=/usr/bin/node /home/ubuntu/.infernet/source/apps/cli/index.js start --foreground"
        );
    });

    it("sets Restart=on-failure with a 10s back-off", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit).toContain("Restart=on-failure");
        expect(unit).toContain("RestartSec=10");
    });

    it("default WantedBy is default.target (user-session, not multi-user)", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit).toContain("WantedBy=default.target");
    });

    it("waits for network-online so the daemon doesn't try to register pre-network", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit).toContain("After=network-online.target");
        expect(unit).toContain("Wants=network-online.target");
    });

    it("includes Environment=NODE_ENV=production by default", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit).toContain("Environment=NODE_ENV=production");
    });

    it("appends caller-supplied environment variables as Environment= lines", () => {
        const unit = buildServiceUnit({
            ...baseArgs,
            environment: {
                INFERNET_ENGINE_MODEL: "qwen2.5:7b",
                OLLAMA_HOST: "http://localhost:11434"
            }
        });
        expect(unit).toContain("Environment=INFERNET_ENGINE_MODEL=qwen2.5:7b");
        expect(unit).toContain("Environment=OLLAMA_HOST=http://localhost:11434");
    });

    it("filters out undefined / empty environment values", () => {
        const unit = buildServiceUnit({
            ...baseArgs,
            environment: { EMPTY: "", NIL: undefined, REAL: "x" }
        });
        expect(unit).toContain("Environment=REAL=x");
        expect(unit).not.toContain("Environment=EMPTY=");
        expect(unit).not.toContain("Environment=NIL=");
    });

    it("uses the supplied description if provided", () => {
        const unit = buildServiceUnit({ ...baseArgs, description: "Custom name" });
        expect(unit).toMatch(/^Description=Custom name$/m);
    });

    it("documentation URL points at the canonical site", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit).toContain("Documentation=https://infernetprotocol.com");
    });

    it("throws when nodeBin is missing", () => {
        expect(() => buildServiceUnit({ cliEntry: "/x" }))
            .toThrow(/nodeBin is required/);
    });

    it("throws when cliEntry is missing", () => {
        expect(() => buildServiceUnit({ nodeBin: "/x" }))
            .toThrow(/cliEntry is required/);
    });

    it("output ends with a trailing newline (systemd hygiene)", () => {
        const unit = buildServiceUnit(baseArgs);
        expect(unit.endsWith("\n")).toBe(true);
    });
});
