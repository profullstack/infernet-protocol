# PRD: `infernet train` — Distributed Training + Custom Model Pipeline

**Project:** Infernet Protocol  
**Repo:** `profullstack/infernet-protocol`  
**Feature Area:** CLI, provider daemon, job scheduler, training workloads, model artifacts  
**Status:** Draft v0.2  
**Primary Goal:** Add a production-grade `infernet train ...` command family that lets users run practical training today, while designing Infernet as a mega-model-capable distributed AI execution network for large-model inference, adapter training, federated training, distillation, synthetic data generation, evals, and experimental decentralized pretraining.

---

## 1. Feasibility Summary

Yes, this is feasible. Infernet can support mega-model workflows, but v0.1 should avoid pretending that permissionless public P2P can immediately replace a hyperscaler cluster for tight-sync dense frontier pretraining. The right wedge is:

1. **Single-node and provider-cluster fine-tunes**
2. **LoRA / QLoRA / adapter jobs**
3. **Embarrassingly parallel training sweeps**
4. **Async / federated / DiLoCo-style distributed training**
5. **Custom model packaging and serving integration after training**
6. **Mega-model inference by partitioning/replicating model workloads across capable peers**
7. **Adapter training and federated training over large base models**
8. **Experimental decentralized pretraining where the protocol can tolerate slow, lossy, heterogeneous peers**

Infernet already positions itself around workloads that do not need NVLink, including LoRA fine-tunes and async/federated distributed training, while explicitly avoiding tight-sync 100B+ training from scratch. That fits this feature perfectly.

The Karpathy `microgpt.py` gist is useful as a tiny reference implementation because it shows the complete algorithmic path for GPT training and inference in dependency-free Python. It is not a production trainer, but it is perfect as an educational fixture, smoke test, deterministic toy model, and CI/debug trainer.

The Karpathy LLM wiki gist is useful as a pattern for keeping training runs, datasets, model cards, hyperparameters, benchmarks, and evaluation notes as persistent markdown artifacts rather than rediscovering them from logs every time.

Modular/MAX is useful as inspiration for the serving and custom-model developer experience: one CLI, hardware detection, model endpoint creation, OpenAI-compatible inference, custom model architecture support, and hardware-portable kernels. Infernet should not copy Modular; Infernet should make this decentralized, open, provider-neutral, and marketplace-native.

## 1.1 Mega-Model Feasibility Position

Infernet should not say "P2P means we can trivially train GPT-5 from scratch." That claim is weak and easy to attack. The stronger claim is:

> Infernet is a distributed AI execution network that starts with inference, LoRA/QLoRA, evals, synthetic data, distillation, and federated/adaptor training, then evolves toward decentralized large-scale pretraining where the protocol can handle unreliable heterogeneous peers.

Mega-model support should be treated as a staged capability:

| Stage | Capability | Feasibility | Product Promise |
|---|---|---:|---|
| 0 | Deterministic toy training | Immediate | Prove node/job lifecycle with `microgpt` |
| 1 | Single-provider LoRA/QLoRA | Immediate | Fine-tune useful models on one GPU/provider |
| 2 | Parallel sweeps/evals/distillation | Immediate | Scale useful work horizontally across peers |
| 3 | Large-model inference | High | Route big model inference over capable providers and provider clusters |
| 4 | Distributed adapter training | Medium-high | Train LoRA/adapters over large base models without full dense updates |
| 5 | Async/federated training | Medium | Aggregate peer updates with fault tolerance and reputation |
| 6 | Mixture-of-experts/routed training | Research/productizable | Train or specialize experts across peers |
| 7 | Dense frontier pretraining | Long-term research | Experimental only until networking, economics, verification, and reliability are solved |

The technical blocker for naive mega-model training is not only GPU count. It is repeated synchronization of gradients, optimizer state, activations, checkpoints, and parameters across slow/unreliable peers. Datacenter training assumes fast low-latency networking and stable machines. Public P2P assumes NATs, variable uptime, heterogeneous GPUs, residential bandwidth, cloud spot interruptions, and untrusted participants.

Therefore, Infernet should be mega-model-capable by architecture, not by overpromising v0.1 dense synchronous training.

