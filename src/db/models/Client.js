/**
 * Client model for Infernet Protocol
 * Represents nodes that submit inference or training jobs
 */
const db = require('../index');

class Client {
    /**
     * Get all clients
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @param {Object} options - Additional query options
     * @returns {Promise<Object>} - List of clients
     */
    static async getAll(page = 1, perPage = 50, options = {}) {
        const pb = db.getInstance();
        return await pb.collection('clients').getList(page, perPage, options);
    }
    
    /**
     * Get a single client by ID
     * @param {string} id - Client ID
     * @returns {Promise<Object>} - Client record
     */
    static async getById(id) {
        const pb = db.getInstance();
        return await pb.collection('clients').getOne(id);
    }
    
    /**
     * Create a new client
     * @param {Object} data - Client data
     * @returns {Promise<Object>} - Created client record
     */
    static async create(data) {
        const pb = db.getInstance();
        return await pb.collection('clients').create(data);
    }
    
    /**
     * Update a client
     * @param {string} id - Client ID
     * @param {Object} data - Updated client data
     * @returns {Promise<Object>} - Updated client record
     */
    static async update(id, data) {
        const pb = db.getInstance();
        return await pb.collection('clients').update(id, data);
    }
    
    /**
     * Delete a client
     * @param {string} id - Client ID
     * @returns {Promise<boolean>} - Success status
     */
    static async delete(id) {
        const pb = db.getInstance();
        await pb.collection('clients').delete(id);
        return true;
    }
    
    /**
     * Get client payment history
     * @param {string} clientId - Client ID
     * @param {number} page - Page number for pagination
     * @param {number} perPage - Items per page
     * @returns {Promise<Object>} - List of payment records
     */
    static async getPaymentHistory(clientId, page = 1, perPage = 20) {
        const pb = db.getInstance();
        return await pb.collection('payments').getList(page, perPage, {
            filter: `client = "${clientId}"`,
            sort: '-created'
        });
    }
    
    /**
     * Update client balance
     * @param {string} id - Client ID
     * @param {number} amount - Amount to add to balance (negative to subtract)
     * @returns {Promise<Object>} - Updated client record
     */
    static async updateBalance(id, amount) {
        const pb = db.getInstance();
        const client = await pb.collection('clients').getOne(id);
        
        const newBalance = (client.balance || 0) + amount;
        
        return await pb.collection('clients').update(id, { 
            balance: newBalance 
        });
    }
    
    /**
     * Record a payment transaction
     * @param {string} clientId - Client ID
     * @param {string} jobId - Job ID
     * @param {number} amount - Payment amount
     * @param {string} currency - Currency code
     * @param {string} paymentMethod - Payment method
     * @returns {Promise<Object>} - Created payment record
     */
    static async recordPayment(clientId, jobId, amount, currency = 'USD', paymentMethod = 'balance') {
        const pb = db.getInstance();
        
        const paymentData = {
            client: clientId,
            job: jobId,
            amount,
            currency,
            payment_method: paymentMethod,
            status: 'completed',
            created: new Date().toISOString()
        };
        
        return await pb.collection('payments').create(paymentData);
    }
    
    /**
     * Subscribe to changes in client records
     * @param {Function} callback - Callback function for updates
     * @returns {void}
     */
    static subscribeToChanges(callback) {
        const pb = db.getInstance();
        pb.collection('clients').subscribe('*', callback);
    }
    
    /**
     * Unsubscribe from client changes
     * @returns {void}
     */
    static unsubscribe() {
        const pb = db.getInstance();
        pb.collection('clients').unsubscribe();
    }
}

module.exports = Client;
