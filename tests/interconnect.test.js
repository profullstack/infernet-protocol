import { describe, it, expect } from "vitest";
import {
    parseNvidiaTopo,
    interconnectEnv,
    formatInterconnectSummary
} from "../packages/gpu/src/interconnect.js";

describe("parseNvidiaTopo", () => {
    it("returns no edges for a topology where every cell is X / SYS", () => {
        const text = `
            GPU0    GPU1    GPU2    CPU Affinity
GPU0     X      SYS     SYS     0-15
GPU1    SYS      X      SYS     0-15
GPU2    SYS     SYS      X      0-15
        `;
        expect(parseNvidiaTopo(text)).toEqual([]);
    });

    it("extracts NVLink edges and dedupes the symmetric matrix", () => {
        const text = `
            GPU0    GPU1    GPU2    GPU3    CPU Affinity
GPU0     X      NV2     NV2     NV2     0-15
GPU1    NV2      X      NV2     NV2     0-15
GPU2    NV2     NV2      X      NV2     0-15
GPU3    NV2     NV2     NV2      X      0-15
        `;
        const links = parseNvidiaTopo(text);
        expect(links).toHaveLength(6); // C(4,2) = 6 unique pairs
        for (const l of links) {
            expect(l.kind).toBe("NV2");
            expect(l.from).toBeLessThan(l.to);
        }
    });

    it("ignores PCIe-only paths (PHB / NODE / PIX)", () => {
        const text = `
            GPU0    GPU1    CPU Affinity
GPU0     X      PHB     0-7
GPU1    PHB      X      0-7
        `;
        expect(parseNvidiaTopo(text)).toEqual([]);
    });

    it("handles a 2-GPU NVLink bridge", () => {
        const text = `
            GPU0    GPU1    CPU Affinity
GPU0     X      NV1     0-7
GPU1    NV1      X      0-7
        `;
        const links = parseNvidiaTopo(text);
        expect(links).toEqual([{ from: 0, to: 1, kind: "NV1" }]);
    });
});

describe("interconnectEnv", () => {
    it("emits nothing when nothing is available", () => {
        expect(
            interconnectEnv({
                nvlink: { available: false },
                infiniband: { available: false, devices: [] },
                rdma_capable: false
            })
        ).toEqual({});
    });

    it("flags NVLink when available", () => {
        const env = interconnectEnv({
            nvlink: { available: true, topology: "all-to-all" },
            infiniband: { available: false, devices: [] },
            rdma_capable: false
        });
        expect(env.INFERNET_NVLINK).toBe("1");
        expect(env.INFERNET_NVLINK_TOPOLOGY).toBe("all-to-all");
    });

    it("constructs NCCL_IB_HCA from active IB devices and ports", () => {
        const env = interconnectEnv({
            nvlink: { available: false },
            infiniband: {
                available: true,
                devices: [
                    { name: "mlx5_0", port: 1, state: "active" },
                    { name: "mlx5_1", port: 1, state: "active" },
                    { name: "mlx5_2", port: 1, state: "down" } // skipped
                ]
            },
            rdma_capable: true
        });
        expect(env.NCCL_IB_DISABLE).toBe("0");
        expect(env.NCCL_IB_HCA).toBe("mlx5_0:1,mlx5_1:1");
        expect(env.INFERNET_RDMA).toBe("1");
    });

    it("does not emit NCCL_IB_HCA when IB is up but no device has a name+state=active", () => {
        const env = interconnectEnv({
            nvlink: { available: false },
            infiniband: { available: true, devices: [{ name: "mlx5_0", port: 1, state: "init" }] },
            rdma_capable: false
        });
        expect(env.NCCL_IB_HCA).toBeUndefined();
        expect(env.NCCL_IB_DISABLE).toBeUndefined();
    });
});

describe("formatInterconnectSummary", () => {
    it("describes a node with neither", () => {
        const s = formatInterconnectSummary({
            nvlink: { available: false, links: [], topology: "none" },
            infiniband: { available: false, devices: [] },
            rdma_capable: false
        });
        expect(s).toContain("NVLink: none");
        expect(s).toContain("InfiniBand: none");
    });

    it("describes a fully fabric-connected node", () => {
        const s = formatInterconnectSummary({
            nvlink: { available: true, topology: "all-to-all", links: [{ from: 0, to: 1, kind: "NV2" }] },
            infiniband: { available: true, devices: [{ name: "mlx5_0", port: 1, state: "active" }] },
            rdma_capable: true
        });
        expect(s).toContain("NVLink all-to-all");
        expect(s).toContain("InfiniBand 1 active port");
        expect(s).toContain("RDMA-capable");
    });
});
