import type { Libp2p } from 'libp2p';
import type {
  InfernetConfig,
  InfernetEvent,
  Job,
  JobInput,
  JobOutput,
  JobPricing,
  JobRequirements,
  JobType,
  NodeCapabilities,
} from '@infernet/shared';
import { createInfernetNode } from './network/node.js';
import { ProtocolMessaging } from './network/protocol.js';
import { JobManager } from './jobs/manager.js';
import { PaymentManager } from './payments/manager.js';
import { IdentityManager } from './identity/manager.js';
import { ExecutionEngine, type ExecutionBackend } from './execution/engine.js';

export type EventHandler = (event: InfernetEvent) => void;

/**
 * InfernetNode is the main entry point for the Infernet Protocol.
 * It orchestrates networking, job management, payments, identity, and execution.
 *
 * Usage:
 *   const node = new InfernetNode(config);
 *   await node.start();
 *
 *   // As a client: submit jobs
 *   const job = await node.submitJob({ ... });
 *
 *   // As a provider: register backends and accept jobs
 *   node.registerBackend(myLlamaBackend);
 *   node.onJob(async (job) => { ... });
 */
export class InfernetNode {
  private config: InfernetConfig;
  private libp2p!: Libp2p;
  private messaging!: ProtocolMessaging;
  private eventHandlers: Set<EventHandler> = new Set();

  public jobs!: JobManager;
  public payments!: PaymentManager;
  public identity!: IdentityManager;
  public execution: ExecutionEngine;

  private _started = false;

  constructor(config: InfernetConfig) {
    this.config = config;
    this.execution = new ExecutionEngine();
  }

  /**
   * Start the Infernet node: initialize libp2p, connect to the network.
   */
  async start(): Promise<void> {
    if (this._started) return;

    // Create and start libp2p node
    this.libp2p = await createInfernetNode({
      config: this.config,
      isServer: true,
    });

    await this.libp2p.start();

    const peerId = this.libp2p.peerId.toString();

    // Initialize subsystems
    this.messaging = new ProtocolMessaging(this.libp2p);
    await this.messaging.start();

    this.jobs = new JobManager(this.messaging, peerId);
    this.identity = new IdentityManager(this.messaging, peerId);

    if (this.config.coinpayApiKey && this.config.coinpayApiUrl) {
      this.payments = new PaymentManager({
        apiKey: this.config.coinpayApiKey,
        apiUrl: this.config.coinpayApiUrl,
      });
    }

    // Detect and announce capabilities
    const capabilities = await this.execution.detectCapabilities();
    const multiaddrs = this.libp2p.getMultiaddrs().map((ma) => ma.toString());
    await this.identity.announcePresence(capabilities, multiaddrs);

    // Register to Supabase bootstrap if configured
    if (this.config.supabaseUrl && this.config.supabaseAnonKey) {
      await this.registerBootstrapNode(peerId, multiaddrs);
    }

    // Set up peer connection events
    this.libp2p.addEventListener('peer:connect', (evt) => {
      const remotePeerId = evt.detail.toString();
      this.emit({ type: 'peer:connected', peer: this.identity.getPeer(remotePeerId) ?? { peerId: remotePeerId } as any });
    });

    this.libp2p.addEventListener('peer:disconnect', (evt) => {
      this.emit({ type: 'peer:disconnected', peerId: evt.detail.toString() });
    });

    this._started = true;
    this.emit({ type: 'node:ready', peerId });

    console.log(`[infernet] Node started: ${peerId}`);
    console.log(`[infernet] Listening on:`, multiaddrs);
  }

  /**
   * Stop the node and clean up.
   */
  async stop(): Promise<void> {
    if (!this._started) return;

    await this.messaging.stop();
    await this.libp2p.stop();
    this._started = false;

    console.log('[infernet] Node stopped');
  }

  /**
   * Submit an inference job to the network (as a client).
   */
  async submitJob(params: {
    type?: JobType;
    model: string;
    input: JobInput;
    pricing: JobPricing;
    requirements?: JobRequirements;
  }): Promise<Job> {
    if (!this._started) throw new Error('Node not started');

    return this.jobs.createJob({
      type: params.type ?? 'inference',
      model: params.model,
      input: params.input,
      pricing: params.pricing,
      requirements: params.requirements,
    });
  }

  /**
   * Register an execution backend for processing jobs (as a provider).
   */
  registerBackend(backend: ExecutionBackend): void {
    this.execution.registerBackend(backend);
  }

  /**
   * Set up a handler for incoming jobs (as a provider).
   * The handler should execute the job and return the output.
   */
  onJob(handler: (job: Job) => Promise<JobOutput | void>): void {
    this.jobs.onJob(async (job) => {
      try {
        this.emit({ type: 'job:received', job });

        // Auto-execute if we have a matching backend
        const output = await handler(job);
        if (output) {
          await this.jobs.submitResult(job.id, output);
          this.emit({ type: 'job:completed', job, output });
        }
      } catch (err) {
        this.emit({ type: 'job:failed', job, error: (err as Error).message });
      }
    });
  }

  /**
   * Subscribe to node events.
   */
  on(handler: EventHandler): void {
    this.eventHandlers.add(handler);
  }

  /**
   * Unsubscribe from node events.
   */
  off(handler: EventHandler): void {
    this.eventHandlers.delete(handler);
  }

  get peerId(): string {
    return this.libp2p?.peerId?.toString() ?? '';
  }

  get isStarted(): boolean {
    return this._started;
  }

  get connectedPeers(): number {
    return this.libp2p?.getPeers()?.length ?? 0;
  }

  private emit(event: InfernetEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[infernet] Event handler error:', err);
      }
    }
  }

  private async registerBootstrapNode(peerId: string, multiaddrs: string[]): Promise<void> {
    try {
      const res = await fetch(
        `${this.config.supabaseUrl}/rest/v1/bootstrap_nodes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.config.supabaseAnonKey!,
            'Authorization': `Bearer ${this.config.supabaseAnonKey}`,
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            peer_id: peerId,
            multiaddr: multiaddrs[0],
            active: true,
            last_seen: new Date().toISOString(),
          }),
        }
      );

      if (!res.ok) {
        console.warn('[infernet] Failed to register as bootstrap node');
      }
    } catch {
      console.warn('[infernet] Could not reach Supabase for bootstrap registration');
    }
  }
}
