# Chapter 6: Advanced Topics

This chapter covers configurations and capabilities beyond the standard single-node setup.

---

## In This Chapter

- [Multi-GPU](multi-gpu.md) — Running 70B+ models across multiple GPUs with vLLM and Ray. Tensor parallelism and pipeline parallelism.
- [Self-Hosting](self-hosting.md) — Running your own control plane (Next.js app + Supabase). Pointing the CLI at a custom control plane URL.
- [Distributed Training](distributed-training.md) — What's coming: LoRA/QLoRA fine-tuning on the network.

---

## Who Needs These

**Multi-GPU** is for operators with 2+ GPUs who want to run models that don't fit on a single card — primarily 70B parameter models or larger, which require 40GB+ VRAM in Q4 quantization.

**Self-hosting** is for organizations that need full data sovereignty or want to run a private inference network without using the public control plane.

**Distributed training** is for everyone who wants to follow the roadmap for the next major feature: fine-tuning jobs distributed across the network.