## 1.2 Mega-Model Design Principle

Infernet training should prefer distributed patterns that survive the real internet:

- Split work into independently useful chunks where possible.
- Prefer adapters, deltas, experts, synthetic data, evals, and checkpoints over full parameter synchronization.
- Use async/federated aggregation before tight-sync all-reduce.
- Group peers by region/network quality for jobs that need lower latency.
- Reward completed/verifiable useful work, not claimed compute.
- Use reputation, staking/slashing later, and cryptographic signatures for job lineage.
- Make all artifacts reproducible: config, dataset hash, base model hash, checkpoints, evals, logs, and provider metadata.

---

## 2. Background / Current Infernet Context

Infernet is a decentralized GPU compute marketplace for inference and distributed training. Providers run GPU nodes, authenticate with Nostr-signed HTTP requests, and do not hold database credentials. The repo already documents a control plane, provider daemon, Supabase-backed job tables, provider payouts, and pluggable inference engines including Ollama, vLLM, Mojo+MAX, and stubs.

Current documented CLI surface includes:

```bash
infernet init
infernet login
infernet register
infernet update
infernet remove
infernet start
infernet stop
infernet status
infernet stats
infernet logs
infernet payout
infernet payments
infernet gpu
infernet firewall
```

This PRD adds:

```bash
infernet train ...
infernet dataset ...
infernet model ...
infernet eval ...
```

The feature should integrate with the existing job/event/provider architecture instead of creating a separate training-only system.

---

## 3. Product Goals

### 3.1 User Goals

Users should be able to:

- Fine-tune an open model with one CLI command.
- Run LoRA/QLoRA jobs on cheap decentralized GPUs.
- Launch multiple hyperparameter sweeps across providers.
- Resume failed training jobs from checkpoints.
- Export artifacts to local disk, Hugging Face, S3-compatible storage, or Infernet model registry.
- Serve the trained model or adapter through existing Infernet inference paths.
- See cost estimates before launching.
- See live logs, metrics, loss curves, provider status, and final eval summaries.

### 3.2 Provider Goals

Providers should be able to:

- Advertise training capability separately from inference capability.
- Accept or reject training jobs by workload class, VRAM, disk, runtime, trust level, and max job duration.
- Earn more for long-running training workloads than short inference requests.
- Run jobs safely in containers with resource limits and no access to host secrets.
- Keep outbound-only mode where possible.

### 3.3 Infernet Protocol Goals

Infernet should become the easiest way to rent decentralized GPUs for practical model improvement:

- Not "train GPT-5 from scratch."
- Yes: LoRA fine-tunes, small models, adapters, dataset-specific tuning, sweeps, evals, distillation, toy training, federated/async experiments.

---

## 4. Non-Goals

For v0.1, do **not** attempt:

- Tight-sync distributed training that requires NVLink/InfiniBand/RDMA.
- Fully general PyTorch distributed replacement.
- Untrusted arbitrary host execution without container sandboxing.
- Guaranteed deterministic results across heterogeneous GPUs.
- Marketplace insurance for bad datasets, poisoned data, or illegal content.
- Promising production-grade dense frontier-model pretraining from scratch over arbitrary public peers in v0.1.
- Native custom CUDA/HIP/Mojo kernel authoring as the first milestone.

Long-term experimental research is allowed behind explicit flags such as `--experimental`, but it must not be marketed as reliable production capability until proven.

---

## 5. Proposed CLI UX

### 5.1 Basic Fine-Tune

```bash
infernet train start \
  --base-model mistralai/Mistral-7B-v0.1 \
  --dataset ./data/support-tickets.jsonl \
  --method lora \
  --output ./runs/support-lora
```

Expected behavior:

1. Validates dataset format.
2. Estimates VRAM, disk, runtime, and price.
3. Finds compatible providers.
4. Uploads or stages dataset.
5. Creates signed training job.
6. Streams logs and metrics.
7. Downloads final adapter/model artifacts.

### 5.2 Dry Run / Estimate

```bash
infernet train estimate \
  --base-model qwen/Qwen2.5-7B \
  --dataset ./data/train.jsonl \
  --method qlora \
  --max-price-usd 25
```

