/**
 * Provider model for Infernet Protocol
 * Represents nodes that contribute GPU compute resources
 */
const db = require('../index');

class Provider {
    /**
     * Get all available providers
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @param {Object} options - Additional query options
     * @returns {Promise<Object>} - List of providers
     */
    static async getAll(page = 1, perPage = 50, options = {}) {
        const pb = db.getInstance();
        return await pb.collection('providers').getList(page, perPage, options);
    }
    
    /**
     * Get providers filtered by GPU specifications
     * @param {Object} gpuSpecs - GPU specifications to filter by
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @returns {Promise<Object>} - List of matching providers
     */
    static async findByGpuSpecs(gpuSpecs, page = 1, perPage = 20) {
        const pb = db.getInstance();
        
        // Construct filter based on GPU specifications
        let filterParts = [];
        
        if (gpuSpecs.minVram) {
            filterParts.push(`vram >= ${gpuSpecs.minVram}`);
        }
        
        if (gpuSpecs.minCores) {
            filterParts.push(`cuda_cores >= ${gpuSpecs.minCores}`);
        }
        
        if (gpuSpecs.gpuModel) {
            filterParts.push(`gpu_model ~ "${gpuSpecs.gpuModel}"`);
        }
        
        // Add availability filter
        filterParts.push('status = "available"');
        
        const filter = filterParts.join(' && ');
        
        return await pb.collection('providers').getList(page, perPage, {
            filter,
            sort: '-reputation,+price'
        });
    }
    
    /**
     * Get a single provider by ID
     * @param {string} id - Provider ID
     * @returns {Promise<Object>} - Provider record
     */
    static async getById(id) {
        const pb = db.getInstance();
        return await pb.collection('providers').getOne(id);
    }
    
    /**
     * Create a new provider
     * @param {Object} data - Provider data
     * @returns {Promise<Object>} - Created provider record
     */
    static async create(data) {
        const pb = db.getInstance();
        return await pb.collection('providers').create(data);
    }
    
    /**
     * Update a provider
     * @param {string} id - Provider ID
     * @param {Object} data - Updated provider data
     * @returns {Promise<Object>} - Updated provider record
     */
    static async update(id, data) {
        const pb = db.getInstance();
        return await pb.collection('providers').update(id, data);
    }
    
    /**
     * Delete a provider
     * @param {string} id - Provider ID
     * @returns {Promise<boolean>} - Success status
     */
    static async delete(id) {
        const pb = db.getInstance();
        await pb.collection('providers').delete(id);
        return true;
    }
    
    /**
     * Update provider status
     * @param {string} id - Provider ID
     * @param {string} status - New status (available, busy, offline)
     * @returns {Promise<Object>} - Updated provider record
     */
    static async updateStatus(id, status) {
        const pb = db.getInstance();
        return await pb.collection('providers').update(id, { status });
    }
    
    /**
     * Update provider reputation score
     * @param {string} id - Provider ID
     * @param {number} reputationDelta - Change in reputation score
     * @returns {Promise<Object>} - Updated provider record
     */
    static async updateReputation(id, reputationDelta) {
        const pb = db.getInstance();
        const provider = await pb.collection('providers').getOne(id);
        
        const newReputation = Math.max(0, Math.min(100, provider.reputation + reputationDelta));
        
        return await pb.collection('providers').update(id, { 
            reputation: newReputation 
        });
    }
    
    /**
     * Subscribe to changes in provider records
     * @param {Function} callback - Callback function for updates
     * @returns {void}
     */
    static subscribeToChanges(callback) {
        const pb = db.getInstance();
        pb.collection('providers').subscribe('*', callback);
    }
    
    /**
     * Unsubscribe from provider changes
     * @returns {void}
     */
    static unsubscribe() {
        const pb = db.getInstance();
        pb.collection('providers').unsubscribe();
    }
}

module.exports = Provider;
