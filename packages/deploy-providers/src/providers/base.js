/**
 * DeployProvider — common base class every cloud-GPU adapter extends.
 *
 * Per IPIP-0019. Methods that aren't supported by a specific provider
 * MUST throw NotSupportedError with a useful message — never silently
 * no-op. The CLI dispatches by provider id and calls these methods
 * uniformly; each adapter's job is to translate to/from its native API.
 */

export class NotSupportedError extends Error {
    constructor(method, providerId) {
        super(`${providerId}: ${method}() is not supported`);
        this.name = "NotSupportedError";
        this.method = method;
        this.providerId = providerId;
    }
}

export class DeployProvider {
    /**
     * @param {object} config
     * @param {string} config.apiKey       provider API key (env or auth set)
     * @param {string} config.providerId   short id like "runpod"
     * @param {object} [config.env]        operator env passthrough
     */
    constructor(config = {}) {
        if (!config.apiKey) throw new Error(`${config.providerId ?? "provider"}: apiKey required`);
        if (!config.providerId) throw new Error("DeployProvider: providerId required");
        this.config = config;
        this.providerId = config.providerId;
    }

    // ---- Discovery ----

    async validateAuth() {
        throw new NotSupportedError("validateAuth", this.providerId);
    }

    async listGpuTypes() {
        throw new NotSupportedError("listGpuTypes", this.providerId);
    }

    async listRegions() {
        throw new NotSupportedError("listRegions", this.providerId);
    }

    /**
     * Search the provider's catalog for offers matching the request.
     * Returns Offer[] (per IPIP-0019 §2 type definition).
     */
    async findOffers(_request) {
        throw new NotSupportedError("findOffers", this.providerId);
    }

    // ---- Lifecycle ----

    /**
     * Allocate the resource. Returns a NodeRecord with status="creating".
     * The CLI saves this immediately so even a crash mid-flow leaves a
     * destroy path.
     */
    async createNode(_request) {
        throw new NotSupportedError("createNode", this.providerId);
    }

    /**
     * Poll until the node is reachable / running. Returns updated
     * NodeRecord with endpoint info (e.g. IP, ssh details).
     */
    async waitUntilReady(_node, _timeoutMs = 5 * 60 * 1000) {
        throw new NotSupportedError("waitUntilReady", this.providerId);
    }

    /**
     * Run the bootstrap step that turns a raw VM/pod into an Infernet
     * provider node (install daemon, start engine, register).
     * For Docker-style providers this often happens at create time and
     * bootstrapNode is a no-op health check.
     */
    async bootstrapNode(_node, _request) {
        throw new NotSupportedError("bootstrapNode", this.providerId);
    }

    async getNode(_nodeId) {
        throw new NotSupportedError("getNode", this.providerId);
    }

    async listNodes() {
        throw new NotSupportedError("listNodes", this.providerId);
    }

    async stopNode(_nodeId) {
        throw new NotSupportedError("stopNode", this.providerId);
    }

    async startNode(_nodeId) {
        throw new NotSupportedError("startNode", this.providerId);
    }

    async destroyNode(_nodeId) {
        throw new NotSupportedError("destroyNode", this.providerId);
    }

    async logs(_nodeId, _opts = {}) {
        throw new NotSupportedError("logs", this.providerId);
    }
}