Outputs:

```txt
Estimated workload: LoRA fine-tune
Base model: qwen/Qwen2.5-7B
Dataset rows: 42,318
Estimated tokens: 18.7M
Minimum VRAM: 24GB
Recommended VRAM: 48GB
Estimated runtime: 2h 15m - 4h 40m
Estimated cost: $8.20 - $21.75
Compatible providers: 17
```

### 5.3 Config-Driven Training

```bash
infernet train start --config infernet.train.yml
```

Example:

```yaml
name: support-ticket-lora-v1
base_model: qwen/Qwen2.5-7B-Instruct
method: qlora
runtime: axolotl
workload_class: C

input:
  dataset: ./data/support.jsonl
  format: chatml
  validation_split: 0.05

training:
  epochs: 3
  learning_rate: 0.0002
  batch_size: 4
  gradient_accumulation_steps: 8
  max_seq_len: 4096
  seed: 42

lora:
  rank: 16
  alpha: 32
  dropout: 0.05
  target_modules:
    - q_proj
    - k_proj
    - v_proj
    - o_proj

resources:
  min_vram_gb: 24
  preferred_vram_gb: 48
  max_runtime_hours: 8
  max_price_usd: 30
  allow_preemptible: true

outputs:
  artifact_store: infernet
  download: ./runs/support-ticket-lora-v1
  publish_model_card: true
```

### 5.4 Training Job Management

```bash
infernet train list
infernet train status <job_id>
infernet train logs <job_id> --follow
infernet train metrics <job_id>
infernet train cancel <job_id>
infernet train resume <job_id>
infernet train artifacts <job_id>
infernet train download <job_id> --output ./runs/job
infernet train topology <job_id>
infernet train verify <job_id>
```

### 5.5 Dataset Commands

```bash
infernet dataset validate ./data/train.jsonl --format chatml
infernet dataset stats ./data/train.jsonl
infernet dataset split ./data/train.jsonl --validation 0.05 --test 0.05
infernet dataset upload ./data/train.jsonl --name support-v1
infernet dataset list
infernet dataset remove <dataset_id>
```

### 5.6 Model Commands

```bash
infernet model import hf://qwen/Qwen2.5-7B-Instruct
infernet model list
infernet model artifacts <model_id>
infernet model serve <model_or_adapter_id>
infernet model push <model_or_adapter_id> --to hf://profullstack/support-lora-v1
```

### 5.7 Evaluation Commands

```bash
infernet eval start \
  --model ./runs/support-lora-v1 \
  --dataset ./data/eval.jsonl \
  --tasks perplexity,chat-regression,json-validity

infernet eval report <eval_id>
```

### 5.8 Mega-Model / Experimental Commands

These commands should exist as roadmap-visible stubs in v0.1 and become functional in later milestones.

Large-model inference-oriented placement:

```bash
infernet model deploy-large \
  --model meta-llama/Llama-3.1-70B-Instruct \
  --strategy replicated-shards \
  --min-vram-total-gb 160 \
  --region us-west
```

Distributed adapter training:

```bash
infernet train adapter-distributed \
  --base-model meta-llama/Llama-3.1-70B-Instruct \
  --dataset ./data/domain.jsonl \
  --strategy async-federated \
  --aggregation fedavg \
  --compression q8 \
  --checkpoint-every 500
```

Experimental decentralized pretraining:

```bash
infernet train pretrain \
  --config infernet.pretrain.yml \
  --strategy swarm \
  --topology regional \
  --fault-tolerant \
  --experimental
```

Rules:

- `pretrain` must require `--experimental` until the protocol is proven.
- CLI output must warn users when a strategy is research-grade.
- The scheduler must prefer stable provider clusters for high-sync workloads.
- Public P2P peers should be used first for async, sharded, replicated, or embarrassingly parallel work.

---

## 6. Workload Classes

Infernet should extend the existing workload class model:

