/**
 * Infernet Protocol - Main Application
 * Demonstrates the use of the PocketBase database layer
 */

import db from './db/index.js';
import { Provider, Client, Job, Aggregator } from './db/models/index.js';
import * as dbUtils from './db/utils.js';
import config from './config.js';

/**
 * Initialize the application
 */
async function init() {
    try {
        console.log('Initializing Infernet Protocol application...');
        
        // Connect to PocketBase
        await db.connect(config.pocketbase.url);
        
        // Initialize schema if needed
        // await dbUtils.initializeSchema();
        
        console.log('Application initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize application:', error);
        return false;
    }
}

/**
 * Example: Register a new provider node
 * @param {Object} providerData - Provider data
 * @returns {Promise<Object>} - Created provider record
 */
async function registerProvider(providerData) {
    try {
        const provider = await Provider.create({
            name: providerData.name || `Provider-${Date.now()}`,
            status: 'available',
            gpu_model: providerData.gpuModel,
            vram: providerData.vram || 0,
            cuda_cores: providerData.cudaCores || 0,
            bandwidth: providerData.bandwidth || 0,
            price: providerData.price || 0,
            reputation: 50, // Default starting reputation
            created: new Date().toISOString()
        });
        
        console.log('Provider registered:', provider);
        return provider;
    } catch (error) {
        console.error('Failed to register provider:', error);
        throw error;
    }
}

/**
 * Example: Submit a new inference job
 * @param {Object} jobData - Job data
 * @returns {Promise<Object>} - Created job record
 */
async function submitJob(jobData) {
    try {
        // Create the job record
        const job = await Job.create({
            title: jobData.title || `Job-${Date.now()}`,
            type: jobData.type || 'inference',
            client: jobData.clientId,
            model: jobData.model,
            input_data: jobData.inputData,
            status: 'pending',
            payment_offer: jobData.paymentOffer,
            deadline: jobData.deadline,
            created: new Date().toISOString()
        });
        
        console.log('Job submitted:', job);
        
        // If it's a multi-node job, assign an aggregator
        if (jobData.isMultiNode) {
            await assignAggregator(job.id);
        } else {
            // For single-node jobs, find a suitable provider directly
            await assignProvider(job.id, jobData.gpuRequirements);
        }
        
        return job;
    } catch (error) {
        console.error('Failed to submit job:', error);
        throw error;
    }
}

/**
 * Example: Assign an aggregator to a multi-node job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Updated job record
 */
async function assignAggregator(jobId) {
    try {
        // Find available aggregators
        const aggregatorsResult = await Aggregator.getAvailable(1, 1);
        
        if (aggregatorsResult.items.length === 0) {
            throw new Error('No aggregators available');
        }
        
        const aggregator = aggregatorsResult.items[0];
        
        // Update the job with the assigned aggregator
        const updatedJob = await Job.update(jobId, {
            aggregator: aggregator.id,
            status: 'assigned_to_aggregator'
        });
        
        // Update aggregator load
        await Aggregator.updateLoad(aggregator.id, 1);
        
        console.log(`Job ${jobId} assigned to aggregator ${aggregator.id}`);
        return updatedJob;
    } catch (error) {
        console.error(`Failed to assign aggregator for job ${jobId}:`, error);
        throw error;
    }
}

/**
 * Example: Assign a provider to a single-node job
 * @param {string} jobId - Job ID
 * @param {Object} gpuRequirements - GPU requirements
 * @returns {Promise<Object>} - Updated job record
 */
async function assignProvider(jobId, gpuRequirements = {}) {
    try {
        // Find suitable providers based on GPU requirements
        const providersResult = await Provider.findByGpuSpecs(gpuRequirements, 1, 1);
        
        if (providersResult.items.length === 0) {
            throw new Error('No suitable providers available');
        }
        
        const provider = providersResult.items[0];
        
        // Assign the job to the provider
        const updatedJob = await Job.assignToProvider(jobId, provider.id);
        
        // Update provider status
        await Provider.updateStatus(provider.id, 'busy');
        
        console.log(`Job ${jobId} assigned to provider ${provider.id}`);
        return updatedJob;
    } catch (error) {
        console.error(`Failed to assign provider for job ${jobId}:`, error);
        throw error;
    }
}

