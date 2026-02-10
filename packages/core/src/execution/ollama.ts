import type { Job, JobOutput } from '@infernet/shared';
import type { ExecutionBackend, ResourceUtilization } from './engine.js';

export interface OllamaBackendOptions {
  baseUrl?: string;
  models?: string[];
}

/**
 * Execution backend that proxies inference requests to a local Ollama instance.
 * Ollama exposes a REST API at http://localhost:11434 by default.
 */
export class OllamaBackend implements ExecutionBackend {
  name = 'ollama';
  private baseUrl: string;
  private availableModels: string[] = [];

  constructor(options: OllamaBackendOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    if (options.models) {
      this.availableModels = options.models;
    }
  }

  supportsModel(model: string): boolean {
    if (this.availableModels.length === 0) return true; // accept any if not filtered
    return this.availableModels.some(
      (m) => m === model || model.startsWith(m)
    );
  }

  async execute(job: Job): Promise<JobOutput> {
    const start = Date.now();

    const body: Record<string, unknown> = {
      model: job.model,
      stream: false,
    };

    if (job.input.prompt) {
      // Chat completion
      body.messages = [{ role: 'user', content: job.input.prompt }];
    }

    // Forward any extra parameters
    if (job.input.parameters) {
      const { temperature, top_p, max_tokens, ...rest } = job.input.parameters as Record<string, unknown>;
      const options: Record<string, unknown> = {};
      if (temperature !== undefined) options.temperature = temperature;
      if (top_p !== undefined) options.top_p = top_p;
      if (max_tokens !== undefined) options.num_predict = max_tokens;
      if (Object.keys(options).length > 0) body.options = options;
      Object.assign(body, rest);
    }

    const endpoint = job.input.prompt ? '/api/chat' : '/api/generate';

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama request failed (${res.status}): ${text}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const executionTimeMs = Date.now() - start;

    // Ollama chat returns { message: { content: '...' } }
    // Ollama generate returns { response: '...' }
    const result = job.input.prompt
      ? (data.message as Record<string, string>)?.content
      : data.response as string;

    return {
      result: result ?? '',
      metadata: {
        model: data.model as string,
        backend: 'ollama',
        totalDuration: data.total_duration,
        evalCount: data.eval_count,
      },
      executionTimeMs,
      tokensUsed: (data.eval_count as number) ?? undefined,
    };
  }

  async getUtilization(): Promise<ResourceUtilization> {
    return {
      gpuUsagePercent: 0,
      gpuMemoryUsedGB: 0,
      gpuMemoryTotalGB: 0,
      cpuUsagePercent: 0,
      memoryUsedGB: 0,
      memoryTotalGB: 0,
      activeJobs: 0,
    };
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return this.availableModels;
      const data = await res.json() as { models: Array<{ name: string }> };
      this.availableModels = data.models.map((m) => m.name);
      return this.availableModels;
    } catch {
      return this.availableModels;
    }
  }

  async start(): Promise<void> {
    // Try to fetch models on startup to validate connection
    await this.listModels();
  }

  async stop(): Promise<void> {
    // No cleanup needed
  }
}