| Class | Name | Description | v0.1 Support |
|---|---|---|---|
| A | Single GPU real-time inference | Existing inference workloads | Existing |
| B | Provider-local multi-GPU | vLLM/Ray or local provider cluster | Existing / extend |
| C1 | Single-provider training | One GPU or one provider-owned multi-GPU box | Yes |
| C2 | Sweep training | Many independent jobs across providers | Yes |
| C3 | Async distributed training | DiLoCo/OpenDiLoCo/Hivemind-style | Experimental |
| C4 | Cross-provider tight-sync training | Requires low-latency fabric | No |
| D1 | Mega-model inference | Large model served by provider clusters, replicated shards, or partitioned layers | Roadmap |
| D2 | Distributed adapter training | LoRA/adapters over large base models with async/federated aggregation | Experimental |
| D3 | MoE/routed expert training | Specialize experts across peers or provider clusters | Research |
| D4 | Dense decentralized pretraining | Full model pretraining across unreliable public peers | Research only |

---

## 7. Training Runtimes

### 7.1 v0.1 Runtime Targets

Implement runtime adapters, not hardcoded trainers.

Required adapters:

1. `microgpt` — tiny deterministic reference trainer for CI, docs, local smoke tests.
2. `transformers` — standard Hugging Face Trainer path.
3. `trl` — SFTTrainer / preference-tuning path.
4. `axolotl` — YAML-driven LoRA/QLoRA production path.
5. `unsloth` — optional fast LoRA/QLoRA path where compatible.

Experimental adapters:

1. `opendiloco`
2. `openrlhf`
3. `hivemind`
4. `max` / `mojo` custom-model compile-and-serve path

### 7.2 Runtime Adapter Interface

Create package:

```txt
packages/training-runtimes/
  src/
    index.js
    runtimes/
      microgpt.js
      transformers.js
      trl.js
      axolotl.js
      unsloth.js
      max.js
```

Interface:

```js
export class TrainingRuntime {
  name = 'axolotl'

  async validateConfig(config, context) {}
  async estimate(config, context) {}
  async prepareWorkspace(config, context) {}
  async buildContainerSpec(config, context) {}
  async parseMetrics(line, context) {}
  async collectArtifacts(workspace, context) {}
}
```

---

## 8. `microgpt` Reference Trainer

Karpathy's `microgpt.py` should be adapted as:

```txt
examples/trainers/microgpt/
  microgpt.py
  README.md
  input.txt
  infernet.train.yml
```

Use cases:

- CI smoke test.
- CPU-only local demo.
- Provider sandbox validation.
- End-to-end job lifecycle test.
- Educational "this is what training is doing" example.

CLI example:

```bash
infernet train start \
  --runtime microgpt \
  --dataset ./examples/trainers/microgpt/input.txt \
  --epochs 1 \
  --local
```

Acceptance criteria:

- Runs on CPU.
- Completes in under 2 minutes in CI.
- Produces a checkpoint artifact.
- Produces a generated sample.
- Produces metrics JSONL.
- Produces a model card markdown file.

---

## 9. Training Knowledge Base / Run Wiki

Borrow the useful part of the LLM wiki pattern: every training run should produce persistent markdown + machine-readable artifacts.

For every job, write:

```txt
runs/<job_id>/
  README.md
  config.yml
  metrics.jsonl
  events.jsonl
  model-card.md
  dataset-card.md
  eval-report.md
  logs/
    train.log
  artifacts/
    adapter_model.safetensors
    adapter_config.json
```

Also maintain:

```txt
runs/index.md
runs/log.md
models/index.md
```

`runs/index.md` should summarize all runs.  
`runs/log.md` should be append-only.  
`model-card.md` should include dataset, base model, method, hyperparameters, evals, limitations, and reproducibility notes.

---

## 10. Architecture

### 10.1 Components

```txt
CLI
 ├─ train commands
 ├─ dataset commands
 ├─ model commands
 └─ eval commands

Control Plane
 ├─ training_jobs
 ├─ training_job_events
 ├─ training_artifacts
 ├─ datasets
 ├─ model_registry
 └─ provider_training_capabilities

Provider Daemon
 ├─ polls for training jobs
 ├─ validates container/runtime policy
 ├─ creates workspace
 ├─ downloads model/dataset
 ├─ runs container
 ├─ streams logs/metrics/events
 ├─ uploads checkpoints/artifacts
 └─ reports final status

Artifact Store
 ├─ local filesystem for dev
 ├─ S3-compatible storage
 ├─ Supabase storage optional
 └─ Hugging Face push optional
```

