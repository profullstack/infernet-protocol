/**
 * Test script: spin up two InfernetNodes locally, connect them,
 * and run through the full job lifecycle.
 *
 * Run with: pnpm test:nodes
 */

import { InfernetNode } from '../packages/core/dist/index.js';
import type { Job, JobOutput } from '../packages/shared/dist/index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('=== Infernet Two-Node Test ===\n');

  // --- 1. Create & start the provider node ---
  console.log('[1] Starting provider node...');
  const provider = new InfernetNode({
    nodeName: 'provider-1',
    listenAddresses: ['/ip4/127.0.0.1/tcp/0/ws'],
  });

  await provider.start();
  const providerAddrs = provider.multiaddrs;
  console.log(`    Provider peer ID: ${provider.peerId}`);
  console.log(`    Provider addrs:   ${providerAddrs.join(', ')}\n`);

  // --- 2. Create & start the client node, bootstrapping to provider ---
  console.log('[2] Starting client node...');
  const client = new InfernetNode({
    nodeName: 'client-1',
    listenAddresses: ['/ip4/127.0.0.1/tcp/0/ws'],
    bootstrapPeers: providerAddrs,
  });

  await client.start();
  console.log(`    Client peer ID:   ${client.peerId}`);
  console.log(`    Client addrs:     ${client.multiaddrs.join(', ')}\n`);

  // Wait for peer discovery
  await sleep(2000);

  console.log(`    Client connected peers: ${client.connectedPeers}`);
  console.log(`    Provider connected peers: ${provider.connectedPeers}\n`);

  if (client.connectedPeers === 0) {
    // Try direct dial if bootstrap didn't connect them
    console.log('    Bootstrap did not connect them, dialing directly...');
    const providerAddr = providerAddrs[0];
    if (providerAddr) {
      await client.dial(providerAddr);
      await sleep(1000);
      console.log(`    Client connected peers after dial: ${client.connectedPeers}\n`);
    }
  }

  // --- 3. Set up provider to handle incoming jobs ---
  console.log('[3] Registering provider job handler...');

  let jobReceivedByProvider: Job | null = null;
  let resultSentByProvider: JobOutput | null = null;

  provider.onJob(async (job) => {
    jobReceivedByProvider = job;
    console.log(`    [Provider] Received job: ${job.id}`);
    console.log(`    [Provider] Model: ${job.model}`);
    console.log(`    [Provider] Prompt: ${job.input.prompt}`);

    // Simulate inference
    const output: JobOutput = {
      result: `Hello from provider! The answer to "${job.input.prompt}" is 42.`,
      metadata: { model: job.model, backend: 'mock' },
      executionTimeMs: 150,
      tokensUsed: 12,
    };
    resultSentByProvider = output;
    return output;
  });

  // --- 4. Client submits a job ---
  console.log('\n[4] Client submitting job...');

  // Listen for events on both sides
  const clientEvents: string[] = [];
  const providerEvents: string[] = [];

  client.on((event) => {
    clientEvents.push(event.type);
    if (event.type === 'job:completed') {
      console.log(`    [Client] Job completed! Result: ${event.output.result}`);
    }
  });

  provider.on((event) => {
    providerEvents.push(event.type);
  });

  const job = await client.submitJob({
    model: 'llama-3-8b',
    input: {
      prompt: 'What is the meaning of life?',
      parameters: { temperature: 0.7 },
    },
    pricing: {
      maxBudget: 0.50,
      currency: 'USDC_SOL',
    },
  });

  console.log(`    Job created: ${job.id}`);
  console.log(`    Job status: ${job.status}`);

  // Wait for the job to flow through the protocol
  await sleep(3000);

  // --- 5. Check results ---
  console.log('\n[5] Results:');
  console.log(`    Job received by provider: ${!!jobReceivedByProvider}`);
  console.log(`    Result sent by provider:  ${!!resultSentByProvider}`);
  console.log(`    Client events: ${clientEvents.join(', ') || '(none)'}`);
  console.log(`    Provider events: ${providerEvents.join(', ') || '(none)'}`);

  // Check the job state on the client side
  const clientJob = client.jobs.getJob(job.id);
  console.log(`    Client job status: ${clientJob?.status}`);
  console.log(`    Client job output: ${clientJob?.output?.result ?? '(none)'}`);

  // --- 6. Test identity/peer discovery ---
  console.log('\n[6] Peer discovery:');
  const clientPeers = client.identity.getAllPeers();
  const providerPeers = provider.identity.getAllPeers();
  console.log(`    Peers known to client:   ${clientPeers.map(p => p.peerId.slice(0, 12) + '...').join(', ')}`);
  console.log(`    Peers known to provider: ${providerPeers.map(p => p.peerId.slice(0, 12) + '...').join(', ')}`);

  // --- 7. Summary ---
  console.log('\n=== Summary ===');
  const checks = [
    ['Nodes started', client.isStarted && provider.isStarted],
    ['Peers connected', client.connectedPeers > 0 && provider.connectedPeers > 0],
    ['Job broadcast received', !!jobReceivedByProvider],
    ['Result returned', !!resultSentByProvider],
    ['Job completed on client', clientJob?.status === 'completed'],
  ] as const;

  for (const [name, passed] of checks) {
    console.log(`  ${passed ? 'PASS' : 'FAIL'} ${name}`);
  }

  const allPassed = checks.every(([, p]) => p);
  console.log(`\n${allPassed ? 'All checks passed!' : 'Some checks failed.'}\n`);

  // --- Cleanup ---
  console.log('Stopping nodes...');
  await client.stop();
  await provider.stop();
  console.log('Done.\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
