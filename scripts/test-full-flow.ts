/**
 * Full end-to-end job flow test:
 *   broadcast → bid → escrow → assign → execute → result → release
 *
 * Run with: pnpm -w run test:flow
 */

import { InfernetNode } from '../packages/core/dist/index.js';
import type { Job, JobBidMessage, JobOutput, EscrowInfo } from '../packages/shared/dist/index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('=== Infernet Full Job Flow Test ===\n');

  // ─── 1. Start both nodes ───
  console.log('[1] Starting nodes...');

  const provider = new InfernetNode({
    nodeName: 'provider',
    listenAddresses: ['/ip4/127.0.0.1/tcp/0/ws'],
  });
  await provider.start();

  const client = new InfernetNode({
    nodeName: 'client',
    listenAddresses: ['/ip4/127.0.0.1/tcp/0/ws'],
    bootstrapPeers: provider.multiaddrs,
  });
  await client.start();

  await sleep(2000);
  console.log(`    Provider: ${provider.peerId.slice(0, 16)}...`);
  console.log(`    Client:   ${client.peerId.slice(0, 16)}...`);
  console.log(`    Connected: ${client.connectedPeers > 0 ? 'yes' : 'NO'}\n`);

  // ─── 2. Provider: listen for job broadcasts and auto-bid ───
  console.log('[2] Setting up provider auto-bid...');

  let providerReceivedJob: Job | null = null;
  let providerAssignedJob: Job | null = null;

  // Provider listens for broadcasts and bids on them
  provider.jobs.onJob((job) => {
    providerReceivedJob = job;
    console.log(`    [Provider] Got job broadcast: ${job.id.slice(0, 12)}...`);
    console.log(`    [Provider] Model: ${job.model}, Budget: $${job.pricing.maxBudget}`);

    // Auto-bid at 80% of max budget
    const bidPrice = job.pricing.maxBudget * 0.8;
    provider.jobs.bidOnJob(
      job.id,
      bidPrice,
      5000, // estimated 5s
      {}
    );
    console.log(`    [Provider] Submitted bid: $${bidPrice}`);
  });

  // Provider listens for assignment and executes
  const providerResultPromise = new Promise<JobOutput>((resolve) => {
    provider.on((event) => {
      // Listen for assignment via the messaging layer
    });

    // The job:assign handler in JobManager will update the job status.
    // We need a way to know when we're assigned. Let's poll the job.
    const checkAssignment = setInterval(async () => {
      if (!providerReceivedJob) return;
      const job = provider.jobs.getJob(providerReceivedJob.id);
      if (job && job.status === 'assigned' && job.providerPeerId === provider.peerId) {
        clearInterval(checkAssignment);
        providerAssignedJob = job;
        console.log(`    [Provider] Job assigned to us! Executing...`);

        // Execute the job (mock inference)
        const output: JobOutput = {
          result: `Inference result for "${job.input.prompt}" using ${job.model}`,
          metadata: {
            model: job.model,
            backend: 'mock',
            providerPeerId: provider.peerId,
          },
          executionTimeMs: 250,
          tokensUsed: 42,
        };

        await provider.jobs.submitResult(job.id, output);
        console.log(`    [Provider] Result submitted.`);
        resolve(output);
      }
    }, 100);
  });

  // ─── 3. Client: submit job ───
  console.log('\n[3] Client submitting job...');

  const job = await client.submitJob({
    model: 'llama-3-8b',
    input: {
      prompt: 'Explain quantum computing in one sentence.',
      parameters: { temperature: 0.5 },
    },
    pricing: {
      maxBudget: 1.00,
      currency: 'USDC_SOL',
    },
    requirements: {
      minReputationScore: 0,
    },
  });

  console.log(`    Job ID: ${job.id.slice(0, 12)}...`);
  console.log(`    Status: ${job.status}`);

  // ─── 4. Client: wait for bids, select best ───
  console.log('\n[4] Waiting for bids...');
  await sleep(2000);

  const bids: JobBidMessage[] = client.jobs.getBids(job.id);
  console.log(`    Received ${bids.length} bid(s)`);

  if (bids.length === 0) {
    console.log('    FAIL: No bids received. Aborting.');
    await cleanup(client, provider);
    process.exit(1);
  }

  // Pick cheapest bid
  const bestBid = bids.sort((a, b) => a.bidPrice - b.bidPrice)[0]!;
  console.log(`    Best bid: $${bestBid.bidPrice} from ${bestBid.providerPeerId.slice(0, 16)}...`);

  // ─── 5. Client: create mock escrow and assign ───
  console.log('\n[5] Creating escrow and assigning job...');

  const mockEscrow: EscrowInfo = {
    id: 'escrow-' + Math.random().toString(36).slice(2, 10),
    escrowAddress: '0xMOCK_ESCROW_ADDRESS',
    chain: 'SOL',
    amount: bestBid.bidPrice,
    depositorAddress: '0xCLIENT_WALLET',
    beneficiaryAddress: '0xPROVIDER_WALLET',
    releaseToken: 'mock-release-token-' + Date.now(),
    beneficiaryToken: 'mock-beneficiary-token',
    status: 'funded',
    expiresAt: Date.now() + 48 * 3600 * 1000,
  };
  console.log(`    Escrow ID: ${mockEscrow.id}`);
  console.log(`    Amount: $${mockEscrow.amount} on ${mockEscrow.chain}`);

  await client.jobs.assignJob(job.id, bestBid.providerPeerId, mockEscrow);
  console.log(`    Job assigned to provider.`);

  // ─── 6. Wait for provider to execute and return result ───
  console.log('\n[6] Waiting for execution result...');

  const providerOutput = await Promise.race([
    providerResultPromise,
    sleep(10000).then(() => null),
  ]);

  if (!providerOutput) {
    console.log('    FAIL: Timed out waiting for provider execution.');
    await cleanup(client, provider);
    process.exit(1);
  }

  // Wait a bit for the result message to propagate back
  await sleep(1000);

  // ─── 7. Client: check result and "release escrow" ───
  console.log('\n[7] Checking result on client side...');

  const completedJob = client.jobs.getJob(job.id);
  console.log(`    Job status: ${completedJob?.status}`);
  console.log(`    Job output: ${completedJob?.output?.result ?? '(none)'}`);
  console.log(`    Tokens used: ${completedJob?.output?.tokensUsed ?? 0}`);

  if (completedJob?.status === 'completed') {
    console.log(`    Releasing escrow ${mockEscrow.id}...`);
    // In production: await client.payments.releaseEscrow(mockEscrow.id, mockEscrow.releaseToken);
    console.log(`    Escrow released (mock). Payment complete.`);
  }

  // ─── 8. Summary ───
  console.log('\n=== Flow Summary ===');
  const steps = [
    ['1. Nodes connected',           client.connectedPeers > 0],
    ['2. Job broadcast sent',        !!providerReceivedJob],
    ['3. Provider bid received',     bids.length > 0],
    ['4. Escrow created',            !!mockEscrow.id],
    ['5. Job assigned',              !!providerAssignedJob],
    ['6. Provider executed',         !!providerOutput],
    ['7. Result received by client', completedJob?.status === 'completed'],
    ['8. Escrow released',           completedJob?.status === 'completed'],
  ] as const;

  for (const [name, passed] of steps) {
    console.log(`  ${passed ? 'PASS' : 'FAIL'} ${name}`);
  }

  const allPassed = steps.every(([, p]) => p);
  console.log(`\n${allPassed ? 'Full flow test passed!' : 'Some steps failed.'}\n`);

  await cleanup(client, provider);
  process.exit(allPassed ? 0 : 1);
}

async function cleanup(client: InfernetNode, provider: InfernetNode) {
  console.log('Stopping nodes...');
  await client.stop();
  await provider.stop();
  console.log('Done.\n');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
