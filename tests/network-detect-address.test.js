import { describe, expect, it } from "vitest";

import { __internals } from "../apps/cli/lib/network.js";

const { isVirtualInterface, isDockerSubnet, isPrivateIPv4, platformPublicAddress } = __internals;

describe("isVirtualInterface — skip docker/cni/tun bridges", () => {
    it.each([
        ["docker0", true],
        ["docker1", true],
        ["br-9f3aab412abc", true],
        ["veth1234", true],
        ["cni0", true],
        ["flannel.1", true],
        ["calic0abc", true],
        ["weave", true],
        ["kube-bridge", true],
        ["lo", true],
        ["tailscale0", true],
        ["tun0", true],
        ["virbr0", true],
        ["eth0", false],
        ["en0", false],
        ["ens3", false],
        ["wlan0", false]
    ])("'%s' → virtual=%s", (name, expected) => {
        expect(isVirtualInterface(name)).toBe(expected);
    });
});

describe("isDockerSubnet — only flag the 172.17–172.31 range", () => {
    it.each([
        ["172.17.0.4", true],   // Vast.ai default container IP
        ["172.18.0.2", true],
        ["172.20.5.1", true],
        ["172.31.255.255", true],
        ["172.16.0.1", false],  // RFC1918 but NOT Docker default
        ["172.32.0.1", false],
        ["10.0.0.5", false],
        ["192.168.1.1", false],
        ["1.2.3.4", false],
        ["not-an-ip", false]
    ])("'%s' → docker=%s", (ip, expected) => {
        expect(isDockerSubnet(ip)).toBe(expected);
    });
});

describe("isPrivateIPv4 — RFC1918 + link-local + loopback", () => {
    it.each([
        ["10.0.0.1", true],
        ["172.16.0.1", true],
        ["172.31.255.255", true],
        ["192.168.1.1", true],
        ["169.254.169.254", true],
        ["127.0.0.1", true],
        ["8.8.8.8", false],
        ["1.1.1.1", false],
        ["172.32.0.1", false]
    ])("'%s' → private=%s", (ip, expected) => {
        expect(isPrivateIPv4(ip)).toBe(expected);
    });
});

describe("platformPublicAddress — env override resolution order", () => {
    it("INFERNET_PUBLIC_ADDRESS wins over platform-specific envs", () => {
        const orig = { ...process.env };
        try {
            process.env.INFERNET_PUBLIC_ADDRESS = "5.6.7.8";
            process.env.RUNPOD_PUBLIC_IP = "1.2.3.4";
            process.env.PUBLIC_IPADDR = "9.9.9.9";
            expect(platformPublicAddress()).toBe("5.6.7.8");
        } finally { Object.assign(process.env, orig); for (const k of Object.keys(process.env)) if (!(k in orig)) delete process.env[k]; }
    });

    it("RUNPOD_PUBLIC_IP picked up when no explicit override", () => {
        const orig = { ...process.env };
        try {
            delete process.env.INFERNET_PUBLIC_ADDRESS;
            process.env.RUNPOD_PUBLIC_IP = "1.2.3.4";
            delete process.env.PUBLIC_IPADDR;
            expect(platformPublicAddress()).toBe("1.2.3.4");
        } finally { Object.assign(process.env, orig); for (const k of Object.keys(process.env)) if (!(k in orig)) delete process.env[k]; }
    });

    it("PUBLIC_IPADDR (Vast.ai) picked up when no other override", () => {
        const orig = { ...process.env };
        try {
            delete process.env.INFERNET_PUBLIC_ADDRESS;
            delete process.env.RUNPOD_PUBLIC_IP;
            process.env.PUBLIC_IPADDR = "9.9.9.9";
            expect(platformPublicAddress()).toBe("9.9.9.9");
        } finally { Object.assign(process.env, orig); for (const k of Object.keys(process.env)) if (!(k in orig)) delete process.env[k]; }
    });

    it("returns null with no envs set", () => {
        const orig = { ...process.env };
        try {
            delete process.env.INFERNET_PUBLIC_ADDRESS;
            delete process.env.RUNPOD_PUBLIC_IP;
            delete process.env.PUBLIC_IPADDR;
            expect(platformPublicAddress()).toBe(null);
        } finally { Object.assign(process.env, orig); for (const k of Object.keys(process.env)) if (!(k in orig)) delete process.env[k]; }
    });
});