### 10.2 Job Flow

1. User runs `infernet train start`.
2. CLI validates config and dataset.
3. CLI estimates resources and price.
4. CLI creates signed training job with control plane.
5. Scheduler selects compatible provider or provider cluster.
6. Provider daemon polls job.
7. Provider downloads staged dataset and base model.
8. Provider launches sandboxed container.
9. Runtime emits logs and metrics.
10. Provider sends events to control plane.
11. Provider uploads checkpoints and final artifacts.
12. CLI downloads artifacts and writes run wiki.
13. Optional: publish model/adapters to registry or serve directly.

## 10.3 Mega-Model Architecture Additions

Add a separate planner for large-model and experimental distributed training jobs.

```txt
MegaModel Planner
 ── model partition planner
 ── peer topology planner
 ── bandwidth/latency estimator
 ── checkpoint coordinator
 ── async aggregation coordinator
 ── reputation/verifier hooks
 ── failure recovery planner
```

### 10.3.1 Topology Modes

```txt
single-provider       One provider owns all GPUs for the job
provider-cluster      One provider exposes a local multi-GPU cluster
regional-swarm        Multiple providers in same/near region
public-swarm          Permissionless peers, async/fault-tolerant only
hybrid                Stable coordinator + public workers
```

### 10.3.2 Strategy Modes

```txt
replicated-inference  Multiple full/partial replicas for serving
layer-partitioned     Assign model blocks/layers to peers or clusters
adapter-federated     Peers train adapters locally; coordinator aggregates
diloco-style          Inner local optimization + periodic outer synchronization
moe-routed            Peers specialize/train experts or route expert workloads
dense-sync            Requires stable high-speed cluster; not public P2P v0.1
```

### 10.3.3 Required Mega-Model Metadata

Every large/distributed job should store:

- topology mode
- strategy mode
- peer list and provider capabilities
- latency/bandwidth estimates
- model partition map
- checkpoint map
- aggregation schedule
- retry/failover policy
- verification policy
- cost model
- trust/reputation requirements

### 10.3.4 Verification Strategy

Infernet should assume peers may be slow, buggy, or malicious. Add verification progressively:

1. Hash all inputs, configs, checkpoints, and artifacts.
2. Require signed provider events and signed artifact manifests.
3. Run deterministic `microgpt` provider self-tests.
4. Add spot-check evals for completed artifacts.
5. Add duplicate assignment for small verification batches.
6. Add reputation scoring based on completed jobs, failed jobs, late jobs, invalid artifacts, and disputed outputs.
7. Later: explore proof-of-learning/proof-of-training style verification, but do not make it a v0.1 dependency.

---

## 11. Database / Schema Additions

See IPIP-0023 for the normative schema specification.

---

## 12. Provider Capability Detection

Extend GPU detection to include training-specific capabilities:

```json
{
  "training": {
    "supports_training": true,
    "runtimes": ["microgpt", "transformers", "trl", "axolotl"],
    "cuda": "12.4",
    "rocm": null,
    "vram_gb": 48,
    "disk_free_gb": 800,
    "max_job_hours": 12,
    "container_runtime": "docker",
    "network_policy": "outbound-only",
    "preemptible": true,
    "supports_large_model_inference": true,
    "supports_adapter_training": true,
    "supports_async_federated": false,
    "network": {
      "region": "us-west",
      "estimated_down_mbps": 950,
      "estimated_up_mbps": 850,
      "nat_type": "public"
    }
  }
}
```

Provider config:

```bash
infernet train provider enable \
  --runtimes microgpt,transformers,trl,axolotl \
  --max-job-hours 12 \
  --ephemeral-disk-gb 500
```

---

## 13. Security Requirements

Training jobs are higher risk than inference jobs because they involve longer runtimes, datasets, artifact uploads, and potentially arbitrary code paths.

Required controls:

