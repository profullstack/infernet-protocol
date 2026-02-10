import type { Job, JobOutput } from '@infernet/shared';
import type { ExecutionBackend, ResourceUtilization } from './engine.js';

export interface OpenAIBackendOptions {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  defaultModel?: string;
}

/**
 * Execution backend that proxies inference to any OpenAI-compatible API.
 * Works with OpenAI, Together AI, Groq, vLLM, LiteLLM, etc.
 */
export class OpenAIBackend implements ExecutionBackend {
  name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private models: string[];
  private defaultModel: string;

  constructor(options: OpenAIBackendOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.models = options.models ?? [];
    this.defaultModel = options.defaultModel ?? 'gpt-4o-mini';
  }

  supportsModel(model: string): boolean {
    if (this.models.length === 0) return true;
    return this.models.some((m) => m === model || model.startsWith(m));
  }

  async execute(job: Job): Promise<JobOutput> {
    const start = Date.now();

    const model = job.model || this.defaultModel;
    const messages: Array<{ role: string; content: string }> = [];

    if (job.input.prompt) {
      messages.push({ role: 'user', content: job.input.prompt });
    }

    const body: Record<string, unknown> = {
      model,
      messages,
    };

    // Forward parameters
    if (job.input.parameters) {
      const { temperature, top_p, max_tokens, ...rest } = job.input.parameters as Record<string, unknown>;
      if (temperature !== undefined) body.temperature = temperature;
      if (top_p !== undefined) body.top_p = top_p;
      if (max_tokens !== undefined) body.max_tokens = max_tokens;
      Object.assign(body, rest);
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI request failed (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number; completion_tokens: number };
      model: string;
    };

    const executionTimeMs = Date.now() - start;

    return {
      result: data.choices[0]?.message?.content ?? '',
      metadata: {
        model: data.model,
        backend: 'openai',
        usage: data.usage,
      },
      executionTimeMs,
      tokensUsed: data.usage?.total_tokens,
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
    if (this.models.length > 0) return this.models;

    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return [this.defaultModel];
      const data = await res.json() as { data: Array<{ id: string }> };
      this.models = data.data.map((m) => m.id);
      return this.models;
    } catch {
      return [this.defaultModel];
    }
  }

  async start(): Promise<void> {
    // Validate API key by listing models
    await this.listModels();
  }

  async stop(): Promise<void> {
    // No cleanup needed
  }
}
