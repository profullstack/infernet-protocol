/**
 * Infernet Protocol - Main Application
 * Demonstrates the use of the Supabase-backed database layer.
 */

import db from './db/index.js';
import config from './config.js';

/**
 * Initialize the application
 */
async function init() {
    try {
        console.log('Initializing Infernet Protocol application...');

        await db.connect(config.supabase.url);

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
        const Provider = db.model('provider');
        const provider = await Provider.register({
            name: providerData.name || `Provider-${Date.now()}`,
            gpu_model: providerData.gpuModel,
            price: providerData.price || 0
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
        const Job = db.model('job');
        const job = await Job.create({
            title: jobData.title || `Job-${Date.now()}`,
            status: 'pending',
            payment_offer: jobData.paymentOffer,
            model_name: jobData.model,
            client_name: jobData.clientName
        });

        console.log('Job submitted:', job);

        if (jobData.isMultiNode) {
            await assignAggregator(job.id);
        } else {
            await assignProvider(job.id);
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
        const Aggregator = db.model('aggregator');
        const Job = db.model('job');

        const aggregators = await Aggregator.findAvailable();
        if (aggregators.length === 0) {
            throw new Error('No aggregators available');
        }

        const aggregator = aggregators[0];
        const updatedJob = await Job.assignToAggregator(jobId, aggregator.id);
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
 * @returns {Promise<Object>} - Updated job record
 */
async function assignProvider(jobId) {
    try {
        const Provider = db.model('provider');
        const Job = db.model('job');

        const providers = await Provider.findAvailable();
        if (providers.length === 0) {
            throw new Error('No suitable providers available');
        }

        const provider = providers[0];
        const updatedJob = await Job.assignToProvider(jobId, provider.id);
        await Provider.updateStatus(provider.id, 'busy');

        console.log(`Job ${jobId} assigned to provider ${provider.id}`);
        return updatedJob;
    } catch (error) {
        console.error(`Failed to assign provider for job ${jobId}:`, error);
        throw error;
    }
}

/**
 * Example: Cleanup and shutdown
 */
async function shutdown() {
    try {
        console.log('Shutting down application...');
        await db.disconnect();
        console.log('Application shutdown complete');
    } catch (error) {
        console.error('Error during shutdown:', error);
    }
}

export {
    init,
    registerProvider,
    submitJob,
    assignAggregator,
    assignProvider,
    shutdown
};
