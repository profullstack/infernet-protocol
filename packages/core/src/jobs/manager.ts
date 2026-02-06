import { randomBytes } from 'crypto';
import { toString } from 'uint8arrays';
import type {
  Job,
  JobBidMessage,
  JobInput,
  JobOutput,
  JobPricing,
  JobRequirements,
  JobStatus,
  JobType,
} from '@infernet/shared';
import type { ProtocolMessaging } from '../network/protocol.js';

/**
 * Manages the job lifecycle: creation, bidding, assignment, execution, completion.
 * All state is kept in-memory and propagated via P2P messages.
 */
export class JobManager {
  private jobs: Map<string, Job> = new Map();
  private bids: Map<string, JobBidMessage[]> = new Map();
  private messaging: ProtocolMessaging;
  private localPeerId: string;
  private onJobReceived?: (job: Job) => void;

  constructor(messaging: ProtocolMessaging, localPeerId: string) {
    this.messaging = messaging;
    this.localPeerId = localPeerId;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.messaging.on('job:broadcast', (msg) => {
      if (msg.type !== 'job:broadcast') return;
      const job = msg.job;
      this.jobs.set(job.id, job);
      this.onJobReceived?.(job);
    });

    this.messaging.on('job:bid', (msg) => {
      if (msg.type !== 'job:bid') return;
      const existing = this.bids.get(msg.jobId) ?? [];
      existing.push(msg);
      this.bids.set(msg.jobId, existing);
    });

    this.messaging.on('job:assign', (msg) => {
      if (msg.type !== 'job:assign') return;
      const job = this.jobs.get(msg.jobId);
      if (job) {
        job.status = 'assigned';
        job.providerPeerId = msg.providerPeerId;
        job.assignedAt = msg.timestamp;
        job.escrowId = msg.escrow.id;
      }
    });

    this.messaging.on('job:result', (msg) => {
      if (msg.type !== 'job:result') return;
      const job = this.jobs.get(msg.jobId);
      if (job) {
        job.status = 'completed';
        job.output = msg.output;
        job.completedAt = msg.timestamp;
      }
    });
  }

  /**
   * Create and broadcast a new inference job to the network.
   */
  async createJob(params: {
    type: JobType;
    model: string;
    input: JobInput;
    pricing: JobPricing;
    requirements?: JobRequirements;
  }): Promise<Job> {
    const job: Job = {
      id: generateId(),
      type: params.type,
      status: 'pending',
      clientPeerId: this.localPeerId,
      model: params.model,
      input: params.input,
      pricing: params.pricing,
      requirements: params.requirements ?? {},
      createdAt: Date.now(),
    };

    this.jobs.set(job.id, job);

    await this.messaging.broadcast({
      type: 'job:broadcast',
      job,
      timestamp: Date.now(),
    });

    return job;
  }

  /**
   * Submit a bid for a job (as a provider).
   */
  async bidOnJob(jobId: string, bidPrice: number, estimatedTimeMs: number, capabilities: Job['requirements']): Promise<void> {
    await this.messaging.broadcast({
      type: 'job:bid',
      jobId,
      providerPeerId: this.localPeerId,
      bidPrice,
      estimatedTimeMs,
      capabilities: capabilities as any,
      timestamp: Date.now(),
    });
  }

  /**
   * Accept a bid and assign the job to a provider (as a client).
   */
  async assignJob(jobId: string, providerPeerId: string, escrow: any): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.clientPeerId !== this.localPeerId) throw new Error('Only the job creator can assign it');

    job.status = 'assigned';
    job.providerPeerId = providerPeerId;
    job.assignedAt = Date.now();

    await this.messaging.sendTo(providerPeerId, {
      type: 'job:assign',
      jobId,
      providerPeerId,
      escrow,
      timestamp: Date.now(),
    });
  }

  /**
   * Submit the result for a completed job (as a provider).
   */
  async submitResult(jobId: string, output: JobOutput): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = 'completed';
    job.output = output;
    job.completedAt = Date.now();

    await this.messaging.sendTo(job.clientPeerId, {
      type: 'job:result',
      jobId,
      output,
      timestamp: Date.now(),
    });
  }

  /**
   * Register a callback for incoming jobs.
   */
  onJob(handler: (job: Job) => void): void {
    this.onJobReceived = handler;
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  getBids(jobId: string): JobBidMessage[] {
    return this.bids.get(jobId) ?? [];
  }

  getMyJobs(): Job[] {
    return [...this.jobs.values()].filter(
      (j) => j.clientPeerId === this.localPeerId || j.providerPeerId === this.localPeerId
    );
  }

  getAllJobs(): Job[] {
    return [...this.jobs.values()];
  }
}

function generateId(): string {
  const bytes = typeof globalThis.crypto !== 'undefined'
    ? globalThis.crypto.getRandomValues(new Uint8Array(16))
    : randomBytes(16);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
