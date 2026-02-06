# Infernet Protocol v2 - TODO

## Phase 1: MVP (Single-Node Inference)

### Core Protocol
- [ ] libp2p node startup and peer discovery
- [ ] Protocol message encoding/decoding tests
- [ ] Direct peer messaging (job assign, result)
- [ ] Broadcast messaging (job broadcast, peer announce)
- [ ] Bootstrap node registration via Supabase

### Jobs
- [ ] Job creation and broadcast
- [ ] Bid collection and ranking
- [ ] Job assignment with escrow creation
- [ ] Result submission and verification
- [ ] Job timeout and cancellation

### Payments
- [ ] CoinPay payment creation
- [ ] Escrow creation for jobs
- [ ] Escrow release on job completion
- [ ] Escrow dispute flow
- [ ] Webhook handling for payment status updates

### Execution
- [ ] Pluggable backend interface
- [ ] llama.cpp backend (reference implementation)
- [ ] Hardware detection (GPU via nvidia-smi, CPU via os module)
- [ ] Resource utilization monitoring
- [ ] Concurrent job limiting

### Identity
- [ ] Peer announcement on join
- [ ] Capability broadcasting
- [ ] Basic reputation scoring

### Web Dashboard
- [ ] Browser libp2p node initialization
- [ ] Network status display
- [ ] Job submission form
- [ ] Job list and status tracking
- [ ] Peer list and details
- [ ] Payment history
- [ ] Hardware monitoring panel

### Desktop
- [ ] Electron wrapper around Next.js
- [ ] Background node process
- [ ] System tray integration
- [ ] Auto-start on boot option

### Mobile
- [ ] Expo project setup with navigation
- [ ] Network status screen
- [ ] Job submission screen
- [ ] Payment history screen

## Phase 2: Multi-Node

- [ ] Job splitting across multiple providers
- [ ] Result aggregation
- [ ] Load balancing

## Phase 3: Reputation & Verification

- [ ] Reputation gossip protocol
- [ ] Slashing for bad actors
- [ ] Hash-based result verification
- [ ] Provider staking

## Phase 4: Advanced Payments

- [ ] Streaming micropayments
- [ ] Multi-currency pricing
- [ ] Provider pricing discovery
- [ ] Automated market-based pricing

## Phase 5: zkML

- [ ] Research zkML proof systems
- [ ] Proof generation for inference results
- [ ] On-chain verification