/**
 * Example: Process job results
 * @param {string} jobId - Job ID
 * @param {Object} resultData - Result data
 * @returns {Promise<Object>} - Updated job record
 */
async function processJobResults(jobId, resultData) {
    try {
        // Get the job details
        const job = await Job.getById(jobId);
        
        // Record the job result
        const updatedJob = await Job.recordResult(jobId, resultData);
        
        // Update provider status and reputation
        if (job.provider) {
            await Provider.updateStatus(job.provider, 'available');
            await Provider.updateReputation(job.provider, 1); // Increase reputation for successful job
        }
        
        // Process payment
        if (job.client) {
            await Client.recordPayment(job.client, jobId, job.payment_offer);
        }
        
        // If job had an aggregator, update its status and reputation
        if (job.aggregator) {
            await Aggregator.updateLoad(job.aggregator, -1);
            await Aggregator.updateReputation(job.aggregator, 1);
            
            // Record aggregator earnings (typically a percentage of the job payment)
            const aggregatorFee = job.payment_offer * 0.02; // 2% fee
            await Aggregator.recordEarnings(job.aggregator, jobId, aggregatorFee);
        }
        
        console.log(`Job ${jobId} completed successfully`);
        return updatedJob;
    } catch (error) {
        console.error(`Failed to process results for job ${jobId}:`, error);
        throw error;
    }
}

/**
 * Example: Handle job failure
 * @param {string} jobId - Job ID
 * @param {string} errorMessage - Error message
 * @returns {Promise<Object>} - Updated job record
 */
async function handleJobFailure(jobId, errorMessage) {
    try {
        // Get the job details
        const job = await Job.getById(jobId);
        
        // Record the job failure
        const updatedJob = await Job.recordFailure(jobId, errorMessage);
        
        // Update provider status and potentially reputation
        if (job.provider) {
            await Provider.updateStatus(job.provider, 'available');
            
            // Optionally reduce provider reputation for failed job
            // This might depend on the nature of the failure
            // await Provider.updateReputation(job.provider, -1);
        }
        
        // If job had an aggregator, update its status
        if (job.aggregator) {
            await Aggregator.updateLoad(job.aggregator, -1);
        }
        
        console.log(`Job ${jobId} failed: ${errorMessage}`);
        return updatedJob;
    } catch (error) {
        console.error(`Failed to handle failure for job ${jobId}:`, error);
        throw error;
    }
}

/**
 * Example: Get system statistics
 * @returns {Promise<Object>} - System statistics
 */
async function getSystemStats() {
    try {
        // Get database statistics
        const dbStats = await dbUtils.getStats();
        
        // Get database health
        const dbHealth = await dbUtils.healthCheck();
        
        return {
            database: dbStats,
            health: dbHealth,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Failed to get system stats:', error);
        throw error;
    }
}

/**
 * Example: Cleanup and shutdown
 */
async function shutdown() {
    try {
        console.log('Shutting down application...');
        
        // Disconnect from PocketBase
        db.disconnect();
        
        console.log('Application shutdown complete');
    } catch (error) {
        console.error('Error during shutdown:', error);
    }
}

// Export the functions for use in other modules
export {
    init,
    registerProvider,
    submitJob,
    assignAggregator,
    assignProvider,
    processJobResults,
    handleJobFailure,
    getSystemStats,
    shutdown
};

// If this file is run directly, initialize the application
if (require.main === module) {
    init().then(success => {
        if (success) {
            console.log('Infernet Protocol is ready');
            
            // Example usage
            // registerProvider({
            //     name: 'Test Provider',
            //     gpuModel: 'NVIDIA RTX 4090',
            //     vram: 24576, // 24GB in MB
            //     cudaCores: 16384,
            //     bandwidth: 1000,
            //     price: 0.1 // per minute
            // }).catch(console.error);
        } else {
            console.error('Failed to initialize Infernet Protocol');
            process.exit(1);
        }
    });
    
    // Handle process termination
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT. Graceful shutdown...');
        await shutdown();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM. Graceful shutdown...');
        await shutdown();
        process.exit(0);
    });
}
