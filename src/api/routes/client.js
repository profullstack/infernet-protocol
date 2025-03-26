/**
 * Client API Routes for Infernet Protocol
 * Using Hono as the web framework
 */

import { Hono } from 'hono';
import db from '../../db/index.js';
import { Client } from '../../db/models/index.js';
import { createLogger } from '../../utils/logger.js';
import config from '../../config.js';

const logger = createLogger('api:client');
const app = new Hono();

/**
 * @route GET /api/client
 * @description Get a list of clients
 */
app.get('/', async (c) => {
    try {
        const { page = '1', perPage = '20', filter = '' } = c.req.query();
        
        const clients = await Client.list(
            parseInt(page), 
            parseInt(perPage), 
            filter
        );
        
        return c.json(clients);
    } catch (error) {
        logger.error('Failed to get clients:', error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route GET /api/client/:id
 * @description Get a client by ID
 */
app.get('/:id', async (c) => {
    try {
        const clientId = c.req.param('id');
        const client = await Client.getById(clientId);
        
        if (!client) {
            return c.json({ error: 'Client not found' }, 404);
        }
        
        return c.json(client);
    } catch (error) {
        const clientId = c.req.param('id');
        logger.error(`Failed to get client ${clientId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route POST /api/client
 * @description Register a new client
 */
app.post('/', async (c) => {
    try {
        const clientData = await c.req.json();
        
        // Validate required fields
        if (!clientData.name) {
            return c.json({ error: 'Client name is required' }, 400);
        }
        
        // Create client
        const client = await Client.create({
            name: clientData.name,
            public_key: clientData.public_key,
            endpoint: clientData.endpoint,
            balance: clientData.balance || 0,
            created: new Date().toISOString()
        });
        
        logger.info(`Client ${client.id} registered`);
        return c.json(client, 201);
    } catch (error) {
        logger.error('Failed to register client:', error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route PUT /api/client/:id
 * @description Update a client
 */
app.put('/:id', async (c) => {
    try {
        const clientId = c.req.param('id');
        const clientData = await c.req.json();
        
        // Check if client exists
        const existingClient = await Client.getById(clientId);
        
        if (!existingClient) {
            return c.json({ error: 'Client not found' }, 404);
        }
        
        // Update client
        const updatedClient = await Client.update(clientId, clientData);
        
        logger.info(`Client ${clientId} updated`);
        return c.json(updatedClient);
    } catch (error) {
        const clientId = c.req.param('id');
        logger.error(`Failed to update client ${clientId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route GET /api/client/:id/jobs
 * @description Get jobs submitted by a client
 */
app.get('/:id/jobs', async (c) => {
    try {
        const clientId = c.req.param('id');
        const { page = '1', perPage = '20', status = null } = c.req.query();
        
        // Check if client exists
        const existingClient = await Client.getById(clientId);
        
        if (!existingClient) {
            return c.json({ error: 'Client not found' }, 404);
        }
        
        // Get jobs submitted by client
        const jobs = await Client.getJobs(
            clientId, 
            parseInt(page), 
            parseInt(perPage), 
            status
        );
        
        return c.json(jobs);
    } catch (error) {
        const clientId = c.req.param('id');
        logger.error(`Failed to get jobs for client ${clientId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route POST /api/client/:id/deposit
 * @description Add funds to client balance
 */
app.post('/:id/deposit', async (c) => {
    try {
        const clientId = c.req.param('id');
        const { amount } = await c.req.json();
        
        if (!amount || isNaN(amount) || amount <= 0) {
            return c.json({ error: 'Valid amount is required' }, 400);
        }
        
        // Check if client exists
        const existingClient = await Client.getById(clientId);
        
        if (!existingClient) {
            return c.json({ error: 'Client not found' }, 404);
        }
        
        // Add funds to client balance
        const updatedClient = await Client.addFunds(clientId, amount);
        
        logger.info(`Added ${amount} to client ${clientId} balance`);
        return c.json(updatedClient);
    } catch (error) {
        const clientId = c.req.param('id');
        logger.error(`Failed to add funds to client ${clientId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

/**
 * @route DELETE /api/client/:id
 * @description Delete a client
 */
app.delete('/:id', async (c) => {
    try {
        const clientId = c.req.param('id');
        
        // Check if client exists
        const existingClient = await Client.getById(clientId);
        
        if (!existingClient) {
            return c.json({ error: 'Client not found' }, 404);
        }
        
        // Delete client
        await Client.delete(clientId);
        
        logger.info(`Client ${clientId} deleted`);
        return c.body(null, 204);
    } catch (error) {
        const clientId = c.req.param('id');
        logger.error(`Failed to delete client ${clientId}:`, error);
        return c.json({ error: error.message }, 500);
    }
});

export default app;