- Run training inside containers only.
- No host mounts except job workspace and read-only model cache.
- No provider secrets mounted into training container.
- Job workspace gets unique random path.
- Enforce disk, memory, process, and runtime limits.
- Default network policy: outbound HTTPS only.
- Optional no-network mode after model/dataset staging.
- Signed job manifests.
- Dataset and artifact SHA-256 verification.
- Logs sanitized for known secret patterns.
- Provider may deny private dataset jobs unless explicitly enabled.
- No arbitrary Docker image by default; images must be allowlisted by runtime adapter.

---

## 14. Artifact Storage

v0.1 should support:

1. Local filesystem for dev/self-hosted.
2. S3-compatible object storage.
3. Supabase Storage if already available.
4. Hugging Face Hub push as optional post-processing.

Artifact layout:

```txt
infernet://artifacts/<job_id>/
  config.yml
  metrics.jsonl
  train.log
  model-card.md
  adapter_model.safetensors
  adapter_config.json
  tokenizer.json
  tokenizer_config.json
```

---

## 15. Price Estimation

`infernet train estimate` should calculate:

- Dataset rows.
- Approximate token count.
- Base model size.
- Method multiplier: full fine-tune vs LoRA vs QLoRA.
- Required VRAM.
- Expected disk.
- Runtime range.
- Provider price range.
- Artifact storage cost if applicable.

---

## 16. Scheduler Matching

Provider selection must consider:

- Runtime support.
- GPU vendor.
- VRAM.
- Disk.
- Max runtime.
- Price.
- Reputation.
- Historical job completion rate.
- Artifact bandwidth.
- Provider allowlist/blocklist.
- Whether the provider already has the base model cached.

---

## 17. Custom Model / MAX-Inspired Path

Future command:

```bash
infernet train compile \
  --model ./models/custom-transformer \
  --target max \
  --hardware auto
```

v0.1 should only stub this path:

```txt
packages/training-runtimes/src/runtimes/max.js
engine/mojo/training/README.md
docs/custom-models.md
```

---

## 18. Files / Package Plan

Add:

```txt
apps/cli/commands/train.js
apps/cli/commands/dataset.js
apps/cli/commands/eval.js

packages/training-core/
  src/config.js
  src/estimate.js
  src/dataset.js
  src/artifacts.js
  src/model-card.js
  src/run-wiki.js

packages/training-runtimes/
  src/index.js
  src/runtimes/microgpt.js
  src/runtimes/transformers.js
  src/runtimes/trl.js
  src/runtimes/axolotl.js
  src/runtimes/unsloth.js
  src/runtimes/max.js

packages/training-provider/
  src/runner.js
  src/workspace.js
  src/container.js
  src/metrics.js
  src/artifacts.js

examples/trainers/microgpt/
  microgpt.py
  input.txt
  infernet.train.yml
  README.md

docs/training.md
docs/datasets.md
docs/model-artifacts.md
docs/custom-models.md

supabase/migrations/<timestamp>_training_jobs.sql
```

---

## 19. API Endpoints

```txt
POST   /api/v1/train/jobs
GET    /api/v1/train/jobs
GET    /api/v1/train/jobs/:id
POST   /api/v1/train/jobs/:id/cancel
POST   /api/v1/train/jobs/:id/events
POST   /api/v1/train/jobs/:id/metrics
POST   /api/v1/train/jobs/:id/artifacts
GET    /api/v1/train/jobs/:id/artifacts

POST   /api/v1/datasets
GET    /api/v1/datasets
GET    /api/v1/datasets/:id
DELETE /api/v1/datasets/:id

POST   /api/v1/provider/training/capabilities
GET    /api/v1/provider/training/jobs/poll
POST   /api/v1/provider/training/jobs/:id/claim
POST   /api/v1/provider/training/jobs/:id/status

POST   /api/v1/train/jobs/:id/topology
GET    /api/v1/train/jobs/:id/topology
POST   /api/v1/train/jobs/:id/checkpoints
GET    /api/v1/train/jobs/:id/checkpoints
POST   /api/v1/train/jobs/:id/verify
```

All provider endpoints must use the existing signed request envelope pattern.

---

## 20. Testing Plan

### 20.1 Unit Tests

