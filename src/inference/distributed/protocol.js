/**
 * Distributed Inference Protocol
 * 
 * This module defines the WebSocket communication protocol for distributed inference
 * across multiple nodes in the Infernet Protocol network.
 */

// Message types for distributed inference communication
export const MessageTypes = {
  // Coordinator -> Worker messages
  INIT_MODEL: 'init_model',        // Initialize model on worker
  ASSIGN_LAYER: 'assign_layer',    // Assign specific layers to worker
  PROCESS_INPUT: 'process_input',  // Process input tensor
  SHUTDOWN: 'shutdown',            // Shutdown worker
  
  // Worker -> Coordinator messages
  WORKER_READY: 'worker_ready',    // Worker is ready
  LAYER_RESULT: 'layer_result',    // Result from processing layer
  WORKER_ERROR: 'worker_error',    // Error from worker
  WORKER_STATUS: 'worker_status',  // Worker status update
  
  // Bidirectional messages
  HEARTBEAT: 'heartbeat',          // Keep-alive message
  CONFIG_UPDATE: 'config_update'   // Update configuration
};

// Distribution strategies
export const DistributionStrategies = {
  TENSOR_PARALLEL: 'tensor_parallel',   // Split model across workers (horizontal)
  PIPELINE_PARALLEL: 'pipeline_parallel', // Process model in stages (vertical)
  DATA_PARALLEL: 'data_parallel'      // Process different inputs in parallel
};

/**
 * Create a message for the distributed inference protocol
 * 
 * @param {string} type - Message type from MessageTypes
 * @param {Object} data - Message data
 * @param {string} jobId - ID of the job this message relates to
 * @returns {Object} - Formatted message object
 */
export const createMessage = (type, data, jobId) => {
  return {
    type,
    data,
    jobId,
    timestamp: Date.now()
  };
};

/**
 * Validate a message against the protocol
 * 
 * @param {Object} message - Message to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const validateMessage = (message) => {
  if (!message || typeof message !== 'object') return false;
  if (!message.type || !Object.values(MessageTypes).includes(message.type)) return false;
  if (!message.timestamp || typeof message.timestamp !== 'number') return false;
  
  // Specific validation based on message type
  switch (message.type) {
    case MessageTypes.INIT_MODEL:
      return message.data && message.data.modelId;
    case MessageTypes.PROCESS_INPUT:
      return message.data && message.data.input && message.jobId;
    case MessageTypes.LAYER_RESULT:
      return message.data && message.data.result && message.jobId;
    // Add validation for other message types as needed
    default:
      return true; // Basic validation passed
  }
};

/**
 * Parse a raw WebSocket message
 * 
 * @param {string|Buffer} rawMessage - Raw message from WebSocket
 * @returns {Object|null} - Parsed message or null if invalid
 */
export const parseMessage = (rawMessage) => {
  try {
    const message = typeof rawMessage === 'string' 
      ? JSON.parse(rawMessage) 
      : JSON.parse(rawMessage.toString());
    
    return validateMessage(message) ? message : null;
  } catch (error) {
    console.error('Error parsing message:', error);
    return null;
  }
};
