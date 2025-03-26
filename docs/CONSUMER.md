# Infernet Protocol - Resource Consumer Guide

## Overview

This document explains how to use the Infernet Protocol as a resource consumer to access distributed GPU/CPU resources for AI inference and training. The Infernet Protocol allows you to run computationally intensive tasks across a decentralized network of provider nodes, offering scalability, cost-effectiveness, and flexibility.

## Architecture

### Components

1. **Client Interface**: Desktop app, PWA, mobile app, or API for programmatic access
2. **Provider Network**: Distributed network of GPU/CPU resources
3. **P2P Network**: Decentralized infrastructure connecting consumers and providers
4. **PocketBase**: Local database for job management and history

## Getting Started

### Prerequisites

- Infernet Protocol client installed (desktop, mobile, or API access)
- Nostr identity for authentication (using browser extensions like nos2x-fox)
- Basic understanding of AI models and inference requirements

### Setting Up Your Client

1. **Install the Infernet Protocol Client**:
   - Desktop: Download and install the desktop application
   - PWA: Access the web application at https://app.infernet.tech
   - Mobile: Install the mobile app from app stores
   - API: Use the REST API or SDK for your programming language

2. **Create an Account**:
   - Sign up using Nostr authentication
   - This creates your identity in the Infernet Protocol network
   - Fund your account with Bitcoin via Lightning Network (optional for paid services)

## Using the Network for Inference

### Basic Inference Jobs

1. **Select a Model**:
   - Browse the available models in the marketplace
   - Filter by model type, size, capabilities, and pricing

2. **Configure Your Inference Job**:
   - Upload your input data (images, text, audio, etc.)
   - Set inference parameters (temperature, top_k, etc.)
   - Choose resource requirements (GPU type, memory, etc.)

3. **Set Job Parameters**:
   - Priority level (affects pricing and queue position)
   - Maximum budget
   - Deadline requirements

4. **Submit the Job**:
   - The system will automatically find suitable provider nodes
   - Your job will be distributed and executed
   - Results will be returned to your client

### Advanced Inference Options

#### Multi-Node Inference

For large inference jobs that benefit from parallelization:

1. **Enable Multi-Node Processing**:
   - Check the "Distribute across multiple nodes" option
   - Set the number of parallel workers or let the system optimize

2. **Configure Aggregation**:
   - Choose how results should be combined
   - Set verification requirements for result consistency

#### Batch Processing

For processing multiple inputs in a single job:

1. **Create a Batch Job**:
   - Upload multiple inputs as a batch
   - Configure batch-specific parameters
   - Set parallel processing options

2. **Monitor Progress**:
   - Track completion percentage
   - View results as they become available

## Using the Network for Training

### Training Custom Models

1. **Prepare Your Training Job**:
   - Package your model architecture and training code
   - Upload your training dataset or connect to external data sources
   - Configure training parameters (learning rate, batch size, etc.)

2. **Set Training Requirements**:
   - Hardware specifications (GPU type, memory, etc.)
   - Training duration and budget
   - Checkpoint frequency

3. **Configure Distributed Training**:
   - Select distributed training strategy (data parallel, model parallel, etc.)
   - Set number of nodes for training
   - Configure synchronization parameters

4. **Submit Training Job**:
   - The system will allocate appropriate resources
   - Training progress will be monitored and reported
   - Checkpoints will be saved according to your configuration

### Fine-Tuning Existing Models

1. **Select Base Model**:
   - Choose from available pre-trained models
   - Specify which layers to freeze/unfreeze

2. **Upload Fine-Tuning Data**:
   - Provide your custom dataset
   - Configure data preprocessing

3. **Set Fine-Tuning Parameters**:
   - Learning rate, epochs, etc.
   - Evaluation metrics

4. **Monitor and Manage**:
   - Track training progress
   - Evaluate model performance on validation data
   - Download or deploy the fine-tuned model

## Cost Management

### Pricing Models

- **Pay-as-you-go**: Pay only for the compute resources you use
- **Reserved Capacity**: Pre-purchase compute units at a discount
- **Priority Pricing**: Pay premium rates for higher priority in the queue

### Budget Controls

1. **Set Maximum Budget**:
   - Limit the total cost of a job
   - Get notifications when approaching budget limits

2. **Cost Estimation**:
   - Preview estimated costs before job submission
   - View detailed cost breakdowns

3. **Optimization Suggestions**:
   - Receive recommendations for cost-effective resource allocation
   - Balance between cost, speed, and quality

## Monitoring and Management

### Job Dashboard

The client interface provides a comprehensive dashboard showing:

- Active, queued, and completed jobs
- Resource utilization and costs
- Performance metrics and logs
- Results and output files

### Notifications

Configure alerts for:

- Job status changes (started, completed, failed)
- Budget thresholds
- Error conditions
- Optimization opportunities

## API Integration

### RESTful API

Access the Infernet Protocol programmatically via REST API:

```javascript
// Example: Submit an inference job using the JavaScript SDK
import { InfernetClient } from 'infernet-sdk';

const client = new InfernetClient({
  apiKey: 'your-api-key',
  nostrPublicKey: 'your-nostr-public-key'
});

const job = await client.createInferenceJob({
  model: 'stable-diffusion-xl',
  input: {
    prompt: 'A futuristic city with flying cars and neon lights',
    negative_prompt: 'blurry, low quality',
    num_inference_steps: 50
  },
  resources: {
    gpu_type: 'NVIDIA_A100',
    priority: 'medium'
  },
  budget: {
    max_cost_sats: 10000
  }
});

// Poll for results
const result = await client.waitForJobCompletion(job.id);
console.log(result.output);
```

### WebSocket API

For real-time updates and streaming results:

```javascript
// Example: Stream inference results using WebSockets
const socket = client.connectToJobStream(job.id);

socket.on('progress', (progress) => {
  console.log(`Job progress: ${progress.percentage}%`);
});

socket.on('result', (partialResult) => {
  // Handle streaming results as they arrive
  updateUI(partialResult);
});

socket.on('complete', (finalResult) => {
  console.log('Job completed:', finalResult);
  socket.disconnect();
});
```

## Advanced Use Cases

### Private Inference

For sensitive data and applications:

1. **Encrypted Inference**:
   - Data is encrypted before transmission
   - Computation occurs on encrypted data
   - Only you can decrypt the results

2. **Trusted Execution Environments**:
   - Select providers offering secure enclaves (Intel SGX, AMD SEV)
   - Verify attestation reports for hardware security

### Custom Deployment

For specialized or proprietary models:

1. **Private Model Deployment**:
   - Deploy your proprietary models to the network
   - Control access and usage permissions
   - Set custom pricing for others to use your model

2. **Custom Runtime Environments**:
   - Specify custom Docker containers for specialized dependencies
   - Configure environment variables and runtime settings

## Troubleshooting

### Common Issues

1. **Job Stuck in Queue**:
   - Check if your budget is competitive for current network conditions
   - Verify resource requirements are available in the network
   - Consider increasing priority or adjusting requirements

2. **Failed Jobs**:
   - Review error logs and messages
   - Check input data format and compatibility
   - Verify model compatibility with selected resources

3. **Performance Issues**:
   - Analyze performance metrics
   - Consider different parallelization strategies
   - Optimize input data and model parameters

## Resources

- [Infernet Protocol GitHub](https://github.com/profullstack/infernet-protocol)
- [API Documentation](https://docs.infernet.tech/api)
- [Example Notebooks](https://github.com/profullstack/infernet-protocol/tree/master/examples)
- [Community Forum](https://community.infernet.tech)

---

*This document was last updated on March 26, 2025.*
