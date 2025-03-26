# Infernet Protocol - Resource Provider Guide

## Overview

This document explains how to use the Infernet Protocol as a resource provider to contribute GPU/CPU resources to the network. The Infernet Protocol allows you to run compute nodes on your local machines or in the cloud, and earn compensation for providing these resources to the network.

## Architecture

### Components

1. **Control Interface**: Desktop app, PWA, or mobile app running on your personal device
2. **Provider Nodes**: Docker containers running on machines with GPUs/CPUs
3. **P2P Network**: Decentralized network connecting all nodes
4. **PocketBase**: Local database for configuration and management

## Setup Process

### Prerequisites

- Docker and Docker Compose installed on all provider machines
- NVIDIA drivers installed on GPU machines
- Internet connectivity for all nodes
- Nostr identity (using browser extensions like nos2x-fox)

### Setting Up Your Control Interface

1. **Install the Infernet Protocol**:
   - Desktop: Download and install the desktop application
   - PWA: Access the web application at your self-hosted URL or https://app.infernet.tech
   - Mobile: Install the mobile app from app stores

2. **Create an Account**:
   - Sign up using Nostr authentication
   - This creates your identity in the Infernet Protocol network

### Deploying Provider Nodes

1. **Prepare Your Machine**:

   ```bash
   # Install Docker (if not already installed)
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   
   # Install NVIDIA Container Toolkit (for GPU nodes)
   distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
   curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
   curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
   sudo apt-get update
   sudo apt-get install -y nvidia-container-toolkit
   sudo systemctl restart docker
   ```

2. **Deploy the Infernet Node Container**:

   ```bash
   # Create a directory for persistent data
   mkdir -p ~/infernet-data
   
   # Pull and run the container
   docker run -d \
     --name infernet-node \
     --gpus all \
     -p 3000:3000 \
     -v ~/infernet-data:/data \
     -e NODE_ENV=production \
     infernet/node
   ```

   Alternatively, use docker-compose:

   ```yaml
   # docker-compose.yml
   version: '3.8'
   services:
     infernet-node:
       image: infernet/node
       container_name: infernet-node
       restart: unless-stopped
       ports:
         - "3000:3000"
       volumes:
         - ./infernet-data:/data
       environment:
         - NODE_ENV=production
       deploy:
         resources:
           reservations:
             devices:
               - driver: nvidia
                 count: all
                 capabilities: [gpu]
   ```

   Then run:

   ```bash
   docker-compose up -d
   ```

3. **Register Your Node**:

   - In your control interface, go to "Nodes" > "Add Node"
   - Enter the IP address or domain name of your node
   - Authenticate using your Nostr identity
   - The node will now be associated with your account

## Managing Your Nodes

### Node Dashboard

The control interface provides a dashboard showing:

- All registered nodes and their status
- Resource utilization (GPU/CPU/Memory)
- Job history and earnings
- Performance metrics

### Configuration Options

For each node, you can configure:

1. **Availability**: Set when the node is available to accept jobs
2. **Pricing**: Set your price per compute unit
3. **Models**: Choose which AI models to run on the node
4. **Resource Allocation**: Limit how much of the node's resources can be used

### Monitoring and Alerts

- Set up alerts for node downtime
- Monitor performance and job success rates
- Track earnings and resource utilization

## Job Processing

### How Jobs Are Distributed

1. Users submit jobs to the Infernet Protocol network
2. The network routes jobs to appropriate nodes based on:
   - Hardware requirements
   - Price
   - Reputation
   - Availability

3. Your nodes process the jobs and return results
4. Payment is made through the Lightning Network

### Job Types

- AI inference (various models)
- Batch processing
- Rendering
- Scientific computing

## Advanced Features

### Distributed Inference

The Infernet Protocol supports distributed inference across multiple nodes, allowing you to process larger models and handle more inference requests:

1. **Setup**:
   - Configure one node as a coordinator
   - Configure one or more nodes as workers
   - Set up WebSocket communication between nodes

2. **Distribution Strategies**:
   - **Tensor Parallelism**: Split the model across multiple nodes horizontally
   - **Pipeline Parallelism**: Process the model in stages across nodes
   - **Data Parallelism**: Process different inputs in parallel across nodes

3. **Configuration**:
   - In your control interface, go to "Settings" > "Distributed Inference"
   - Select a coordinator node and worker nodes
   - Choose a distribution strategy
   - Configure ports for WebSocket communication

4. **Benefits**:
   - Process larger models that don't fit on a single GPU
   - Improve throughput for high-demand models
   - Efficiently utilize resources across your node fleet

### Auto-scaling

You can set up auto-scaling for your node fleet:

1. Create templates for your node configuration
2. Set conditions for scaling (e.g., queue length, pricing thresholds)
3. The system will automatically deploy new nodes when needed

### Custom Models

You can deploy custom AI models to your nodes:

1. Package your model according to the Infernet Protocol standards
2. Deploy the model to selected nodes
3. Make it available for users to run inference against

## Troubleshooting

### Common Issues

1. **Node Not Connecting**:
   - Check network connectivity
   - Verify firewall settings
   - Ensure the container is running

2. **GPU Not Detected**:
   - Verify NVIDIA drivers are installed
   - Check that the NVIDIA Container Toolkit is properly configured
   - Ensure GPU is properly passed to the container

3. **Authentication Problems**:
   - Verify your Nostr identity is properly set up
   - Check that the node has internet access to validate credentials

## Security Considerations

- All communication between nodes is encrypted
- Nostr authentication provides secure identity management
- Container isolation protects the host system
- Regular updates are important for security patches

## Resources

- [Infernet Protocol GitHub](https://github.com/profullstack/infernet-protocol)
- [Documentation](https://docs.infernet.tech)
- [Community Forum](https://community.infernet.tech)

---

*This document was last updated on March 26, 2025.*
