// ============================================================
// Infernet Protocol - Shared Types
// ============================================================

// --- Peer / Node ---

export interface PeerInfo {
  peerId: string;
  multiaddrs: string[];
  publicKey: Uint8Array;
  capabilities: NodeCapabilities;
  reputation: number;
  joinedAt: number;
}

export interface NodeCapabilities {
  gpus: GPUInfo[];
  cpus: CPUInfo[];
  memoryGB: number;
  storageGB: number;
  bandwidthMbps: number;
  supportedModels: string[];
  maxConcurrentJobs: number;
}

export interface GPUInfo {
  name: string;
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple';
  vramGB: number;
  computeCapability?: string;
}

export interface CPUInfo {
  name: string;
  cores: number;
  threads: number;
  clockSpeedGHz: number;
}

// --- Jobs ---

export type JobStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'disputed';

export type JobType = 'inference' | 'training' | 'fine-tuning';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  clientPeerId: string;
  providerPeerId?: string;
  model: string;
  input: JobInput;
  output?: JobOutput;
  pricing: JobPricing;
  requirements: JobRequirements;
  createdAt: number;
  assignedAt?: number;
  completedAt?: number;
  escrowId?: string;
}

export interface JobInput {
  prompt?: string;
  data?: Uint8Array;
  parameters: Record<string, unknown>;
}

export interface JobOutput {
  result?: string;
  data?: Uint8Array;
  metadata: Record<string, unknown>;
  executionTimeMs: number;
  tokensUsed?: number;
}

export interface JobPricing {
  maxBudget: number;
  currency: PaymentCurrency;
  pricePerToken?: number;
  pricePerSecond?: number;
  fixedPrice?: number;
}

export interface JobRequirements {
  minVRAMGB?: number;
  minMemoryGB?: number;
  minReputationScore?: number;
  preferredGPU?: string;
  maxLatencyMs?: number;
  region?: string;
}

// --- Payments ---

export type PaymentChain = 'BTC' | 'ETH' | 'SOL' | 'POL' | 'BCH';

export type PaymentCurrency =
  | 'BTC'
  | 'ETH'
  | 'SOL'
  | 'POL'
  | 'BCH'
  | 'USDC_ETH'
  | 'USDC_POL'
  | 'USDC_SOL';

export interface Payment {
  id: string;
  jobId: string;
  fromPeerId: string;
  toPeerId: string;
  amount: number;
  currency: PaymentCurrency;
  chain: PaymentChain;
  status: PaymentStatus;
  escrowId?: string;
  txHash?: string;
  createdAt: number;
  settledAt?: number;
}

export type PaymentStatus =
  | 'pending'
  | 'escrowed'
  | 'released'
  | 'refunded'
  | 'disputed';

export interface EscrowInfo {
  id: string;
  escrowAddress: string;
  chain: PaymentChain;
  amount: number;
  depositorAddress: string;
  beneficiaryAddress: string;
  releaseToken: string;
  beneficiaryToken: string;
  status: 'created' | 'funded' | 'released' | 'refunded' | 'disputed';
  expiresAt: number;
}

// --- Protocol Messages ---

export type ProtocolMessage =
  | JobBroadcastMessage
  | JobBidMessage
  | JobAssignMessage
  | JobResultMessage
  | JobDisputeMessage
  | PeerAnnounceMessage
  | PeerQueryMessage
  | ReputationUpdateMessage;

export interface JobBroadcastMessage {
  type: 'job:broadcast';
  job: Job;
  timestamp: number;
}

export interface JobBidMessage {
  type: 'job:bid';
  jobId: string;
  providerPeerId: string;
  bidPrice: number;
  estimatedTimeMs: number;
  capabilities: NodeCapabilities;
  timestamp: number;
}

export interface JobAssignMessage {
  type: 'job:assign';
  jobId: string;
  providerPeerId: string;
  escrow: EscrowInfo;
  timestamp: number;
}

export interface JobResultMessage {
  type: 'job:result';
  jobId: string;
  output: JobOutput;
  proof?: VerificationProof;
  timestamp: number;
}

export interface JobDisputeMessage {
  type: 'job:dispute';
  jobId: string;
  reason: string;
  evidence?: Uint8Array;
  timestamp: number;
}

export interface PeerAnnounceMessage {
  type: 'peer:announce';
  peer: PeerInfo;
  timestamp: number;
}

export interface PeerQueryMessage {
  type: 'peer:query';
  requirements: JobRequirements;
  timestamp: number;
}

export interface ReputationUpdateMessage {
  type: 'reputation:update';
  peerId: string;
  jobId: string;
  score: number;
  feedback?: string;
  timestamp: number;
}

// --- Verification ---

export interface VerificationProof {
  type: 'hash' | 'zkml' | 'tee';
  data: Uint8Array;
  verifierPeerId?: string;
}

// --- Reputation ---

export interface ReputationRecord {
  peerId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  disputedJobs: number;
  averageScore: number;
  totalEarned: Record<PaymentCurrency, number>;
  lastActiveAt: number;
}

// --- Config ---

export interface InfernetConfig {
  /** Display name for this node */
  nodeName?: string;
  /** Listen addresses for libp2p */
  listenAddresses?: string[];
  /** Known bootstrap peers */
  bootstrapPeers?: string[];
  /** Supabase URL for centralized bootstrap */
  supabaseUrl?: string;
  /** Supabase anon key */
  supabaseAnonKey?: string;
  /** CoinPay API key for payments */
  coinpayApiKey?: string;
  /** CoinPay API URL */
  coinpayApiUrl?: string;
  /** Wallet addresses for receiving payments */
  walletAddresses?: Partial<Record<PaymentChain, string>>;
  /** Node capabilities (auto-detected if not set) */
  capabilities?: Partial<NodeCapabilities>;
  /** Max concurrent jobs to accept as provider */
  maxConcurrentJobs?: number;
  /** Pricing configuration for providing compute */
  pricing?: ProviderPricing;
}

export interface ProviderPricing {
  pricePerTokenUSD?: number;
  pricePerSecondUSD?: number;
  acceptedCurrencies: PaymentCurrency[];
  minimumJobValueUSD?: number;
}

// --- Events ---

export type InfernetEvent =
  | { type: 'peer:connected'; peer: PeerInfo }
  | { type: 'peer:disconnected'; peerId: string }
  | { type: 'job:received'; job: Job }
  | { type: 'job:bid:received'; bid: JobBidMessage }
  | { type: 'job:assigned'; job: Job }
  | { type: 'job:completed'; job: Job; output: JobOutput }
  | { type: 'job:failed'; job: Job; error: string }
  | { type: 'payment:received'; payment: Payment }
  | { type: 'payment:sent'; payment: Payment }
  | { type: 'escrow:created'; escrow: EscrowInfo }
  | { type: 'escrow:released'; escrow: EscrowInfo }
  | { type: 'node:ready'; peerId: string }
  | { type: 'node:error'; error: Error };
