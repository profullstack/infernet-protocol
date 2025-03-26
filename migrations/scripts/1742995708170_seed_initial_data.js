/**
 * Migration: Seed initial data
 * 
 * This migration seeds initial data for testing purposes.
 * It creates sample nodes, jobs, and other records to replace the mocked data.
 */

export async function up(pb) {
  console.log('Seeding initial data...');
  
  try {
    // Seed nodes
    console.log('Seeding nodes...');
    const nodes = [
      {
        name: 'Primary GPU Server',
        status: 'online',
        ip: '192.168.1.101',
        lastSeen: new Date().toISOString(),
        gpus: JSON.stringify([
          { name: 'NVIDIA RTX 4090', memory: '24GB', utilization: 92 },
          { name: 'NVIDIA RTX 4090', memory: '24GB', utilization: 78 }
        ]),
        cpus: JSON.stringify([
          { name: 'AMD Threadripper 5990X', cores: 64, utilization: 72 }
        ]),
        jobsCompleted: 156,
        uptime: '12d 5h 32m',
        reputation: 4.8
      },
      {
        name: 'Secondary GPU Server',
        status: 'online',
        ip: '192.168.1.102',
        lastSeen: new Date().toISOString(),
        gpus: JSON.stringify([
          { name: 'NVIDIA RTX 3090', memory: '24GB', utilization: 85 },
          { name: 'NVIDIA RTX 3090', memory: '24GB', utilization: 62 }
        ]),
        cpus: JSON.stringify([
          { name: 'Intel Core i9-12900K', cores: 16, utilization: 45 }
        ]),
        jobsCompleted: 98,
        uptime: '8d 12h 15m',
        reputation: 4.5
      },
      {
        name: 'High-Performance Compute Node',
        status: 'online',
        ip: '192.168.1.103',
        lastSeen: new Date().toISOString(),
        gpus: JSON.stringify([
          { name: 'NVIDIA A100', memory: '80GB', utilization: 78 },
          { name: 'NVIDIA A100', memory: '80GB', utilization: 65 },
          { name: 'NVIDIA A100', memory: '80GB', utilization: 92 },
          { name: 'NVIDIA A100', memory: '80GB', utilization: 88 }
        ]),
        cpus: JSON.stringify([
          { name: 'AMD EPYC 7763', cores: 128, utilization: 65 }
        ]),
        jobsCompleted: 312,
        uptime: '31d 8h 42m',
        reputation: 4.9
      },
      {
        name: 'Budget GPU Node',
        status: 'online',
        ip: '192.168.1.104',
        lastSeen: new Date().toISOString(),
        gpus: JSON.stringify([
          { name: 'NVIDIA RTX 3060', memory: '12GB', utilization: 45 }
        ]),
        cpus: JSON.stringify([
          { name: 'AMD Ryzen 7 5800X', cores: 8, utilization: 32 }
        ]),
        jobsCompleted: 42,
        uptime: '5d 3h 18m',
        reputation: 4.2
      },
      {
        name: 'Maintenance Node',
        status: 'maintenance',
        ip: '192.168.1.105',
        lastSeen: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        gpus: JSON.stringify([
          { name: 'NVIDIA RTX 4080', memory: '16GB', utilization: 0 }
        ]),
        cpus: JSON.stringify([
          { name: 'Intel Core i7-12700K', cores: 12, utilization: 5 }
        ]),
        jobsCompleted: 87,
        uptime: '0d 0h 0m',
        reputation: 4.0
      }
    ];
    
    const createdNodes = [];
    for (const node of nodes) {
      const record = await pb.collection('nodes').create(node);
      createdNodes.push(record);
    }
    
    // Seed clients
    console.log('Seeding clients...');
    const clients = [
      {
        name: 'Research Lab',
        publicKey: 'npub1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        totalSpent: 1250.75,
        jobsSubmitted: 325,
        lastActive: new Date().toISOString(),
        preferredModels: JSON.stringify(['llama-3-70b', 'mixtral-8x7b', 'stable-diffusion-xl'])
      },
      {
        name: 'AI Startup',
        publicKey: 'npub2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        totalSpent: 785.25,
        jobsSubmitted: 156,
        lastActive: new Date().toISOString(),
        preferredModels: JSON.stringify(['llama-3-8b', 'mistral-7b'])
      },
      {
        name: 'Individual Developer',
        publicKey: 'npub3xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        totalSpent: 42.50,
        jobsSubmitted: 28,
        lastActive: new Date().toISOString(),
        preferredModels: JSON.stringify(['llama-3-8b'])
      }
    ];
    
    const createdClients = [];
    for (const client of clients) {
      const record = await pb.collection('clients').create(client);
      createdClients.push(record);
    }
    
    // Seed models
    console.log('Seeding models...');
    const models = [
      {
        name: 'llama-3-70b',
        description: 'Meta AI Llama 3 70B parameter model',
        type: 'text',
        parameters: 70000000000,
        quantization: 'Q4_K_M',
        minVRAM: 48000,
        containerImage: 'infernet/llama-3-70b:latest',
        supportsTensorParallelism: true,
        supportsPipelineParallelism: true,
        averageTokensPerSecond: 32,
        pricePerToken: 0.000015
      },
      {
        name: 'llama-3-8b',
        description: 'Meta AI Llama 3 8B parameter model',
        type: 'text',
        parameters: 8000000000,
        quantization: 'Q4_K_M',
        minVRAM: 6000,
        containerImage: 'infernet/llama-3-8b:latest',
        supportsTensorParallelism: true,
        supportsPipelineParallelism: false,
        averageTokensPerSecond: 85,
        pricePerToken: 0.000002
      },
      {
        name: 'stable-diffusion-xl',
        description: 'Stable Diffusion XL image generation model',
        type: 'image',
        parameters: 2000000000,
        quantization: 'FP16',
        minVRAM: 12000,
        containerImage: 'infernet/sdxl:latest',
        supportsTensorParallelism: false,
        supportsPipelineParallelism: false,
        averageTokensPerSecond: null,
        pricePerToken: 0.02
      },
      {
        name: 'mistral-7b',
        description: 'Mistral 7B parameter model',
        type: 'text',
        parameters: 7000000000,
        quantization: 'Q4_K_M',
        minVRAM: 5000,
        containerImage: 'infernet/mistral-7b:latest',
        supportsTensorParallelism: true,
        supportsPipelineParallelism: false,
        averageTokensPerSecond: 90,
        pricePerToken: 0.000002
      },
      {
        name: 'mixtral-8x7b',
        description: 'Mixtral 8x7B MoE model',
        type: 'text',
        parameters: 47000000000,
        quantization: 'Q4_K_M',
        minVRAM: 24000,
        containerImage: 'infernet/mixtral-8x7b:latest',
        supportsTensorParallelism: true,
        supportsPipelineParallelism: true,
        averageTokensPerSecond: 45,
        pricePerToken: 0.00001
      }
    ];
    
    const createdModels = [];
    for (const model of models) {
      const record = await pb.collection('models').create(model);
      createdModels.push(record);
    }
    
    // Seed jobs
    console.log('Seeding jobs...');
    const jobs = [
      {
        model: 'stable-diffusion-xl',
        status: 'completed',
        runtime: '2m 34s',
        node: createdNodes[0].id,
        startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        endTime: new Date(Date.now() - 3600000 + 154000).toISOString(), // 2m 34s later
        inputTokens: 128,
        outputTokens: 1,
        cost: 0.02,
        client: createdClients[0].id,
        prompt: 'A futuristic city with flying cars and neon lights',
        result: 'https://storage.infernet.tech/results/job1.png'
      },
      {
        model: 'llama-3-70b',
        status: 'running',
        runtime: '15m 12s',
        node: createdNodes[2].id,
        startTime: new Date(Date.now() - 912000).toISOString(), // 15m 12s ago
        endTime: null,
        inputTokens: 2048,
        outputTokens: 512,
        cost: 0.0384,
        client: createdClients[1].id,
        prompt: 'Write a detailed analysis of the economic impact of AI on the global workforce over the next decade...',
        result: null
      },
      {
        model: 'mistral-7b',
        status: 'queued',
        runtime: '-',
        node: null,
        startTime: null,
        endTime: null,
        inputTokens: 512,
        outputTokens: null,
        cost: null,
        client: createdClients[2].id,
        prompt: 'Explain quantum computing to a 5-year-old',
        result: null
      },
      {
        model: 'mixtral-8x7b',
        status: 'completed',
        runtime: '1m 05s',
        node: createdNodes[1].id,
        startTime: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        endTime: new Date(Date.now() - 7200000 + 65000).toISOString(), // 1m 05s later
        inputTokens: 1024,
        outputTokens: 768,
        cost: 0.01792,
        client: createdClients[0].id,
        prompt: 'Summarize the latest research on large language models and their applications in healthcare',
        result: 'Large language models (LLMs) are increasingly being applied in healthcare settings...'
      }
    ];
    
    for (const job of jobs) {
      await pb.collection('jobs').create(job);
    }
    
    console.log('Initial data seeding complete');
    return true;
  } catch (error) {
    console.error('Error seeding initial data:', error);
    throw error;
  }
}

export async function down(pb) {
  // Clear all seeded data
  console.log('Removing seeded data...');
  
  try {
    // Delete all records from collections in reverse order to avoid foreign key constraints
    await pb.collection('jobs').getFullList().then(records => {
      return Promise.all(records.map(record => pb.collection('jobs').delete(record.id)));
    });
    
    await pb.collection('models').getFullList().then(records => {
      return Promise.all(records.map(record => pb.collection('models').delete(record.id)));
    });
    
    await pb.collection('clients').getFullList().then(records => {
      return Promise.all(records.map(record => pb.collection('clients').delete(record.id)));
    });
    
    await pb.collection('nodes').getFullList().then(records => {
      return Promise.all(records.map(record => pb.collection('nodes').delete(record.id)));
    });
    
    console.log('Seeded data removed successfully');
    return true;
  } catch (error) {
    console.error('Error removing seeded data:', error);
    throw error;
  }
}
