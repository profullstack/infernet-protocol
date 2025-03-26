/**
 * Job API Routes for Infernet Protocol
 * Using Hono as the web framework
 */

import { Hono } from 'hono';
import db from '../../db/index.js';
import { Job } from '../../db/models/index.js';
import { createLogger } from '../../utils/logger.js';
import config from '../../config.js';

const logger = createLogger('api:job');
const app = new Hono();

/**
 * @route GET /api/job
 * @description Get a list of jobs
 */
app.get('/', async (c) => {
    try {
        const { page = '1', perPage = '20', filter = '', status = null } = c.req.query();
        
        const jobs = await Job.list(
            parseInt(page), 
            parseInt(perPage), 
            filter,
            status
        );
        
        return c.json(jobs);
    } catch (error) {
        logger.error('Failed to get jobs:', error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route GET /api/job/:id
 * @description Get a job by ID
 */
app.get('/:id', async (c) => {
    try {
        const jobId = c.req.param('id');
        const job = await Job.getById(jobId);
        
        if (!job) {
            return c.json({ error: 'Job not found' }, 404);
        }
        
        return c.json(job);
    } catch (error) {
        const jobId = c.req.param('id');
        logger.error(`Failed to get job ${jobId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route POST /api/job
 * @description Submit a new job
 */
app.post('/', async (c) => {
    try {
        const jobData = await c.req.json();
        
        // Validate required fields
        if (!jobData.client) {
            return c.json({ error: 'Client ID is required' }, 400);
        }
        
        if (!jobData.model) {
            return c.json({ error: 'Model name is required' }, 400);
        }
        
        if (!jobData.payment_offer && jobData.payment_offer !== 0) {
            return c.json({ error: 'Payment offer is required' }, 400);
        }
        
        // Create job
        const job = await Job.create({
            title: jobData.title || `Job-${Date.now()}`,
            type: jobData.type || 'inference',
            client: jobData.client,
            model: jobData.model,
            input_data: jobData.input_data,
            status: 'pending',
            payment_offer: jobData.payment_offer,
            deadline: jobData.deadline,
            is_multi_node: jobData.is_multi_node || false,
            gpu_requirements: jobData.gpu_requirements || {},
            created: new Date().toISOString()
        });
        
        logger.info(`Job ${job.id} submitted`);
        
        // If it's a multi-node job, assign an aggregator
        if (jobData.is_multi_node) {
            await Job.assignAggregator(job.id);
        } else {
            // For single-node jobs, find a suitable provider directly
            await Job.assignProvider(job.id, jobData.gpu_requirements || {});
        }
        
        return c.json(job, 201);
    } catch (error) {
        logger.error('Failed to submit job:', error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route PUT /api/job/:id/status
 * @description Update job status
 */
app.put('/:id/status', async (c) => {
    try {
        const jobId = c.req.param('id');
        const { status } = await c.req.json();
        
        if (!status) {
            return c.json({ error: 'Status is required' }, 400);
        }
        
        // Check if job exists
        const existingJob = await Job.getById(jobId);
        
        if (!existingJob) {
            return c.json({ error: 'Job not found' }, 404);
        }
        
        // Update job status
        const updatedJob = await Job.updateStatus(jobId, status);
        
        logger.info(`Job ${jobId} status updated to ${status}`);
        return c.json(updatedJob);
    } catch (error) {
        const jobId = c.req.param('id');
        logger.error(`Failed to update job ${jobId} status:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route PUT /api/job/:id/assign
 * @description Assign a job to a provider
 */
app.put('/:id/assign', async (c) => {
    try {
        const jobId = c.req.param('id');
        const { provider_id } = await c.req.json();
        
        if (!provider_id) {
            return c.json({ error: 'Provider ID is required' }, 400);
        }
        
        // Check if job exists
        const existingJob = await Job.getById(jobId);
        
        if (!existingJob) {
            return c.json({ error: 'Job not found' }, 404);
        }
        
        // Assign job to provider
        const updatedJob = await Job.assignToProvider(jobId, provider_id);
        
        logger.info(`Job ${jobId} assigned to provider ${provider_id}`);
        return c.json(updatedJob);
    } catch (error) {
        const jobId = c.req.param('id');
        logger.error(`Failed to assign job ${jobId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route POST /api/job/:id/result
 * @description Record job result
 */
app.post('/:id/result', async (c) => {
    try {
        const jobId = c.req.param('id');
        const resultData = await c.req.json();
        
        // Check if job exists
        const existingJob = await Job.getById(jobId);
        
        if (!existingJob) {
            return c.json({ error: 'Job not found' }, 404);
        }
        
        // Record job result
        const updatedJob = await Job.recordResult(jobId, resultData);
        
        logger.info(`Job ${jobId} result recorded`);
        return c.json(updatedJob);
    } catch (error) {
        const jobId = c.req.param('id');
        logger.error(`Failed to record result for job ${jobId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route DELETE /api/job/:id
 * @description Cancel a job
 */
app.delete('/:id', async (c) => {
    try {
        const jobId = c.req.param('id');
        
        // Check if job exists
        const existingJob = await Job.getById(jobId);
        
        if (!existingJob) {
            return c.json({ error: 'Job not found' }, 404);
        }
        
        // Cancel job
        await Job.cancel(jobId);
        
        logger.info(`Job ${jobId} cancelled`);
        return c.body(null, 204);
    } catch (error) {
        const jobId = c.req.param('id');
        logger.error(`Failed to cancel job ${jobId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

export default app;
