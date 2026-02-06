import { InfernetNode } from '@infernet/core';
import type { InfernetConfig, Job, JobInput, JobPricing, PaymentCurrency } from '@infernet/shared';

/**
 * High-level Infernet SDK for building applications on the protocol.
 *
 * Usage:
 *   import { Infernet } from '@infernet/sdk';
 *
 *   const infernet = new Infernet({ coinpayApiKey: '...' });
 *   await infernet.start();
 *
 *   const result = await infernet.infer('llama-3', 'What is the meaning of life?');
 *   console.log(result);
 */
export class Infernet {
  private node: InfernetNode;

  constructor(config: InfernetConfig = {}) {
    this.node = new InfernetNode(config);
  }

  async start(): Promise<void> {
    await this.node.start();
  }

  async stop(): Promise<void> {
    await this.node.stop();
  }

  /**
   * Simple inference call — submit a prompt and wait for a result.
   */
  async infer(model: string, prompt: string, options?: {
    maxBudget?: number;
    currency?: PaymentCurrency;
    parameters?: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<string> {
    const job = await this.node.submitJob({
      model,
      input: {
        prompt,
        parameters: options?.parameters ?? {},
      },
      pricing: {
        maxBudget: options?.maxBudget ?? 1.0,
        currency: options?.currency ?? 'USDC_SOL',
      },
    });

    // Wait for result
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Job ${job.id} timed out`));
      }, options?.timeoutMs ?? 60000);

      this.node.on((event) => {
        if (event.type === 'job:completed' && event.job.id === job.id) {
          clearTimeout(timeout);
          resolve(event.output.result ?? JSON.stringify(event.output.data));
        }
        if (event.type === 'job:failed' && event.job.id === job.id) {
          clearTimeout(timeout);
          reject(new Error(event.error));
        }
      });
    });
  }

  /**
   * Get the underlying InfernetNode for advanced usage.
   */
  getNode(): InfernetNode {
    return this.node;
  }

  get peerId(): string {
    return this.node.peerId;
  }

  get connectedPeers(): number {
    return this.node.connectedPeers;
  }
}

// Re-export everything useful
export { InfernetNode } from '@infernet/core';
export type {
  InfernetConfig,
  Job,
  JobInput,
  JobOutput,
  JobPricing,
  JobRequirements,
  NodeCapabilities,
  PeerInfo,
  PaymentCurrency,
  PaymentChain,
  InfernetEvent,
  ExecutionBackend,
} from '@infernet/core';
