# Infernet Protocol - ARCHITECTURE.md

## Overview
This document outlines the planned technical architecture and implementation details for the Infernet Protocol, supporting CLI servers, desktop applications, and native mobile apps.

## Supported Platforms
- **CLI / Server**: Node.js using vanilla JavaScript.
- **Desktop**: Electron-based application using Svelte for UI.
- **Mobile (Native)**: React Native with Expo.dev for cross-platform mobile apps.

---

## Core Technologies
- **Communication**: WebSockets for real-time, bidirectional communication.
- **Networking**: Decentralized discovery and peer-to-peer job distribution via DHT (Kademlia implementation).
- **Backend**: PocketBase used as a local embedded backend for managing data, job metadata, reputation history, and local node configurations.
- **Containerization**: Docker-based task execution for sandboxing and security.
- **Data Transport**: Home-grown content addressing system for distributing models and large input data files.
- **Styling**: Vanilla CSS across desktop and web interfaces for simplicity and consistency.
- **Account and Reputation Management**: NOSTR protocol integration for decentralized identity, reputation tracking, and public key-based authentication.

---

## CLI (Server Nodes)
- Built on Node.js with vanilla JavaScript.
- Headless daemon process running:
  - Persistent DHT connections for discovery.
  - WebSocket server for receiving inference tasks.
  - Task execution engine using Docker.
  - PocketBase instance for local data management.
  - Result verification and submission.
  - Configuration file-based setup (JSON or YAML).

## Desktop (Electron + Svelte)
- Electron wrapper for cross-platform desktop app (Windows, Mac, Linux).
- UI built with Svelte:
  - Node dashboard for monitoring jobs, GPU usage, reputation.
  - Aggregator interface for splitting and tracking jobs.
  - Client submission form.
- Embedded WebSocket client to communicate with the network.
- Home-grown content delivery system integration for uploading models and large datasets.
- PocketBase instance for local data and cache management.
- Local storage for logs and history.

## Mobile (React Native with Expo)
- React Native app (expo.dev-based) for both iOS and Android.
- Features:
  - Real-time job tracking for clients.
  - Push notifications for job completion and status changes.
  - Ability to submit small inference jobs (low-volume interfaces).
  - Display provider reputation and availability.
- Communication via secure WebSocket clients.
- Sync with PocketBase backend for local state management.

---

## Distributed Hash Table (DHT) Implementation
- **Protocol**: Kademlia-based DHT.
- Peer discovery:
  - GPU providers register nodes with hardware specs.
  - Aggregators search for best-fit nodes by reputation and load.
- Dynamic updates for provider uptime and status.
- Gossip-based protocol for reputation dissemination.

---

## Payment Systems
- **Initial Release**:
  - Polygon stablecoin payments.
  - Bitcoin Lightning Network micro-payments.
- **Future Payment Systems**:
  - Solana integration for high-throughput, low-fee payments.
  - Other L2 and cross-chain payment solutions.

---

## Task Workflow Summary
1. **Discovery**: Aggregator queries DHT for available providers.
2. **Parallelism Strategy Selection**: Aggregator determines optimal parallelism strategy based on model size and available resources.
3. **Job Dispatch**: Aggregator distributes inference job shards via WebSocket.
4. **Execution**: Provider executes job in a Docker container.
5. **Result Submission**: Provider sends result hashes and data via WebSocket.
6. **Verification**: Aggregator performs redundant checks or validator sampling.
7. **Payment Settlement**: Upon verification, payments released via micro-payment systems.

---

## Security
- Container isolation (Docker).
- End-to-end encryption for job payloads.
- Validator sampling for result trust.
- Use of NOSTR keys for identity verification and signing.
- Potential use of secure enclaves (SGX/SEV) in future iterations.

---

## Logging and Monitoring
- CLI/Server: JSON-based structured logs.
- Desktop: Visual logs with exportable summaries.
- Mobile: Lightweight notifications and log snapshots.

---

## Distributed Inference Architecture

### Parallelism Strategies
- **Tensor Parallelism**: Splitting model weights across multiple GPUs on a single provider node.
  - Optimized for models too large for a single GPU but that fit on multiple GPUs in one node.
  - Configurable with tensor parallel sizes (2, 4, or 8 GPUs recommended for quantized models).

- **Pipeline Parallelism**: Splitting model across multiple provider nodes.
  - Used when a model is too large to fit on a single node.
  - Each provider processes different parts of the model pipeline.

- **Hybrid Approach**: Combining tensor and pipeline parallelism.
  - Tensor parallelism within provider nodes, pipeline parallelism across providers.
  - Coordinated by aggregator nodes for optimal resource utilization.

### Resource Management
- **GPU Memory Allocation**:
  - System calculates available "GPU blocks" to estimate maximum concurrent tokens.
  - Dynamic allocation based on model size and throughput requirements.

- **Scaling Decision Tree**:
  - Single GPU → Multi-GPU on single node → Multi-node deployment.
  - Automatic selection based on job requirements and available resources.

### Network Optimization
- **High-Performance Communication**:
  - Support for Infiniband, RDMA, and other high-speed interconnects between nodes.
  - Network performance testing and monitoring tools.
  - Configurable network parameters for optimal cross-node communication.

### Containerization Strategy
- **Environment Consistency**:
  - Docker containers ensure identical environments across provider nodes.
  - Environment variable management for network and communication configuration.
  - Shared model paths and runtime environments.

## Next Steps
- Define schemas for discovery messages and job specifications.
- Define Docker execution templates with support for distributed inference.
- Create WebSocket communication spec (message types and formats).
- Finalize DHT node join/leave protocols and health checks.
- Begin design of home-grown content delivery and retrieval system.
- Integrate NOSTR protocol libraries for reputation and identity management.
- Implement distributed inference strategies (tensor and pipeline parallelism).
- Design network optimization tools for high-speed node communication.

## Contact
For technical contributions or questions: protocol@infernet.tech

