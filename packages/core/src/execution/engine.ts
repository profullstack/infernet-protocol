import type { Job, JobOutput, NodeCapabilities } from '@infernet/shared';

/**
 * Interface for pluggable inference execution backends.
 * Implementations can wrap llama.cpp, vLLM, TGI, ONNX, etc.
 */
export interface ExecutionBackend {
  /** Unique identifier for this backend */
  name: string;
  /** Check if this backend can handle a given model */
  supportsModel(model: string): boolean;
  /** Run an inference job and return the output */
  execute(job: Job): Promise<JobOutput>;
  /** Get current resource utilization */
  getUtilization(): Promise<ResourceUtilization>;
  /** List models available on this backend */
  listModels(): Promise<string[]>;
  /** Start the backend */
  start(): Promise<void>;
  /** Stop the backend */
  stop(): Promise<void>;
}

export interface ResourceUtilization {
  gpuUsagePercent: number;
  gpuMemoryUsedGB: number;
  gpuMemoryTotalGB: number;
  cpuUsagePercent: number;
  memoryUsedGB: number;
  memoryTotalGB: number;
  activeJobs: number;
}

/**
 * Manages execution backends and routes jobs to the appropriate one.
 */
export class ExecutionEngine {
  private backends: ExecutionBackend[] = [];
  private activeJobs: Map<string, Job> = new Map();

  /**
   * Register an execution backend.
   */
  registerBackend(backend: ExecutionBackend): void {
    this.backends.push(backend);
  }

  /**
   * Find a suitable backend for a job and execute it.
   */
  async execute(job: Job): Promise<JobOutput> {
    const backend = this.backends.find((b) => b.supportsModel(job.model));
    if (!backend) {
      throw new Error(`No backend available for model: ${job.model}`);
    }

    this.activeJobs.set(job.id, job);

    try {
      const output = await backend.execute(job);
      return output;
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Detect local hardware capabilities.
   */
  async detectCapabilities(): Promise<NodeCapabilities> {
    // In Node.js, we can detect GPU/CPU info
    // In browser, capabilities are limited
    const isBrowser = typeof window !== 'undefined';

    if (isBrowser) {
      return {
        gpus: [],
        cpus: [{
          name: 'Browser',
          cores: navigator.hardwareConcurrency ?? 1,
          threads: navigator.hardwareConcurrency ?? 1,
          clockSpeedGHz: 0,
        }],
        memoryGB: 0,
        storageGB: 0,
        bandwidthMbps: 0,
        supportedModels: [],
        maxConcurrentJobs: 1,
      };
    }

    // Node.js detection - dynamic import to avoid browser issues
    try {
      const os = await import('os');
      const cpus = os.cpus();

      return {
        gpus: await this.detectGPUs(),
        cpus: [{
          name: cpus[0]?.model ?? 'Unknown',
          cores: cpus.length,
          threads: cpus.length,
          clockSpeedGHz: (cpus[0]?.speed ?? 0) / 1000,
        }],
        memoryGB: Math.round(os.totalmem() / (1024 ** 3)),
        storageGB: 0, // needs fs check
        bandwidthMbps: 0, // needs speed test
        supportedModels: await this.getSupportedModels(),
        maxConcurrentJobs: Math.max(1, Math.floor(cpus.length / 4)),
      };
    } catch {
      return {
        gpus: [],
        cpus: [],
        memoryGB: 0,
        storageGB: 0,
        bandwidthMbps: 0,
        supportedModels: [],
        maxConcurrentJobs: 1,
      };
    }
  }

  private async detectGPUs(): Promise<NodeCapabilities['gpus']> {
    // GPU detection requires nvidia-smi or similar
    // This is a placeholder — real implementation would shell out to nvidia-smi
    try {
      const { execSync } = await import('child_process');
      const output = execSync(
        'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
        { encoding: 'utf-8', timeout: 5000 }
      );

      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, vram] = line.split(',').map((s) => s.trim());
          return {
            name: name ?? 'Unknown',
            vendor: 'nvidia' as const,
            vramGB: Math.round(parseInt(vram ?? '0') / 1024),
          };
        });
    } catch {
      return [];
    }
  }

  private async getSupportedModels(): Promise<string[]> {
    const models: string[] = [];
    for (const backend of this.backends) {
      models.push(...(await backend.listModels()));
    }
    return [...new Set(models)];
  }

  async getUtilization(): Promise<ResourceUtilization | null> {
    for (const backend of this.backends) {
      try {
        return await backend.getUtilization();
      } catch {
        continue;
      }
    }
    return null;
  }

  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  getBackends(): ExecutionBackend[] {
    return [...this.backends];
  }
}
