import { describe, expect, it } from "vitest";
import os from "node:os";
import {
    detectCpus,
    detectHost,
    formatCpuLine,
    __testables__
} from "../packages/gpu/src/cpu.js";

const { vendorOfModel } = __testables__;

describe("vendorOfModel", () => {
    it("identifies Intel by name", () => {
        expect(vendorOfModel("Intel(R) Xeon(R) CPU E5-2690 v4 @ 2.60GHz")).toBe("intel");
        expect(vendorOfModel("Intel Core i9-13900K")).toBe("intel");
    });

    it("identifies AMD by family names", () => {
        expect(vendorOfModel("AMD Ryzen Threadripper PRO 7975WX 32-Cores")).toBe("amd");
        expect(vendorOfModel("AMD EPYC 9654 96-Core Processor")).toBe("amd");
        expect(vendorOfModel("Ryzen 9 7950X")).toBe("amd");
    });

    it("identifies Apple Silicon", () => {
        expect(vendorOfModel("Apple M2 Max")).toBe("apple");
        expect(vendorOfModel("Apple M3 Ultra")).toBe("apple");
        expect(vendorOfModel("M1")).toBe("apple");
    });

    it("identifies AWS Graviton", () => {
        expect(vendorOfModel("AWS Graviton3")).toBe("aws");
    });

    it("identifies Ampere Altra", () => {
        expect(vendorOfModel("Ampere Altra Q80-30")).toBe("ampere");
    });

    it("returns null for unknown / missing strings", () => {
        expect(vendorOfModel(null)).toBeNull();
        expect(vendorOfModel(undefined)).toBeNull();
        expect(vendorOfModel("")).toBeNull();
        expect(vendorOfModel("Mystery Chip 9000")).toBeNull();
    });
});

describe("detectCpus", () => {
    it("returns at least one entry on a real host", () => {
        const cpus = detectCpus();
        expect(Array.isArray(cpus)).toBe(true);
        expect(cpus.length).toBeGreaterThanOrEqual(1);
    });

    it("each entry has the documented shape", () => {
        const cpus = detectCpus();
        for (const c of cpus) {
            expect(c).toHaveProperty("model");
            expect(c).toHaveProperty("arch");
            expect(c).toHaveProperty("speed_mhz");
            expect(c).toHaveProperty("cores_total");
            expect(c).toHaveProperty("cores_per_group");
            expect(c).toHaveProperty("vendor");
            expect(typeof c.cores_total).toBe("number");
        }
    });

    it("collapses identical model+speed entries (typical homogeneous box → one group)", () => {
        const cpus = detectCpus();
        // node:os usually reports one entry per logical core. Our group
        // function should fold them into a smaller number of groups
        // (often 1 on uniform hardware).
        const total = cpus.reduce((s, c) => s + c.cores_total, 0);
        expect(total).toBe(os.cpus().length);
    });
});

describe("detectHost", () => {
    it("includes platform, arch, node version", () => {
        const h = detectHost();
        expect(h.platform).toBe(process.platform);
        expect(h.arch).toBe(process.arch);
        expect(h.node_version).toBe(process.versions.node);
    });

    it("reports a positive RAM total", () => {
        const h = detectHost();
        expect(h.total_ram_mb).toBeGreaterThan(0);
    });

    it("returns a 3-element load average array (Linux/macOS)", () => {
        const h = detectHost();
        expect(Array.isArray(h.load_avg)).toBe(true);
        expect(h.load_avg).toHaveLength(3);
    });
});

describe("formatCpuLine", () => {
    it("renders a vendor + model + cores + GHz string", () => {
        const line = formatCpuLine({
            vendor: "intel",
            model: "Intel(R) Xeon(R) Platinum 8380",
            speed_mhz: 2300,
            cores_total: 80,
            arch: "x64"
        });
        expect(line).toContain("[intel]");
        expect(line).toContain("Intel(R) Xeon(R) Platinum 8380");
        expect(line).toContain("80 cores");
        expect(line).toContain("2.30 GHz");
    });

    it("handles missing vendor gracefully", () => {
        const line = formatCpuLine({
            vendor: null,
            model: "Mystery 9000",
            speed_mhz: 3500,
            cores_total: 8
        });
        expect(line).not.toContain("[null]");
        expect(line).not.toContain("[]");
        expect(line).toContain("Mystery 9000");
    });

    it("handles missing speed", () => {
        const line = formatCpuLine({
            vendor: "intel",
            model: "Intel CPU",
            speed_mhz: null,
            cores_total: 4
        });
        expect(line).toContain("?");
    });
});
