/**
 * Aggregator API Routes for Infernet Protocol
 * Using Hono as the web framework
 */

import { Hono } from 'hono';
import db from '../../db/index.js';
import { Aggregator } from '../../db/models/index.js';
import { createLogger } from '../../utils/logger.js';
import config from '../../config.js';

const logger = createLogger('api:aggregator');
const app = new Hono();

/**
 * @route GET /api/aggregator
 * @description Get a list of aggregators
 */
app.get('/', async (c) => {
    try {
        const { page = '1', perPage = '20', filter = '' } = c.req.query();
        
        const aggregators = await Aggregator.list(
            parseInt(page), 
            parseInt(perPage), 
            filter
        );
        
        return c.json(aggregators);
    } catch (error) {
        logger.error('Failed to get aggregators:', error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route GET /api/aggregator/:id
 * @description Get an aggregator by ID
 */
app.get('/:id', async (c) => {
    try {
        const aggregatorId = c.req.param('id');
        const aggregator = await Aggregator.getById(aggregatorId);
        
        if (!aggregator) {
            return c.json({ error: 'Aggregator not found' }, 404);
        }
        
        return c.json(aggregator);
    } catch (error) {
        const aggregatorId = c.req.param('id');
        logger.error(`Failed to get aggregator ${aggregatorId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route POST /api/aggregator
 * @description Register a new aggregator
 */
app.post('/', async (c) => {
    try {
        const aggregatorData = await c.req.json();
        
        // Validate required fields
        if (!aggregatorData.name) {
            return c.json({ error: 'Aggregator name is required' }, 400);
        }
        
        // Create aggregator
        const aggregator = await Aggregator.create({
            name: aggregatorData.name,
            status: aggregatorData.status || 'available',
            capacity: aggregatorData.capacity || 10,
            current_load: aggregatorData.current_load || 0,
            reputation: aggregatorData.reputation || 50, // Default starting reputation
            public_key: aggregatorData.public_key,
            endpoint: aggregatorData.endpoint,
            fee_percentage: aggregatorData.fee_percentage || 2, // Default 2% fee
            created: new Date().toISOString()
        });
        
        logger.info(`Aggregator ${aggregator.id} registered`);
        return c.json(aggregator, 201);
    } catch (error) {
        logger.error('Failed to register aggregator:', error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route PUT /api/aggregator/:id
 * @description Update an aggregator
 */
app.put('/:id', async (c) => {
    try {
        const aggregatorId = c.req.param('id');
        const aggregatorData = await c.req.json();
        
        // Check if aggregator exists
        const existingAggregator = await Aggregator.getById(aggregatorId);
        
        if (!existingAggregator) {
            return c.json({ error: 'Aggregator not found' }, 404);
        }
        
        // Update aggregator
        const updatedAggregator = await Aggregator.update(aggregatorId, aggregatorData);
        
        logger.info(`Aggregator ${aggregatorId} updated`);
        return c.json(updatedAggregator);
    } catch (error) {
        const aggregatorId = c.req.param('id');
        logger.error(`Failed to update aggregator ${aggregatorId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route PUT /api/aggregator/:id/status
 * @description Update aggregator status
 */
app.put('/:id/status', async (c) => {
    try {
        const aggregatorId = c.req.param('id');
        const { status } = await c.req.json();
        
        if (!status) {
            return c.json({ error: 'Status is required' }, 400);
        }
        
        // Check if aggregator exists
        const existingAggregator = await Aggregator.getById(aggregatorId);
        
        if (!existingAggregator) {
            return c.json({ error: 'Aggregator not found' }, 404);
        }
        
        // Update aggregator status
        const updatedAggregator = await Aggregator.updateStatus(aggregatorId, status);
        
        logger.info(`Aggregator ${aggregatorId} status updated to ${status}`);
        return c.json(updatedAggregator);
    } catch (error) {
        const aggregatorId = c.req.param('id');
        logger.error(`Failed to update aggregator ${aggregatorId} status:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route PUT /api/aggregator/:id/load
 * @description Update aggregator load
 */
app.put('/:id/load', async (c) => {
    try {
        const aggregatorId = c.req.param('id');
        const { load_change } = await c.req.json();
        
        if (load_change === undefined || isNaN(load_change)) {
            return c.json({ error: 'Load change is required and must be a number' }, 400);
        }
        
        // Check if aggregator exists
        const existingAggregator = await Aggregator.getById(aggregatorId);
        
        if (!existingAggregator) {
            return c.json({ error: 'Aggregator not found' }, 404);
        }
        
        // Update aggregator load
        const updatedAggregator = await Aggregator.updateLoad(aggregatorId, load_change);
        
        logger.info(`Aggregator ${aggregatorId} load updated by ${load_change}`);
        return c.json(updatedAggregator);
    } catch (error) {
        const aggregatorId = c.req.param('id');
        logger.error(`Failed to update aggregator ${aggregatorId} load:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route GET /api/aggregator/:id/jobs
 * @description Get jobs managed by an aggregator
 */
app.get('/:id/jobs', async (c) => {
    try {
        const aggregatorId = c.req.param('id');
        const { page = '1', perPage = '20', status = null } = c.req.query();
        
        // Check if aggregator exists
        const existingAggregator = await Aggregator.getById(aggregatorId);
        
        if (!existingAggregator) {
            return c.json({ error: 'Aggregator not found' }, 404);
        }
        
        // Get jobs managed by aggregator
        const jobs = await Aggregator.getJobs(
            aggregatorId, 
            parseInt(page), 
            parseInt(perPage), 
            status
        );
        
        return c.json(jobs);
    } catch (error) {
        const aggregatorId = c.req.param('id');
        logger.error(`Failed to get jobs for aggregator ${aggregatorId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route DELETE /api/aggregator/:id
 * @description Delete an aggregator
 */
app.delete('/:id', async (c) => {
    try {
        const aggregatorId = c.req.param('id');
        
        // Check if aggregator exists
        const existingAggregator = await Aggregator.getById(aggregatorId);
        
        if (!existingAggregator) {
            return c.json({ error: 'Aggregator not found' }, 404);
        }
        
        // Delete aggregator
        await Aggregator.delete(aggregatorId);
        
        logger.info(`Aggregator ${aggregatorId} deleted`);
        return c.body(null, 204);
    } catch (error) {
        const aggregatorId = c.req.param('id');
        logger.error(`Failed to delete aggregator ${aggregatorId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

export default app;
