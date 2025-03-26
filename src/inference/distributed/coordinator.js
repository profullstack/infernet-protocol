/**
 * Distributed Inference Coordinator
 * 
 * This module implements the coordinator for distributed inference across multiple worker nodes.
 * It manages the distribution of model parts and inference tasks using WebSockets.
 */

import WebSocket from 'ws';
import { MessageTypes, createMessage, parseMessage, DistributionStrategies } from './protocol.js';

export class InferenceCoordinator {
  /**
   * Create a new inference coordinator
   * 
   * @param {Object} pb - PocketBase instance
   * @param {Object} config - Configuration options
   */
  constructor(pb, config = {}) {
    this.pb = pb;
    this.config = {
      port: 3001,
      heartbeatInterval: 30000, // 30 seconds
      jobTimeout: 300000, // 5 minutes
      ...config
    };
    this.workers = new Map(); // Map of worker connections
    this.jobs = new Map(); // Map of active jobs
    this.server = null;
    this.heartbeatInterval = null;
  }
  
  /**
   * Start the coordinator server
   * 
   * @param {number} port - Port to listen on (overrides config)
   * @returns {InferenceCoordinator} - This instance for chaining
   */
  async start(port = null) {
    const listenPort = port || this.config.port;
    
    // Create WebSocket server
    this.server = new WebSocket.Server({ port: listenPort });
    
    this.server.on('connection', (ws) => {
      console.log('Worker connected');
      
      // Generate temporary ID until worker identifies itself
      const tempId = `worker_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      ws.id = tempId;
      
      ws.on('message', async (message) => {
        try {
          const msg = parseMessage(message);
          if (msg) {
            await this.handleWorkerMessage(ws, msg);
          }
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });
      
      ws.on('close', () => {
        this.handleWorkerDisconnect(ws);
      });
      
      ws.on('error', (error) => {
        console.error(`Worker ${ws.id} error:`, error);
      });
    });
    
    // Start heartbeat interval
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
    
    console.log(`Coordinator started on port ${listenPort}`);
    return this;
  }
  
  /**
   * Stop the coordinator server
   */
  async stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.server) {
      // Close all connections
      for (const [id, worker] of this.workers.entries()) {
        try {
          worker.ws.close();
        } catch (error) {
          console.error(`Error closing worker ${id}:`, error);
        }
      }
      
      // Close the server
      return new Promise((resolve, reject) => {
        this.server.close((err) => {
          if (err) {
            console.error('Error closing server:', err);
            reject(err);
          } else {
            console.log('Coordinator stopped');
            this.server = null;
            resolve();
          }
        });
      });
    }
  }
  
  /**
   * Handle messages from workers
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Parsed message
   */
  async handleWorkerMessage(ws, message) {
    switch (message.type) {
      case MessageTypes.WORKER_READY:
        await this.registerWorker(ws, message.data);
        break;
        
      case MessageTypes.LAYER_RESULT:
        await this.processLayerResult(message.data, message.jobId);
        break;
        
      case MessageTypes.WORKER_STATUS:
        await this.updateWorkerStatus(ws.id, message.data);
        break;
        
      case MessageTypes.WORKER_ERROR:
        await this.handleWorkerError(ws.id, message.data, message.jobId);
        break;
        
      case MessageTypes.HEARTBEAT:
        // Update last seen timestamp
        if (this.workers.has(ws.id)) {
          this.workers.get(ws.id).lastSeen = Date.now();
        }
        break;
        
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }
  
  /**
   * Register a worker with the coordinator
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} data - Worker information
   */
  async registerWorker(ws, data) {
    const { nodeId, capabilities } = data;
    
    try {
      // Verify the node exists in PocketBase
      const node = await this.pb.collection('nodes').getOne(nodeId);
      
      // Update the worker ID
      ws.id = nodeId;
      
      // Store worker information
      this.workers.set(nodeId, {
        ws,
        capabilities,
        status: 'ready',
        lastSeen: Date.now(),
        activeJobs: new Set()
      });
      
      console.log(`Worker ${nodeId} registered with capabilities:`, capabilities);
      
      // Update node_roles in PocketBase
      try {
        // Check if role record exists
        const roleRecords = await this.pb.collection('node_roles').getFullList({
          filter: `node="${nodeId}"`
        });
        
        if (roleRecords.length > 0) {
          // Update existing record
          await this.pb.collection('node_roles').update(roleRecords[0].id, {
            role: 'worker',
            worker_address: data.address || '',
            available_memory: capabilities.memory || 0,
            max_batch_size: capabilities.maxBatchSize || 1
          });
        } else {
          // Create new record
          await this.pb.collection('node_roles').create({
            node: nodeId,
            role: 'worker',
            worker_address: data.address || '',
            available_memory: capabilities.memory || 0,
            max_batch_size: capabilities.maxBatchSize || 1
          });
        }
      } catch (error) {
        console.error('Error updating node_roles:', error);
      }
      
      // Send acknowledgment
      this.sendToWorker(nodeId, createMessage(
        MessageTypes.CONFIG_UPDATE,
        { status: 'registered', coordinatorId: this.config.nodeId },
        null
      ));
    } catch (error) {
      console.error('Error registering worker:', error);
      
      // Send error response
      ws.send(JSON.stringify(createMessage(
        MessageTypes.WORKER_ERROR,
        { error: 'Registration failed', message: error.message },
        null
      )));
    }
  }
  
  /**
   * Handle worker disconnection
   * 
   * @param {WebSocket} ws - WebSocket connection
   */
  handleWorkerDisconnect(ws) {
    const workerId = ws.id;
    console.log(`Worker ${workerId} disconnected`);
    
    if (this.workers.has(workerId)) {
      const worker = this.workers.get(workerId);
      
      // Handle any active jobs
      for (const jobId of worker.activeJobs) {
        if (this.jobs.has(jobId)) {
          const job = this.jobs.get(jobId);
          job.workerFailures.push(workerId);
          
          // Try to reassign the job if possible
          this.handleJobFailure(jobId, workerId, 'Worker disconnected');
        }
      }
      
      // Remove the worker
      this.workers.delete(workerId);
    }
  }
  
  /**
   * Send a message to a specific worker
   * 
   * @param {string} workerId - ID of the worker
   * @param {Object} message - Message to send
   * @returns {boolean} - True if sent, false otherwise
   */
  sendToWorker(workerId, message) {
    if (this.workers.has(workerId)) {
      const worker = this.workers.get(workerId);
      
      if (worker.ws.readyState === WebSocket.OPEN) {
        worker.ws.send(JSON.stringify(message));
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Send heartbeat to all workers
   */
  sendHeartbeat() {
    const now = Date.now();
    const heartbeatMessage = createMessage(MessageTypes.HEARTBEAT, { timestamp: now }, null);
    
    for (const [id, worker] of this.workers.entries()) {
      // Check if worker has timed out
      if (now - worker.lastSeen > this.config.heartbeatInterval * 2) {
        console.warn(`Worker ${id} timed out, closing connection`);
        worker.ws.close();
        this.workers.delete(id);
        continue;
      }
      
      // Send heartbeat
      if (worker.ws.readyState === WebSocket.OPEN) {
        worker.ws.send(JSON.stringify(heartbeatMessage));
      }
    }
  }
  
  /**
   * Start a distributed inference job
   * 
   * @param {string} jobId - ID of the job in PocketBase
   * @param {Object} jobConfig - Job configuration
   * @returns {Promise<Object>} - Job status
   */
  async startJob(jobId, jobConfig) {
    try {
      // Get job details from PocketBase
      const job = await this.pb.collection('jobs').getOne(jobId);
      
      // Select available workers based on capabilities
      const availableWorkers = this.selectWorkersForJob(jobConfig);
      
      if (availableWorkers.length === 0) {
        throw new Error('No suitable workers available for this job');
      }
      
      // Create distributed job record
      const distributedJob = await this.pb.collection('distributed_jobs').create({
        job: jobId,
        coordinator: this.config.nodeId,
        workers: availableWorkers.map(w => w.id),
        distribution_strategy: jobConfig.strategy || DistributionStrategies.TENSOR_PARALLEL,
        status: 'pending'
      });
      
      // Initialize job tracking
      this.jobs.set(jobId, {
        config: jobConfig,
        workers: availableWorkers.map(w => w.id),
        strategy: jobConfig.strategy || DistributionStrategies.TENSOR_PARALLEL,
        status: 'initializing',
        results: {},
        startTime: Date.now(),
        timeout: setTimeout(() => this.handleJobTimeout(jobId), this.config.jobTimeout),
        workerFailures: []
      });
      
      // Initialize workers based on strategy
      switch (jobConfig.strategy) {
        case DistributionStrategies.TENSOR_PARALLEL:
          await this.initializeTensorParallelism(jobId, jobConfig, availableWorkers);
          break;
          
        case DistributionStrategies.PIPELINE_PARALLEL:
          await this.initializePipelineParallelism(jobId, jobConfig, availableWorkers);
          break;
          
        case DistributionStrategies.DATA_PARALLEL:
          await this.initializeDataParallelism(jobId, jobConfig, availableWorkers);
          break;
          
        default:
          throw new Error(`Unsupported distribution strategy: ${jobConfig.strategy}`);
      }
      
      // Update job status
      await this.pb.collection('distributed_jobs').update(distributedJob.id, {
        status: 'running'
      });
      
      return { success: true, jobId, distributedJobId: distributedJob.id };
    } catch (error) {
      console.error(`Error starting job ${jobId}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Select workers for a job based on capabilities
   * 
   * @param {Object} jobConfig - Job configuration
   * @returns {Array} - Array of selected workers
   */
  selectWorkersForJob(jobConfig) {
    const availableWorkers = [];
    
    for (const [id, worker] of this.workers.entries()) {
      // Skip workers that are busy with too many jobs
      if (worker.activeJobs.size >= worker.capabilities.maxJobs) {
        continue;
      }
      
      // Check if worker meets job requirements
      if (this.workerMeetsRequirements(worker, jobConfig)) {
        availableWorkers.push({
          id,
          capabilities: worker.capabilities,
          activeJobs: worker.activeJobs.size
        });
      }
    }
    
    // Sort workers by least busy first
    availableWorkers.sort((a, b) => a.activeJobs - b.activeJobs);
    
    // Return the required number of workers
    return availableWorkers.slice(0, jobConfig.numWorkers || 1);
  }
  
  /**
   * Check if a worker meets job requirements
   * 
   * @param {Object} worker - Worker information
   * @param {Object} jobConfig - Job configuration
   * @returns {boolean} - True if worker meets requirements
   */
  workerMeetsRequirements(worker, jobConfig) {
    // Check memory requirements
    if (jobConfig.minMemory && worker.capabilities.memory < jobConfig.minMemory) {
      return false;
    }
    
    // Check GPU requirements
    if (jobConfig.requiresGPU && !worker.capabilities.hasGPU) {
      return false;
    }
    
    // Check model compatibility
    if (jobConfig.modelId && !worker.capabilities.supportedModels.includes(jobConfig.modelId)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Initialize tensor parallelism for a job
   * 
   * @param {string} jobId - Job ID
   * @param {Object} jobConfig - Job configuration
   * @param {Array} workers - Selected workers
   */
  async initializeTensorParallelism(jobId, jobConfig, workers) {
    // Divide model layers among workers
    const numLayers = jobConfig.modelLayers || 32; // Default for many LLMs
    const layersPerWorker = Math.ceil(numLayers / workers.length);
    
    for (let i = 0; i < workers.length; i++) {
      const startLayer = i * layersPerWorker;
      const endLayer = Math.min((i + 1) * layersPerWorker - 1, numLayers - 1);
      
      const workerConfig = {
        modelId: jobConfig.modelId,
        modelPart: `layers_${startLayer}_${endLayer}`,
        startLayer,
        endLayer,
        totalLayers: numLayers,
        workerIndex: i,
        totalWorkers: workers.length
      };
      
      // Send initialization message to worker
      this.sendToWorker(workers[i].id, createMessage(
        MessageTypes.INIT_MODEL,
        workerConfig,
        jobId
      ));
      
      // Mark worker as active for this job
      this.workers.get(workers[i].id).activeJobs.add(jobId);
    }
  }
  
  /**
   * Initialize pipeline parallelism for a job
   * 
   * @param {string} jobId - Job ID
   * @param {Object} jobConfig - Job configuration
   * @param {Array} workers - Selected workers
   */
  async initializePipelineParallelism(jobId, jobConfig, workers) {
    // Assign sequential stages to workers
    for (let i = 0; i < workers.length; i++) {
      const workerConfig = {
        modelId: jobConfig.modelId,
        stage: i,
        totalStages: workers.length,
        nextWorkerId: i < workers.length - 1 ? workers[i + 1].id : null,
        prevWorkerId: i > 0 ? workers[i - 1].id : null
      };
      
      // Send initialization message to worker
      this.sendToWorker(workers[i].id, createMessage(
        MessageTypes.INIT_MODEL,
        workerConfig,
        jobId
      ));
      
      // Mark worker as active for this job
      this.workers.get(workers[i].id).activeJobs.add(jobId);
    }
  }
  
  /**
   * Initialize data parallelism for a job
   * 
   * @param {string} jobId - Job ID
   * @param {Object} jobConfig - Job configuration
   * @param {Array} workers - Selected workers
   */
  async initializeDataParallelism(jobId, jobConfig, workers) {
    // Each worker gets the full model but different data
    for (let i = 0; i < workers.length; i++) {
      const workerConfig = {
        modelId: jobConfig.modelId,
        workerIndex: i,
        totalWorkers: workers.length,
        batchSize: jobConfig.batchSize || 1,
        batchIndex: i
      };
      
      // Send initialization message to worker
      this.sendToWorker(workers[i].id, createMessage(
        MessageTypes.INIT_MODEL,
        workerConfig,
        jobId
      ));
      
      // Mark worker as active for this job
      this.workers.get(workers[i].id).activeJobs.add(jobId);
    }
  }
  
  /**
   * Process input for a job
   * 
   * @param {string} jobId - Job ID
   * @param {Object} input - Input data
   * @returns {Promise<Object>} - Processing status
   */
  async processInput(jobId, input) {
    if (!this.jobs.has(jobId)) {
      return { success: false, error: 'Job not found' };
    }
    
    const job = this.jobs.get(jobId);
    
    try {
      // Process based on strategy
      switch (job.strategy) {
        case DistributionStrategies.TENSOR_PARALLEL:
          // Send to first worker in tensor parallelism
          this.sendToWorker(job.workers[0], createMessage(
            MessageTypes.PROCESS_INPUT,
            { input },
            jobId
          ));
          break;
          
        case DistributionStrategies.PIPELINE_PARALLEL:
          // Send to first worker in pipeline
          this.sendToWorker(job.workers[0], createMessage(
            MessageTypes.PROCESS_INPUT,
            { input },
            jobId
          ));
          break;
          
        case DistributionStrategies.DATA_PARALLEL:
          // In data parallelism, input should already be split
          // Send appropriate batch to each worker
          for (let i = 0; i < job.workers.length; i++) {
            this.sendToWorker(job.workers[i], createMessage(
              MessageTypes.PROCESS_INPUT,
              { input: input[i] || input },
              jobId
            ));
          }
          break;
      }
      
      return { success: true };
    } catch (error) {
      console.error(`Error processing input for job ${jobId}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Process layer result from a worker
   * 
   * @param {Object} data - Result data
   * @param {string} jobId - Job ID
   */
  async processLayerResult(data, jobId) {
    if (!this.jobs.has(jobId)) {
      console.warn(`Received result for unknown job ${jobId}`);
      return;
    }
    
    const job = this.jobs.get(jobId);
    const { workerId, result, isComplete } = data;
    
    // Store the result
    job.results[workerId] = result;
    
    // Check if job is complete
    if (isComplete) {
      await this.finalizeJob(jobId);
    }
  }
  
  /**
   * Finalize a job and collect results
   * 
   * @param {string} jobId - Job ID
   */
  async finalizeJob(jobId) {
    if (!this.jobs.has(jobId)) return;
    
    const job = this.jobs.get(jobId);
    
    try {
      // Combine results based on strategy
      let finalResult;
      
      switch (job.strategy) {
        case DistributionStrategies.TENSOR_PARALLEL:
        case DistributionStrategies.PIPELINE_PARALLEL:
          // For these strategies, the last worker should have the final result
          finalResult = job.results[job.workers[job.workers.length - 1]];
          break;
          
        case DistributionStrategies.DATA_PARALLEL:
          // Combine results from all workers
          finalResult = Object.values(job.results);
          break;
      }
      
      // Update job in PocketBase
      const distributedJobs = await this.pb.collection('distributed_jobs').getFullList({
        filter: `job="${jobId}"`
      });
      
      if (distributedJobs.length > 0) {
        await this.pb.collection('distributed_jobs').update(distributedJobs[0].id, {
          status: 'completed'
        });
      }
      
      // Update job record
      await this.pb.collection('jobs').update(jobId, {
        status: 'completed',
        result: JSON.stringify(finalResult),
        completed_at: new Date().toISOString()
      });
      
      // Clean up job resources
      this.cleanupJob(jobId);
      
      console.log(`Job ${jobId} completed successfully`);
    } catch (error) {
      console.error(`Error finalizing job ${jobId}:`, error);
      
      // Mark job as failed
      try {
        const distributedJobs = await this.pb.collection('distributed_jobs').getFullList({
          filter: `job="${jobId}"`
        });
        
        if (distributedJobs.length > 0) {
          await this.pb.collection('distributed_jobs').update(distributedJobs[0].id, {
            status: 'failed'
          });
        }
        
        await this.pb.collection('jobs').update(jobId, {
          status: 'failed',
          error: error.message
        });
      } catch (updateError) {
        console.error(`Error updating job status for ${jobId}:`, updateError);
      }
      
      // Clean up job resources
      this.cleanupJob(jobId);
    }
  }
  
  /**
   * Handle job timeout
   * 
   * @param {string} jobId - Job ID
   */
  async handleJobTimeout(jobId) {
    if (!this.jobs.has(jobId)) return;
    
    console.warn(`Job ${jobId} timed out`);
    
    try {
      // Update job status in PocketBase
      const distributedJobs = await this.pb.collection('distributed_jobs').getFullList({
        filter: `job="${jobId}"`
      });
      
      if (distributedJobs.length > 0) {
        await this.pb.collection('distributed_jobs').update(distributedJobs[0].id, {
          status: 'failed'
        });
      }
      
      await this.pb.collection('jobs').update(jobId, {
        status: 'failed',
        error: 'Job timed out'
      });
    } catch (error) {
      console.error(`Error updating timeout status for job ${jobId}:`, error);
    }
    
    // Clean up job resources
    this.cleanupJob(jobId);
  }
  
  /**
   * Handle job failure from a worker
   * 
   * @param {string} jobId - Job ID
   * @param {string} workerId - Worker ID that failed
   * @param {string} reason - Failure reason
   */
  async handleJobFailure(jobId, workerId, reason) {
    if (!this.jobs.has(jobId)) return;
    
    const job = this.jobs.get(jobId);
    
    console.warn(`Worker ${workerId} failed for job ${jobId}: ${reason}`);
    
    // If too many workers have failed, fail the job
    if (job.workerFailures.length >= Math.ceil(job.workers.length / 2)) {
      try {
        // Update job status in PocketBase
        const distributedJobs = await this.pb.collection('distributed_jobs').getFullList({
          filter: `job="${jobId}"`
        });
        
        if (distributedJobs.length > 0) {
          await this.pb.collection('distributed_jobs').update(distributedJobs[0].id, {
            status: 'failed'
          });
        }
        
        await this.pb.collection('jobs').update(jobId, {
          status: 'failed',
          error: `Too many worker failures: ${reason}`
        });
      } catch (error) {
        console.error(`Error updating failure status for job ${jobId}:`, error);
      }
      
      // Clean up job resources
      this.cleanupJob(jobId);
    } else {
      // Try to reassign the work if possible
      // This would be a more complex implementation in a production system
      console.log(`Attempting to reassign work for job ${jobId} from failed worker ${workerId}`);
      
      // For now, just continue with remaining workers
      // A more sophisticated implementation would redistribute the workload
    }
  }
  
  /**
   * Clean up resources for a job
   * 
   * @param {string} jobId - Job ID
   */
  cleanupJob(jobId) {
    if (!this.jobs.has(jobId)) return;
    
    const job = this.jobs.get(jobId);
    
    // Clear timeout if exists
    if (job.timeout) {
      clearTimeout(job.timeout);
    }
    
    // Remove job from active jobs for all workers
    for (const workerId of job.workers) {
      if (this.workers.has(workerId)) {
        this.workers.get(workerId).activeJobs.delete(jobId);
      }
    }
    
    // Remove job from tracking
    this.jobs.delete(jobId);
  }
  
  /**
   * Update worker status
   * 
   * @param {string} workerId - Worker ID
   * @param {Object} statusData - Status data
   */
  async updateWorkerStatus(workerId, statusData) {
    if (!this.workers.has(workerId)) return;
    
    const worker = this.workers.get(workerId);
    
    // Update worker status
    worker.status = statusData.status || worker.status;
    worker.lastSeen = Date.now();
    
    // Update capabilities if provided
    if (statusData.capabilities) {
      worker.capabilities = {
        ...worker.capabilities,
        ...statusData.capabilities
      };
    }
    
    // Update in PocketBase if needed
    try {
      const roleRecords = await this.pb.collection('node_roles').getFullList({
        filter: `node="${workerId}"`
      });
      
      if (roleRecords.length > 0) {
        await this.pb.collection('node_roles').update(roleRecords[0].id, {
          available_memory: worker.capabilities.memory || 0,
          max_batch_size: worker.capabilities.maxBatchSize || 1
        });
      }
    } catch (error) {
      console.error(`Error updating worker status in PocketBase for ${workerId}:`, error);
    }
  }
  
  /**
   * Handle worker error
   * 
   * @param {string} workerId - Worker ID
   * @param {Object} errorData - Error data
   * @param {string} jobId - Job ID (optional)
   */
  async handleWorkerError(workerId, errorData, jobId) {
    console.error(`Worker ${workerId} reported error:`, errorData);
    
    // If job ID is provided, handle job failure
    if (jobId && this.jobs.has(jobId)) {
      await this.handleJobFailure(jobId, workerId, errorData.message || 'Worker reported error');
    }
  }
}