- Config parser.
- Dataset validator.
- Token estimate function.
- Runtime adapter validation.
- Price estimation.
- Artifact manifest generation.
- Model-card generation.

### 20.2 Integration Tests

- Local `microgpt` training job.
- Dataset upload + SHA verification.
- Provider claim + job lifecycle.
- Metrics streaming.
- Artifact upload + download.
- Cancel job.
- Resume from checkpoint.

### 20.3 E2E Tests

```bash
pnpm test:e2e:training
```

Scenario:

1. Start local Supabase/control plane.
2. Start local fake provider.
3. Submit `microgpt` job.
4. Stream logs.
5. Complete job.
6. Download artifact.
7. Verify `model-card.md` and `metrics.jsonl` exist.

---

## 21. Milestones

### Milestone 1 — CLI Skeleton + Config

- Add `infernet train help`.
- Add `infernet train estimate`.
- Add config parser.
- Add dataset validator.
- Add docs.

### Milestone 2 — Local Training Mode

- Add `--local` runner.
- Add `microgpt` runtime.
- Generate run wiki files.
- Add local artifacts.

### Milestone 3 — Control Plane Job Lifecycle

- Add DB migrations.
- Add job endpoints.
- Add events and metrics.
- Add CLI job list/status/logs.

### Milestone 4 — Provider Training Runner

- Add provider capabilities.
- Add job polling/claiming.
- Add sandboxed container runner.
- Add artifact upload.

### Milestone 5 — LoRA/QLoRA Runtime

- Add `transformers`, `trl`, and/or `axolotl` adapter.
- Add Hugging Face model/dataset handling.
- Add checkpoint resume.
- Add eval report.

### Milestone 6 — Registry + Serve

- Add `infernet model artifacts`.
- Add `infernet model serve` for adapter-backed inference.
- Add model-card publishing.

### Milestone 7 — Experimental Async Distributed Training

- Add OpenDiLoCo/Hivemind/OpenRLHF experiment path.
- Add multi-provider coordinator.
- Add failure/retry semantics.

### Milestone 8 — Mega-Model Inference Roadmap

- Add `infernet model deploy-large` stub.
- Add topology planner interfaces.
- Add provider cluster capability reporting.
- Add large-model artifact placement metadata.
- Add regional placement and bandwidth-aware scheduling.

### Milestone 9 — Distributed Adapter Training

- Add `infernet train adapter-distributed --experimental`.
- Add async/federated aggregation coordinator.
- Add checkpoint map and aggregation logs.
- Add adapter merge/export workflow.
- Add eval comparison between base model and trained adapter.

### Milestone 10 — Experimental Decentralized Pretraining

- Add `infernet train pretrain --experimental`.
- Require explicit risk warnings.
- Support only small/medium models initially.
- Add regional swarm mode.
- Add straggler tolerance, peer drop/rejoin, and checkpoint recovery.
- Do not market as frontier-scale training until demonstrated.

---

## 22. Acceptance Criteria

v0.1 is complete when:

- `infernet train estimate` works against local datasets.
- `infernet train start --local --runtime microgpt` completes successfully.
- A remote provider can claim and run a sandboxed training job.
- Logs stream to CLI with `infernet train logs --follow`.
- Metrics are stored and downloadable as JSONL.
- Final artifacts are uploaded, listed, and downloadable.
- `model-card.md`, `dataset-card.md`, and `eval-report.md` are generated.
- Provider can opt in/out of training workloads.
- Failed jobs have useful error events.
- Cancelled jobs stop the provider container.
- Tests cover the full microgpt lifecycle.
- Experimental mega-model commands exist as safe stubs with clear warnings.
- Topology and strategy metadata are represented in the schema even if only partially used in v0.1.

---

## 23. Open Questions

- Should private datasets be supported in v0.1 or only local/self-hosted?
- Should artifact storage default to Supabase Storage or S3-compatible storage?
- Should payment escrow reserve max estimated cost before job start?
- Should providers be paid for failed/preempted jobs, and how much?
- Should training containers be built by Infernet only, or should advanced users be able to bring custom images?
- Should Infernet support Hugging Face auth tokens through encrypted one-time job secrets?
- Should training jobs require stronger provider reputation than inference jobs?
