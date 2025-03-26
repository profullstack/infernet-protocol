/**
 * Aggregator model for Infernet Protocol
 * Represents nodes that coordinate multi-node jobs, manage task distribution,
 * verification, and result assembly
 */
const db = require('../index');

class Aggregator {
    /**
     * Get all aggregators
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @param {Object} options - Additional query options
     * @returns {Promise<Object>} - List of aggregators
     */
    static async getAll(page = 1, perPage = 50, options = {}) {
        const pb = db.getInstance();
        return await pb.collection('aggregators').getList(page, perPage, options);
    }
    
    /**
     * Get available aggregators for job coordination
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @returns {Promise<Object>} - List of available aggregators
     */
    static async getAvailable(page = 1, perPage = 20) {
        const pb = db.getInstance();
        return await pb.collection('aggregators').getList(page, perPage, {
            filter: 'status = "available" && load < max_load',
            sort: '+load,-reputation'
        });
    }
    
    /**
     * Get a single aggregator by ID
     * @param {string} id - Aggregator ID
     * @returns {Promise<Object>} - Aggregator record
     */
    static async getById(id) {
        const pb = db.getInstance();
        return await pb.collection('aggregators').getOne(id);
    }
    
    /**
     * Create a new aggregator
     * @param {Object} data - Aggregator data
     * @returns {Promise<Object>} - Created aggregator record
     */
    static async create(data) {
        const pb = db.getInstance();
        return await pb.collection('aggregators').create(data);
    }
    
    /**
     * Update an aggregator
     * @param {string} id - Aggregator ID
     * @param {Object} data - Updated aggregator data
     * @returns {Promise<Object>} - Updated aggregator record
     */
    static async update(id, data) {
        const pb = db.getInstance();
        return await pb.collection('aggregators').update(id, data);
    }
    
    /**
     * Delete an aggregator
     * @param {string} id - Aggregator ID
     * @returns {Promise<boolean>} - Success status
     */
    static async delete(id) {
        const pb = db.getInstance();
        await pb.collection('aggregators').delete(id);
        return true;
    }
    
    /**
     * Update aggregator status
     * @param {string} id - Aggregator ID
     * @param {string} status - New status (available, busy, offline)
     * @returns {Promise<Object>} - Updated aggregator record
     */
    static async updateStatus(id, status) {
        const pb = db.getInstance();
        return await pb.collection('aggregators').update(id, { status });
    }
    
    /**
     * Update aggregator load
     * @param {string} id - Aggregator ID
     * @param {number} loadDelta - Change in load value
     * @returns {Promise<Object>} - Updated aggregator record
     */
    static async updateLoad(id, loadDelta) {
        const pb = db.getInstance();
        const aggregator = await pb.collection('aggregators').getOne(id);
        
        const newLoad = Math.max(0, aggregator.load + loadDelta);
        const newStatus = newLoad >= aggregator.max_load ? 'busy' : 'available';
        
        return await pb.collection('aggregators').update(id, { 
            load: newLoad,
            status: newStatus
        });
    }
    
    /**
     * Get jobs being coordinated by an aggregator
     * @param {string} aggregatorId - Aggregator ID
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @returns {Promise<Object>} - List of jobs
     */
    static async getJobs(aggregatorId, page = 1, perPage = 20) {
        const pb = db.getInstance();
        return await pb.collection('jobs').getList(page, perPage, {
            filter: `aggregator = "${aggregatorId}" && (status = "running" || status = "assigned")`,
            sort: '-created'
        });
    }
    
    /**
     * Update aggregator reputation score
     * @param {string} id - Aggregator ID
     * @param {number} reputationDelta - Change in reputation score
     * @returns {Promise<Object>} - Updated aggregator record
     */
    static async updateReputation(id, reputationDelta) {
        const pb = db.getInstance();
        const aggregator = await pb.collection('aggregators').getOne(id);
        
        const newReputation = Math.max(0, Math.min(100, aggregator.reputation + reputationDelta));
        
        return await pb.collection('aggregators').update(id, { 
            reputation: newReputation 
        });
    }
    
    /**
     * Record aggregator earnings
     * @param {string} aggregatorId - Aggregator ID
     * @param {string} jobId - Job ID
     * @param {number} amount - Earnings amount
     * @param {string} currency - Currency code
     * @returns {Promise<Object>} - Created earnings record
     */
    static async recordEarnings(aggregatorId, jobId, amount, currency = 'USD') {
        const pb = db.getInstance();
        
        const earningsData = {
            aggregator: aggregatorId,
            job: jobId,
            amount,
            currency,
            created: new Date().toISOString()
        };
        
        return await pb.collection('earnings').create(earningsData);
    }
    
    /**
     * Subscribe to changes in aggregator records
     * @param {Function} callback - Callback function for updates
     * @returns {void}
     */
    static async subscribeToChanges(callback) {
        const pb = db.getInstance();
        pb.collection('aggregators').subscribe('*', callback);
    }
    
    /**
     * Unsubscribe from aggregator changes
     * @returns {void}
     */
    static unsubscribe() {
        const pb = db.getInstance();
        pb.collection('aggregators').unsubscribe();
    }
}

module.exports = Aggregator;
