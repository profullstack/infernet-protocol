/**
 * Node routes for Infernet Protocol API
 * Provides endpoints for node discovery and management
 */

import { createLogger } from '../../utils/logger.js';
import db from '../../db/index.js';
import { getActiveProviderCount } from '../../db/utils.js';

const logger = createLogger('api:nodes');

/**
 * Register node routes
 * @param {Hono} app - Hono app instance
 * @param {string} prefix - API prefix
 */
export function registerNodeRoutes(app, prefix = '/api') {
  // Public route for node discovery (no API prefix)
  app.get('/nodes', async (c) => {
    try {
      const pb = db.getInstance();
      
      if (!pb) {
        return c.json({ error: 'Database not initialized' }, 500);
      }
      
      // Get all active providers
      const result = await pb.collection('providers').getList(1, 100, {
        filter: 'status = "active" || status = "available"',
        sort: '-created',
        fields: 'id,created,updated,name,type,status,ip,port,supported_models,reputation_score,jobs_completed'
      });
      
      // Format the response to include only necessary fields
      const nodes = result.items.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        status: node.status,
        ip: node.ip,
        port: node.port,
        supported_models: node.supported_models,
        reputation_score: node.reputation_score,
        jobs_completed: node.jobs_completed,
        created: node.created,
        updated: node.updated
      }));
      
      return c.json(nodes);
    } catch (error) {
      logger.error('Error getting nodes:', error);
      return c.json({ error: 'Failed to get nodes' }, 500);
    }
  });
  
  // API route for node discovery (with API prefix)
  app.get(`${prefix}/nodes`, async (c) => {
    try {
      const pb = db.getInstance();
      
      if (!pb) {
        return c.json({ error: 'Database not initialized' }, 500);
      }
      
      // Get all active providers
      const result = await pb.collection('providers').getList(1, 100, {
        filter: 'status = "active" || status = "available"',
        sort: '-created',
        fields: 'id,created,updated,name,type,status,ip,port,supported_models,reputation_score,jobs_completed'
      });
      
      // Format the response to include only necessary fields
      const nodes = result.items.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        status: node.status,
        ip: node.ip,
        port: node.port,
        supported_models: node.supported_models,
        reputation_score: node.reputation_score,
        jobs_completed: node.jobs_completed,
        created: node.created,
        updated: node.updated
      }));
      
      return c.json(nodes);
    } catch (error) {
      logger.error('Error getting nodes:', error);
      return c.json({ error: 'Failed to get nodes' }, 500);
    }
  });
  
  // Get node stats
  app.get(`${prefix}/nodes/stats`, async (c) => {
    try {
      // Get active provider count
      const activeProviders = await getActiveProviderCount();
      
      return c.json({
        active_providers: activeProviders,
        total_providers: await db.model('provider').getTotalCount(),
        last_updated: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting node stats:', error);
      return c.json({ error: 'Failed to get node stats' }, 500);
    }
  });
  
  // Get a specific node by ID
  app.get(`${prefix}/nodes/:id`, async (c) => {
    try {
      const nodeId = c.req.param('id');
      const pb = db.getInstance();
      
      if (!pb) {
        return c.json({ error: 'Database not initialized' }, 500);
      }
      
      const node = await pb.collection('providers').getOne(nodeId);
      
      // Remove sensitive fields
      delete node.api_key;
      delete node.payment_address;
      
      return c.json(node);
    } catch (error) {
      logger.error(`Error getting node ${c.req.param('id')}:`, error);
      
      if (error.status === 404) {
        return c.json({ error: 'Node not found' }, 404);
      }
      
      return c.json({ error: 'Failed to get node' }, 500);
    }
  });
  
  logger.info('Node routes registered');
}
