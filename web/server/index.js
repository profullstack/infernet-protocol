import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from 'hono/serve-static';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { PocketBase } from 'pocketbase';
import { Server } from 'socket.io';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8080';

// Initialize PocketBase
const pb = new PocketBase(POCKETBASE_URL);

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
    // In a production app, this would fetch from PocketBase
    // For now, return mock data
    const nodes = [
      {
        id: 'node-1',
        name: 'Primary GPU Server',
        status: 'online',
        ip: '192.168.1.101',
        lastSeen: new Date().toISOString(),
        gpus: [
          { name: 'NVIDIA RTX 4090', memory: '24GB', utilization: 92 },
          { name: 'NVIDIA RTX 4090', memory: '24GB', utilization: 78 }
        ],
        cpus: [
          { name: 'AMD Threadripper 5990X', cores: 64, utilization: 72 }
        ],
        jobsCompleted: 156,
        uptime: '12d 5h 32m'
      },
      // More nodes would be here
    ];
    
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
    // In a production app, this would fetch from PocketBase
    // For now, return mock data
    const node = {
      id,
      name: 'Primary GPU Server',
      status: 'online',
      ip: '192.168.1.101',
      lastSeen: new Date().toISOString(),
      gpus: [
        { name: 'NVIDIA RTX 4090', memory: '24GB', utilization: 92 },
        { name: 'NVIDIA RTX 4090', memory: '24GB', utilization: 78 }
      ],
      cpus: [
        { name: 'AMD Threadripper 5990X', cores: 64, utilization: 72 }
      ],
      jobsCompleted: 156,
      uptime: '12d 5h 32m'
    };
    
    return c.json(node);
  } catch (error) {
    console.error(`Error fetching node ${c.req.param('id')}:`, error);
    return c.json({ error: 'Failed to fetch node' }, 500);
  }
});

// Get all jobs
api.get('/jobs', async (c) => {
  try {
    // In a production app, this would fetch from PocketBase
    // For now, return mock data
    const jobs = [
      { id: 'job1', model: 'Stable Diffusion XL', status: 'Completed', runtime: '2m 34s', node: 'Node-01' },
      { id: 'job2', model: 'Llama 3 70B', status: 'Running', runtime: '15m 12s', node: 'Node-03' },
      { id: 'job3', model: 'Mistral 7B', status: 'Queued', runtime: '-', node: 'Pending' },
      { id: 'job4', model: 'CLIP', status: 'Completed', runtime: '1m 05s', node: 'Node-02' }
    ];
    
    return c.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return c.json({ error: 'Failed to fetch jobs' }, 500);
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
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send initial stats
  socket.emit('stats', {
    activeNodes: 12,
    totalJobs: 248,
    gpuUtilization: 78,
    cpuUtilization: 65
  });
  
  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Using PocketBase at ${POCKETBASE_URL}`);
});
