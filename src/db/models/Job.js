/**
 * Job model for Infernet Protocol
 * Represents inference or training jobs submitted by clients
 */
const db = require('../index');

class Job {
    /**
     * Get all jobs with optional filtering
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @param {Object} options - Additional query options
     * @returns {Promise<Object>} - List of jobs
     */
    static async getAll(page = 1, perPage = 50, options = {}) {
        const pb = db.getInstance();
        return await pb.collection('jobs').getList(page, perPage, options);
    }
    
    /**
     * Get jobs by status
     * @param {string} status - Job status (pending, running, completed, failed)
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @returns {Promise<Object>} - List of jobs with the specified status
     */
    static async getByStatus(status, page = 1, perPage = 20) {
        const pb = db.getInstance();
        return await pb.collection('jobs').getList(page, perPage, {
            filter: `status = "${status}"`,
            sort: '-created'
        });
    }
    
    /**
     * Get jobs assigned to a specific provider
     * @param {string} providerId - Provider ID
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @returns {Promise<Object>} - List of jobs assigned to the provider
     */
    static async getByProvider(providerId, page = 1, perPage = 20) {
        const pb = db.getInstance();
        return await pb.collection('jobs').getList(page, perPage, {
            filter: `provider = "${providerId}"`,
            sort: '-created'
        });
    }
    
    /**
     * Get jobs submitted by a specific client
     * @param {string} clientId - Client ID
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @returns {Promise<Object>} - List of jobs submitted by the client
     */
    static async getByClient(clientId, page = 1, perPage = 20) {
        const pb = db.getInstance();
        return await pb.collection('jobs').getList(page, perPage, {
            filter: `client = "${clientId}"`,
            sort: '-created'
        });
    }
    
    /**
     * Get a single job by ID
     * @param {string} id - Job ID
     * @returns {Promise<Object>} - Job record
     */
    static async getById(id) {
        const pb = db.getInstance();
        return await pb.collection('jobs').getOne(id);
    }
    
    /**
     * Create a new job
     * @param {Object} data - Job data
     * @returns {Promise<Object>} - Created job record
     */
    static async create(data) {
        const pb = db.getInstance();
        
        // Set default values if not provided
        const jobData = {
            status: 'pending',
            created: new Date().toISOString(),
            ...data
        };
        
        return await pb.collection('jobs').create(jobData);
    }
    
    /**
     * Update a job
     * @param {string} id - Job ID
     * @param {Object} data - Updated job data
     * @returns {Promise<Object>} - Updated job record
     */
    static async update(id, data) {
        const pb = db.getInstance();
        return await pb.collection('jobs').update(id, data);
    }
    
    /**
     * Delete a job
     * @param {string} id - Job ID
     * @returns {Promise<boolean>} - Success status
     */
    static async delete(id) {
        const pb = db.getInstance();
        await pb.collection('jobs').delete(id);
        return true;
    }
    
    /**
     * Update job status
     * @param {string} id - Job ID
     * @param {string} status - New status (pending, running, completed, failed)
     * @param {Object} additionalData - Additional data to update
     * @returns {Promise<Object>} - Updated job record
     */
    static async updateStatus(id, status, additionalData = {}) {
        const pb = db.getInstance();
        
        const updateData = { 
            status,
            ...additionalData
        };
        
        // Add timestamps based on status
        if (status === 'running') {
            updateData.started = new Date().toISOString();
        } else if (status === 'completed' || status === 'failed') {
            updateData.completed = new Date().toISOString();
        }
        
        return await pb.collection('jobs').update(id, updateData);
    }
    
    /**
     * Assign a job to a provider
     * @param {string} jobId - Job ID
     * @param {string} providerId - Provider ID
     * @returns {Promise<Object>} - Updated job record
     */
    static async assignToProvider(jobId, providerId) {
        const pb = db.getInstance();
        return await pb.collection('jobs').update(jobId, {
            provider: providerId,
            status: 'assigned',
            assigned_at: new Date().toISOString()
        });
    }
    
    /**
     * Record job result
     * @param {string} jobId - Job ID
     * @param {Object} result - Job result data
     * @returns {Promise<Object>} - Updated job record
     */
    static async recordResult(jobId, result) {
        const pb = db.getInstance();
        return await pb.collection('jobs').update(jobId, {
            result,
            status: 'completed',
            completed: new Date().toISOString()
        });
    }
    
    /**
     * Record job failure
     * @param {string} jobId - Job ID
     * @param {string} error - Error message
     * @returns {Promise<Object>} - Updated job record
     */
    static async recordFailure(jobId, error) {
        const pb = db.getInstance();
        return await pb.collection('jobs').update(jobId, {
            error,
            status: 'failed',
            completed: new Date().toISOString()
        });
    }
    
    /**
     * Subscribe to changes in job records
     * @param {Function} callback - Callback function for updates
     * @returns {void}
     */
    static subscribeToChanges(callback) {
        const pb = db.getInstance();
        pb.collection('jobs').subscribe('*', callback);
    }
    
    /**
     * Subscribe to changes in a specific job
     * @param {string} jobId - Job ID
     * @param {Function} callback - Callback function for updates
     * @returns {void}
     */
    static subscribeToJob(jobId, callback) {
        const pb = db.getInstance();
        pb.collection('jobs').subscribe(jobId, callback);
    }
    
    /**
     * Unsubscribe from job changes
     * @returns {void}
     */
    static unsubscribe() {
        const pb = db.getInstance();
        pb.collection('jobs').unsubscribe();
    }
}

module.exports = Job;
