import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from 'hono/serve-static';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Server } from 'socket.io';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8080';

// Initialize PocketBase
db.initialize(POCKETBASE_URL);

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('/api/*', cors());

// API Routes
const api = new Hono();

// Get all nodes
api.get('/nodes', async (c) => {
  try {
    const nodes = await db.getAllNodes();
    return c.json(nodes);
  } catch (error) {
    console.error('Error fetching nodes:', error);
    return c.json({ error: 'Failed to fetch nodes' }, 500);
  }
});

// Get node by ID
api.get('/nodes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const node = await db.getNodeById(id);
    return c.json(node);
  } catch (error) {
    console.error(`Error fetching node ${c.req.param('id')}:`, error);
    return c.json({ error: 'Failed to fetch node' }, 500);
  }
});

// Get all jobs
api.get('/jobs', async (c) => {
  try {
    const { status, model, node, client } = c.req.query();
    const options = { status, model, node, client };
    const jobs = await db.getAllJobs(options);
    return c.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return c.json({ error: 'Failed to fetch jobs' }, 500);
  }
});

// Get job by ID
api.get('/jobs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const job = await db.getInstance().collection('jobs').getOne(id, {
      expand: 'node,client'
    });
    
    return c.json({
      id: job.id,
      model: job.model,
      status: job.status,
      runtime: job.runtime || '-',
      node: job.expand?.node?.name || job.node || 'Pending',
      startTime: job.startTime,
      endTime: job.endTime,
      inputTokens: job.inputTokens,
      outputTokens: job.outputTokens,
      cost: job.cost,
      client: job.expand?.client?.name || job.client,
      prompt: job.prompt,
      result: job.result
    });
  } catch (error) {
    console.error(`Error fetching job ${c.req.param('id')}:`, error);
    return c.json({ error: 'Failed to fetch job' }, 500);
  }
});

// Get dashboard stats
api.get('/stats', async (c) => {
  try {
    const stats = await db.getDashboardStats();
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// Get GPU stats
api.get('/gpu-stats', async (c) => {
  try {
    const gpuStats = await db.getGpuStats();
    return c.json(gpuStats);
  } catch (error) {
    console.error('Error fetching GPU stats:', error);
    return c.json({ error: 'Failed to fetch GPU stats' }, 500);
  }
});

// Get CPU stats
api.get('/cpu-stats', async (c) => {
  try {
    const cpuStats = await db.getCpuStats();
    return c.json(cpuStats);
  } catch (error) {
    console.error('Error fetching CPU stats:', error);
    return c.json({ error: 'Failed to fetch CPU stats' }, 500);
  }
});

// Get all models
api.get('/models', async (c) => {
  try {
    const records = await db.getInstance().collection('models').getFullList({
      sort: 'name'
    });
    return c.json(records);
  } catch (error) {
    console.error('Error fetching models:', error);
    return c.json({ error: 'Failed to fetch models' }, 500);
  }
});

// Mount API routes
app.route('/api', api);

// Serve static files from the build directory
app.use('/*', serveStatic({ root: path.join(__dirname, '../build') }));

// Fallback route for SPA
app.get('*', (c) => {
  return c.redirect('/');
});

// Create HTTP server
const server = http.createServer({
  port: PORT
}, app.fetch);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Socket.IO event handlers
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);
  
  try {
    // Send initial stats from PocketBase
    const stats = await db.getDashboardStats();
    socket.emit('stats', stats);
    
    // Set up interval to send updated stats every 10 seconds
    const statsInterval = setInterval(async () => {
      try {
        const updatedStats = await db.getDashboardStats();
        socket.emit('stats', updatedStats);
      } catch (error) {
        console.error('Error sending stats update:', error);
      }
    }, 10000);
    
    // Handle client disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      clearInterval(statsInterval);
    });
  } catch (error) {
    console.error('Error setting up socket connection:', error);
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Using PocketBase at ${POCKETBASE_URL}`);
});
