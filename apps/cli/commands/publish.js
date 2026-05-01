/**
 * `infernet publish` — push a trained model to HuggingFace and/or Ollama.
 *
 * The Ollama path is what makes a model show up at e.g.
 *   https://ollama.com/<your-org>/<model>
 * (similar to ollama.com/rockypod/svelte-coder). We:
 *   1. Locate the safetensors checkpoint in <dir>.
 *   2. Optionally push it to huggingface.co/<HF_ORG>/<name> via huggingface-cli.
 *   3. Convert to GGUF (llama.cpp) — best with the user's local llama.cpp install.
 *   4. Generate a Modelfile + `ollama create` + `ollama push`.
 *
 * Requires:
 *   HUGGINGFACE_TOKEN  for the HF push
 *   OLLAMA_USERNAME    for the Ollama push (ollama signin must already be done)
 *   llama.cpp cloned to ~/llama.cpp OR override with --llama-cpp-path
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../lib/config.js";

const HELP = `infernet publish — push a trained model to HuggingFace + Ollama

Usage:
  infernet publish <dir> [flags]

Required:
  <dir>                       Path to the trained model directory
                              (must contain config.json + *.safetensors)

Flags:
  --hf <org>/<name>           Push to huggingface.co/<org>/<name>
  --ollama <user>/<name>      Push to ollama.com/<user>/<name>
  --base <hf-id>              Base model id for the GGUF Modelfile FROM
                              (default: read from <dir>/config.json)
  --quant <q>                 GGUF quantization (default: q4_k_m)
                                q2_k | q3_k_m | q4_0 | q4_k_m | q5_k_m | q8_0
  --llama-cpp-path <dir>      llama.cpp checkout (default: \$HOME/llama.cpp)
  --skip-hf                   Skip the HuggingFace push (Ollama only)
  --skip-ollama               Skip the Ollama push (HF only)
  --modelfile-only            Just generate the Modelfile + GGUF, don't push
  --help

Examples:
  infernet publish ./run/checkpoint-final \\
      --hf InfernetProtocol/svelte5-coder \\
      --ollama infernet/svelte5-coder

  infernet publish ./run --modelfile-only --quant q5_k_m

Prereqs:
  HUGGINGFACE_TOKEN     env or .env (write scope on the org)
  ollama signin         done once, prior to first push
  llama.cpp             cloned + built at \$HOME/llama.cpp (for GGUF convert)
`;

async function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: "inherit", ...opts });
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`)));
        child.on("error", reject);
    });
}

async function which(bin) {
    return new Promise((resolve) => {
        const child = spawn("which", [bin], { stdio: ["ignore", "pipe", "ignore"] });
        let out = "";
        child.stdout.on("data", (b) => { out += b.toString(); });
        child.on("exit", (code) => resolve(code === 0 ? out.trim() : null));
        child.on("error", () => resolve(null));
    });
}

async function detectBase(dir) {
    try {
        const cfg = JSON.parse(await fsp.readFile(path.join(dir, "config.json"), "utf8"));
        return cfg?._name_or_path
            ?? cfg?.model_name_or_path
            ?? cfg?.base_model
            ?? null;
    } catch {
        return null;
    }
}

async function pushToHuggingFace({ dir, hfRepo, token }) {
    if (!token) throw new Error("HUGGINGFACE_TOKEN required for HF push");
    const hfCli = (await which("huggingface-cli")) ?? (await which("hf"));
    if (!hfCli) {
        throw new Error("huggingface-cli not found. Install: pip install -U huggingface_hub");
    }
    process.stdout.write(`\n→ Pushing ${dir} → huggingface.co/${hfRepo}\n`);
    // Create the repo (idempotent — won't fail if it exists)
    await run(hfCli, ["repo", "create", hfRepo, "--type", "model", "-y"], {
        env: { ...process.env, HF_TOKEN: token, HUGGINGFACE_TOKEN: token }
    }).catch(() => { /* may already exist */ });
    await run(hfCli, ["upload", hfRepo, dir, ".", "--repo-type", "model"], {
        env: { ...process.env, HF_TOKEN: token, HUGGINGFACE_TOKEN: token }
    });
    process.stdout.write(`✓ HF: https://huggingface.co/${hfRepo}\n`);
}

