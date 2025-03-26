/**
 * Provider API Routes for Infernet Protocol
 * Using Hono as the web framework
 */

import { Hono } from 'hono';
import db from '../../db/index.js';
import { Provider } from '../../db/models/index.js';
import { createLogger } from '../../utils/logger.js';
import config from '../../config.js';

const logger = createLogger('api:provider');
const app = new Hono();

/**
 * @route GET /api/provider
 * @description Get a list of providers
 */
app.get('/', async (c) => {
    try {
        const { page = '1', perPage = '20', filter = '' } = c.req.query();
        
        const providers = await Provider.list(
            parseInt(page), 
            parseInt(perPage), 
            filter
        );
        
        return c.json(providers);
    } catch (error) {
        logger.error('Failed to get providers:', error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route GET /api/provider/:id
 * @description Get a provider by ID
 */
app.get('/:id', async (c) => {
    try {
        const providerId = c.req.param('id');
        const provider = await Provider.getById(providerId);
        
        if (!provider) {
            return c.json({ error: 'Provider not found' }, 404);
        }
        
        return c.json(provider);
    } catch (error) {
        const providerId = c.req.param('id');
        logger.error(`Failed to get provider ${providerId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route POST /api/provider
 * @description Register a new provider
 */
app.post('/', async (c) => {
    try {
        const providerData = await c.req.json();
        
        // Validate required fields
        if (!providerData.name) {
            return c.json({ error: 'Provider name is required' }, 400);
        }
        
        // Create provider
        const provider = await Provider.create({
            name: providerData.name,
            status: providerData.status || 'available',
            gpu_model: providerData.gpu_model,
            vram: providerData.vram || 0,
            cuda_cores: providerData.cuda_cores || 0,
            bandwidth: providerData.bandwidth || 0,
            price: providerData.price || 0,
            reputation: providerData.reputation || 50, // Default starting reputation
            public_key: providerData.public_key,
            endpoint: providerData.endpoint,
            created: new Date().toISOString()
        });
        
        logger.info(`Provider ${provider.id} registered`);
        return c.json(provider, 201);
    } catch (error) {
        logger.error('Failed to register provider:', error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route PUT /api/provider/:id
 * @description Update a provider
 */
app.put('/:id', async (c) => {
    try {
        const providerId = c.req.param('id');
        const providerData = await c.req.json();
        
        // Check if provider exists
        const existingProvider = await Provider.getById(providerId);
        
        if (!existingProvider) {
            return c.json({ error: 'Provider not found' }, 404);
        }
        
        // Update provider
        const updatedProvider = await Provider.update(providerId, providerData);
        
        logger.info(`Provider ${providerId} updated`);
        return c.json(updatedProvider);
    } catch (error) {
        const providerId = c.req.param('id');
        logger.error(`Failed to update provider ${providerId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route PUT /api/provider/:id/status
 * @description Update provider status
 */
app.put('/:id/status', async (c) => {
    try {
        const providerId = c.req.param('id');
        const { status } = await c.req.json();
        
        if (!status) {
            return c.json({ error: 'Status is required' }, 400);
        }
        
        // Check if provider exists
        const existingProvider = await Provider.getById(providerId);
        
        if (!existingProvider) {
            return c.json({ error: 'Provider not found' }, 404);
        }
        
        // Update provider status
        const updatedProvider = await Provider.updateStatus(providerId, status);
        
        logger.info(`Provider ${providerId} status updated to ${status}`);
        return c.json(updatedProvider);
    } catch (error) {
        const providerId = c.req.param('id');
        logger.error(`Failed to update provider ${providerId} status:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route GET /api/provider/:id/jobs
 * @description Get jobs assigned to a provider
 */
app.get('/:id/jobs', async (c) => {
    try {
        const providerId = c.req.param('id');
        const { page = '1', perPage = '20', status = null } = c.req.query();
        
        // Check if provider exists
        const existingProvider = await Provider.getById(providerId);
        
        if (!existingProvider) {
            return c.json({ error: 'Provider not found' }, 404);
        }
        
        // Get jobs assigned to provider
        const jobs = await Provider.getJobs(
            providerId, 
            parseInt(page), 
            parseInt(perPage), 
            status
        );
        
        return c.json(jobs);
    } catch (error) {
        const providerId = c.req.param('id');
        logger.error(`Failed to get jobs for provider ${providerId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route DELETE /api/provider/:id
 * @description Delete a provider
 */
app.delete('/:id', async (c) => {
    try {
        const providerId = c.req.param('id');
        
        // Check if provider exists
        const existingProvider = await Provider.getById(providerId);
        
        if (!existingProvider) {
            return c.json({ error: 'Provider not found' }, 404);
        }
        
        // Delete provider
        await Provider.delete(providerId);
        
        logger.info(`Provider ${providerId} deleted`);
        return c.body(null, 204);
    } catch (error) {
        const providerId = c.req.param('id');
        logger.error(`Failed to delete provider ${providerId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

export default app;
