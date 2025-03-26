/**
 * Distributed Inference Worker
 * 
 * This module implements the worker for distributed inference tasks.
 * Workers connect to a coordinator and handle specific parts of the model or inference tasks.
 */

import WebSocket from 'ws';
import { MessageTypes, createMessage, parseMessage } from './protocol.js';

export class InferenceWorker {
  /**
   * Create a new inference worker
   * 
   * @param {Object} pb - PocketBase instance
   * @param {Object} config - Configuration options
   */
  constructor(pb, config = {}) {
    this.pb = pb;
    this.config = {
      coordinatorUrl: null,
      reconnectInterval: 5000, // 5 seconds
      heartbeatInterval: 30000, // 30 seconds
      nodeId: null,
      ...config
    };
    this.ws = null;
    this.models = new Map(); // Map of loaded models
    this.activeJobs = new Map(); // Map of active jobs
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;
    this.connected = false;
  }
  
  /**
   * Connect to the coordinator
   * 
   * @returns {Promise<InferenceWorker>} - This instance for chaining
   */
  async connect() {
    if (!this.config.coordinatorUrl) {
      throw new Error('Coordinator URL is required');
    }
    
    if (!this.config.nodeId) {
      throw new Error('Node ID is required');
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.coordinatorUrl);
        
        this.ws.on('open', () => {
          console.log(`Connected to coordinator at ${this.config.coordinatorUrl}`);
          this.connected = true;
          
          // Send worker ready message
          this.sendWorkerReady();
          
          // Start heartbeat interval
          this.startHeartbeat();
          
          resolve(this);
        });
        
        this.ws.on('message', async (message) => {
          try {
            const msg = parseMessage(message);
            if (msg) {
              await this.handleCoordinatorMessage(msg);
            }
          } catch (error) {
            console.error('Error handling message:', error);
          }
        });
        
        this.ws.on('close', () => {
          console.log('Disconnected from coordinator');
          this.connected = false;
          
          // Stop heartbeat
          if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
          }
          
          // Schedule reconnection
          this.scheduleReconnect();
        });
        
        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          
          // Reject only on initial connection
          if (!this.connected) {
            reject(error);
          }
        });
      } catch (error) {
        console.error('Error connecting to coordinator:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Schedule reconnection to coordinator
   */
  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(async () => {
      console.log('Attempting to reconnect to coordinator...');
      try {
        await this.connect();
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, this.config.reconnectInterval);
  }
  
  /**
   * Start heartbeat interval
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      if (this.connected && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(createMessage(
          MessageTypes.HEARTBEAT,
          { timestamp: Date.now() },
          null
        )));
      }
    }, this.config.heartbeatInterval);
  }
  
  /**
   * Send worker ready message to coordinator
   */
  sendWorkerReady() {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;
    
    // Get worker capabilities
    const capabilities = this.getCapabilities();
    
    // Send ready message
    this.ws.send(JSON.stringify(createMessage(
      MessageTypes.WORKER_READY,
      {
        nodeId: this.config.nodeId,
        capabilities,
        address: this.config.workerAddress || ''
      },
      null
    )));
  }
  
  /**
   * Get worker capabilities
   * 
   * @returns {Object} - Worker capabilities
   */
  getCapabilities() {
    // In a real implementation, this would detect hardware capabilities
    // For now, return basic information
    return {
      memory: this.config.memory || 8192, // MB
      hasGPU: this.config.hasGPU || false,
      maxBatchSize: this.config.maxBatchSize || 1,
      maxJobs: this.config.maxJobs || 2,
      supportedModels: this.config.supportedModels || ['llama-7b', 'llama-13b'],
      supportedTasks: this.config.supportedTasks || ['text-generation', 'embeddings']
    };
  }
  
  /**
   * Handle messages from coordinator
   * 
   * @param {Object} message - Parsed message
   */
  async handleCoordinatorMessage(message) {
    switch (message.type) {
      case MessageTypes.INIT_MODEL:
        await this.initializeModel(message.data, message.jobId);
        break;
        
      case MessageTypes.PROCESS_INPUT:
        await this.processInput(message.data, message.jobId);
        break;
        
      case MessageTypes.ASSIGN_LAYER:
        await this.assignLayer(message.data, message.jobId);
        break;
        
      case MessageTypes.SHUTDOWN:
        await this.shutdown(message.data);
        break;
        
      case MessageTypes.CONFIG_UPDATE:
        this.updateConfig(message.data);
        break;
        
      case MessageTypes.HEARTBEAT:
        // Just acknowledge heartbeat
        break;
        
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }
  
  /**
   * Initialize a model for inference
   * 
   * @param {Object} data - Model initialization data
   * @param {string} jobId - Job ID
   */
  async initializeModel(data, jobId) {
    try {
      console.log(`Initializing model ${data.modelId} for job ${jobId}`);
      
      // In a real implementation, this would load the model
      // For now, simulate loading
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Store model information
      this.models.set(jobId, {
        modelId: data.modelId,
        modelPart: data.modelPart,
        startLayer: data.startLayer,
        endLayer: data.endLayer,
        stage: data.stage,
        nextWorkerId: data.nextWorkerId,
        prevWorkerId: data.prevWorkerId,
        initialized: true,
        loadTime: Date.now()
      });
      
      // Store job information
      this.activeJobs.set(jobId, {
        status: 'ready',
        startTime: Date.now()
      });
      
      // Send status update
      this.sendStatusUpdate({
        status: 'model_loaded',
        jobId,
        modelId: data.modelId
      });
    } catch (error) {
      console.error(`Error initializing model for job ${jobId}:`, error);
      
      // Send error to coordinator
      this.sendError({
        error: 'Model initialization failed',
        message: error.message,
        jobId
      });
    }
  }
  
  /**
   * Process input for a job
   * 
   * @param {Object} data - Input data
   * @param {string} jobId - Job ID
   */
  async processInput(data, jobId) {
    if (!this.models.has(jobId)) {
      this.sendError({
        error: 'Model not initialized',
        message: `No model initialized for job ${jobId}`,
        jobId
      });
      return;
    }
    
    try {
      console.log(`Processing input for job ${jobId}`);
      
      const model = this.models.get(jobId);
      const job = this.activeJobs.get(jobId);
      
      // Update job status
      job.status = 'processing';
      
      // In a real implementation, this would process the input through the model
      // For now, simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate a result based on the model part
      let result;
      
      if (model.modelPart) {
        // Tensor parallelism - process specific layers
        result = {
          layerOutput: `Output from layers ${model.startLayer}-${model.endLayer}`,
          isComplete: model.endLayer === (model.totalLayers - 1)
        };
      } else if (model.stage !== undefined) {
        // Pipeline parallelism - process stage
        result = {
          stageOutput: `Output from stage ${model.stage}`,
          isComplete: model.nextWorkerId === null
        };
        
        // If not the last stage, forward to next worker
        if (model.nextWorkerId) {
          // In a real implementation, this would be handled by the coordinator
          console.log(`Forwarding to next worker ${model.nextWorkerId}`);
        }
      } else {
        // Data parallelism or full model
        result = {
          output: `Generated output for input: ${JSON.stringify(data.input).substring(0, 50)}...`,
          isComplete: true
        };
      }
      
      // Send result to coordinator
      this.ws.send(JSON.stringify(createMessage(
        MessageTypes.LAYER_RESULT,
        {
          workerId: this.config.nodeId,
          result,
          isComplete: result.isComplete
        },
        jobId
      )));
      
      // Update job status
      job.status = result.isComplete ? 'completed' : 'waiting';
    } catch (error) {
      console.error(`Error processing input for job ${jobId}:`, error);
      
      // Send error to coordinator
      this.sendError({
        error: 'Processing failed',
        message: error.message,
        jobId
      });
      
      // Update job status
      if (this.activeJobs.has(jobId)) {
        this.activeJobs.get(jobId).status = 'failed';
      }
    }
  }
  
  /**
   * Assign a specific layer to this worker
   * 
   * @param {Object} data - Layer assignment data
   * @param {string} jobId - Job ID
   */
  async assignLayer(data, jobId) {
    if (!this.models.has(jobId)) {
      this.sendError({
        error: 'Model not initialized',
        message: `No model initialized for job ${jobId}`,
        jobId
      });
      return;
    }
    
    try {
      console.log(`Assigning layer for job ${jobId}:`, data);
      
      const model = this.models.get(jobId);
      
      // Update model information
      model.startLayer = data.startLayer;
      model.endLayer = data.endLayer;
      
      // Send acknowledgment
      this.sendStatusUpdate({
        status: 'layer_assigned',
        jobId,
        startLayer: data.startLayer,
        endLayer: data.endLayer
      });
    } catch (error) {
      console.error(`Error assigning layer for job ${jobId}:`, error);
      
      // Send error to coordinator
      this.sendError({
        error: 'Layer assignment failed',
        message: error.message,
        jobId
      });
    }
  }
  
  /**
   * Update worker configuration
   * 
   * @param {Object} data - Configuration data
   */
  updateConfig(data) {
    console.log('Updating worker configuration:', data);
    
    // Update configuration
    if (data.coordinatorId) {
      this.config.coordinatorId = data.coordinatorId;
    }
    
    // Other configuration updates as needed
  }
  
  /**
   * Shutdown the worker or specific jobs
   * 
   * @param {Object} data - Shutdown data
   */
  async shutdown(data) {
    console.log('Shutdown request received:', data);
    
    if (data.jobId) {
      // Shutdown specific job
      if (this.models.has(data.jobId)) {
        console.log(`Shutting down job ${data.jobId}`);
        
        // Clean up resources
        this.models.delete(data.jobId);
        this.activeJobs.delete(data.jobId);
        
        // Send acknowledgment
        this.sendStatusUpdate({
          status: 'job_shutdown',
          jobId: data.jobId
        });
      }
    } else if (data.shutdown === true) {
      // Shutdown worker
      console.log('Shutting down worker');
      
      // Clean up all resources
      this.models.clear();
      this.activeJobs.clear();
      
      // Send acknowledgment
      this.sendStatusUpdate({
        status: 'worker_shutdown'
      });
      
      // Close connection
      if (this.ws) {
        this.ws.close();
      }
      
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      
      // Cancel reconnection
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    }
  }
  
  /**
   * Send status update to coordinator
   * 
   * @param {Object} statusData - Status data
   */
  sendStatusUpdate(statusData) {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify(createMessage(
      MessageTypes.WORKER_STATUS,
      statusData,
      statusData.jobId || null
    )));
  }
  
  /**
   * Send error to coordinator
   * 
   * @param {Object} errorData - Error data
   */
  sendError(errorData) {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify(createMessage(
      MessageTypes.WORKER_ERROR,
      errorData,
      errorData.jobId || null
    )));
  }
}