async function convertToGgufAndPush({ dir, ollamaRepo, base, quant = "q4_k_m", llamaCppPath, modelfileOnly }) {
    const llamaCpp = llamaCppPath ?? path.join(process.env.HOME ?? "", "llama.cpp");
    const convertScript = path.join(llamaCpp, "convert_hf_to_gguf.py");
    if (!fs.existsSync(convertScript)) {
        throw new Error(
            `llama.cpp convert_hf_to_gguf.py not found at ${convertScript}.\n` +
            `Clone + build llama.cpp first:\n` +
            `  git clone https://github.com/ggml-org/llama.cpp ~/llama.cpp\n` +
            `  cd ~/llama.cpp && cmake -B build && cmake --build build -j`
        );
    }

    const ggufRaw = path.join(dir, "model.f16.gguf");
    const ggufQuant = path.join(dir, `model.${quant}.gguf`);

    process.stdout.write(`\n→ Converting ${dir} → ${ggufRaw}\n`);
    await run("python3", [convertScript, dir, "--outfile", ggufRaw, "--outtype", "f16"]);

    const quantBin = path.join(llamaCpp, "build", "bin", "llama-quantize");
    if (fs.existsSync(quantBin)) {
        process.stdout.write(`\n→ Quantizing → ${ggufQuant} (${quant})\n`);
        await run(quantBin, [ggufRaw, ggufQuant, quant.toUpperCase()]);
    } else {
        process.stdout.write(`(skipping quantization — llama-quantize not built; using f16 GGUF)\n`);
    }

    const finalGguf = fs.existsSync(ggufQuant) ? ggufQuant : ggufRaw;

    // Generate a Modelfile.
    const modelfilePath = path.join(dir, "Modelfile");
    const modelfile = [
        `# Auto-generated by \`infernet publish\``,
        `FROM ${finalGguf}`,
        ``,
        `# Inherit conversation template from base if provided.`,
        base ? `# Base: ${base}` : `# Base: (unknown)`,
        ``,
        `PARAMETER temperature 0.7`,
        `PARAMETER top_p 0.9`,
        `PARAMETER repeat_penalty 1.1`,
        ``,
        `# ChatML template (works for Qwen / Llama-3 chat / most modern fine-tunes)`,
        `TEMPLATE """{{ if .System }}<|im_start|>system`,
        `{{ .System }}<|im_end|>`,
        `{{ end }}{{ if .Prompt }}<|im_start|>user`,
        `{{ .Prompt }}<|im_end|>`,
        `{{ end }}<|im_start|>assistant`,
        `{{ .Response }}<|im_end|>"""`,
        ``,
        `SYSTEM """You are a helpful assistant fine-tuned by Infernet Protocol."""`
    ].join("\n");
    await fsp.writeFile(modelfilePath, modelfile);
    process.stdout.write(`\n✓ Modelfile: ${modelfilePath}\n`);

    if (modelfileOnly) {
        process.stdout.write(`\n(--modelfile-only set; skipping ollama create + push)\n`);
        return;
    }

    if (!ollamaRepo) {
        process.stdout.write(`(no --ollama target; skipping ollama push)\n`);
        return;
    }

    process.stdout.write(`\n→ ollama create ${ollamaRepo} -f ${modelfilePath}\n`);
    await run("ollama", ["create", ollamaRepo, "-f", modelfilePath]);

    process.stdout.write(`\n→ ollama push ${ollamaRepo}\n`);
    await run("ollama", ["push", ollamaRepo]);
    process.stdout.write(`✓ Ollama: https://ollama.com/${ollamaRepo}\n`);
}

export default async function publish(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }
    const dir = args.positional?.[0];
    if (!dir) {
        process.stderr.write("error: model directory required\n\n");
        process.stderr.write(HELP);
        return 2;
    }
    if (!fs.existsSync(dir)) {
        process.stderr.write(`error: ${dir} does not exist\n`);
        return 1;
    }

    const hfRepo = args.get("hf") ?? null;
    const ollamaRepo = args.get("ollama") ?? null;
    const skipHf = args.has("skip-hf") || !hfRepo;
    const skipOllama = args.has("skip-ollama") || (!ollamaRepo && !args.has("modelfile-only"));
    const modelfileOnly = args.has("modelfile-only");
    const quant = args.get("quant") ?? "q4_k_m";
    const llamaCppPath = args.get("llama-cpp-path") ?? null;

    if (skipHf && skipOllama && !modelfileOnly) {
        process.stderr.write("error: nothing to do (set --hf <org>/<name> and/or --ollama <user>/<name>, or --modelfile-only)\n");
        return 2;
    }

    const cfg = await loadConfig().catch(() => null);
    const hfToken = process.env.HUGGINGFACE_TOKEN ?? cfg?.huggingface?.token ?? null;

    const base = args.get("base") ?? await detectBase(dir);
    if (!base && !skipOllama) {
        process.stdout.write("(could not detect base model from config.json — Modelfile FROM line will reference the GGUF only)\n");
    }

    if (!skipHf) {
        try {
            await pushToHuggingFace({ dir, hfRepo, token: hfToken });
        } catch (err) {
            process.stderr.write(`HF push failed: ${err?.message ?? err}\n`);
            return 1;
        }
    }

    if (!skipOllama || modelfileOnly) {
        try {
            await convertToGgufAndPush({
                dir, ollamaRepo, base, quant, llamaCppPath, modelfileOnly
            });
        } catch (err) {
            process.stderr.write(`Ollama path failed: ${err?.message ?? err}\n`);
            return 1;
        }
    }

    process.stdout.write(`\n✓ publish complete\n`);
    return 0;
}

export { HELP };
