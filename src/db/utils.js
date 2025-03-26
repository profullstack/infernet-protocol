/**
 * Database utility functions for Infernet Protocol
 */
const db = require('./index');

/**
 * Initialize the database schema
 * This function creates collections and sets up relationships
 * @returns {Promise<void>}
 */
async function initializeSchema() {
    const pb = db.getInstance();
    
    try {
        // Note: In a real implementation, you would use PocketBase Admin APIs
        // to create collections and fields. This is a simplified example.
        console.log('Initializing database schema...');
        
        // Check if admin auth is available
        if (pb.authStore && typeof pb.admins !== 'undefined') {
            // Admin operations would go here
            console.log('Admin API available for schema creation');
        } else {
            console.log('Admin API not available, schema creation skipped');
        }
        
        console.log('Schema initialization completed');
    } catch (error) {
        console.error('Error initializing schema:', error);
        throw error;
    }
}

/**
 * Backup the database
 * @param {string} backupPath - Path to save the backup
 * @returns {Promise<string>} - Path to the backup file
 */
async function backupDatabase(backupPath) {
    // This would typically use PocketBase's backup functionality
    // or manually export collections
    console.log(`Database backup requested to: ${backupPath}`);
    return backupPath;
}

/**
 * Perform database health check
 * @returns {Promise<Object>} - Health status
 */
async function healthCheck() {
    const pb = db.getInstance();
    
    try {
        const health = await pb.health.check();
        return {
            status: 'healthy',
            details: health,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Get database statistics
 * @returns {Promise<Object>} - Database statistics
 */
async function getStats() {
    const pb = db.getInstance();
    
    try {
        // In a real implementation, you would use PocketBase Admin APIs
        // to get collection statistics
        
        // This is a mock implementation
        return {
            providers: {
                count: await getCollectionCount('providers'),
                active: await getActiveProviderCount()
            },
            clients: {
                count: await getCollectionCount('clients')
            },
            aggregators: {
                count: await getCollectionCount('aggregators'),
                active: await getActiveAggregatorCount()
            },
            jobs: {
                count: await getCollectionCount('jobs'),
                pending: await getJobCountByStatus('pending'),
                running: await getJobCountByStatus('running'),
                completed: await getJobCountByStatus('completed'),
                failed: await getJobCountByStatus('failed')
            },
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error getting database stats:', error);
        throw error;
    }
}

/**
 * Get count of records in a collection
 * @param {string} collectionName - Collection name
 * @returns {Promise<number>} - Record count
 */
async function getCollectionCount(collectionName) {
    const pb = db.getInstance();
    
    try {
        const result = await pb.collection(collectionName).getList(1, 1, {
            filter: ''
        });
        return result.totalItems;
    } catch (error) {
        console.error(`Error getting count for ${collectionName}:`, error);
        return 0;
    }
}

/**
 * Get count of active providers
 * @returns {Promise<number>} - Active provider count
 */
async function getActiveProviderCount() {
    const pb = db.getInstance();
    
    try {
        const result = await pb.collection('providers').getList(1, 1, {
            filter: 'status = "available"'
        });
        return result.totalItems;
    } catch (error) {
        console.error('Error getting active provider count:', error);
        return 0;
    }
}

/**
 * Get count of active aggregators
 * @returns {Promise<number>} - Active aggregator count
 */
async function getActiveAggregatorCount() {
    const pb = db.getInstance();
    
    try {
        const result = await pb.collection('aggregators').getList(1, 1, {
            filter: 'status = "available"'
        });
        return result.totalItems;
    } catch (error) {
        console.error('Error getting active aggregator count:', error);
        return 0;
    }
}

/**
 * Get count of jobs by status
 * @param {string} status - Job status
 * @returns {Promise<number>} - Job count
 */
async function getJobCountByStatus(status) {
    const pb = db.getInstance();
    
    try {
        const result = await pb.collection('jobs').getList(1, 1, {
            filter: `status = "${status}"` 
        });
        return result.totalItems;
    } catch (error) {
        console.error(`Error getting ${status} job count:`, error);
        return 0;
    }
}

module.exports = {
    initializeSchema,
    backupDatabase,
    healthCheck,
    getStats
};
