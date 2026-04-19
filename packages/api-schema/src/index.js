/**
 * @infernetprotocol/api-schema — OpenAPI 3.1 document for the Infernet control-plane API.
 *
 * We ship the YAML alongside the JS module so SDK generators, Swagger UI,
 * and humans can all consume the same source of truth. Bundlers that
 * don't know how to import YAML will fall back to reading the file off
 * disk from the package root.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YAML_PATH = path.resolve(__dirname, "..", "openapi.yaml");

/**
 * The raw YAML text, synchronously loaded once per process.
 */
export const openapiYaml = fs.readFileSync(YAML_PATH, "utf8");

/**
 * Absolute filesystem path to the shipped openapi.yaml. Useful if you
 * want to stream it from Next.js or feed it into a generator via CLI.
 */
export const openapiYamlPath = YAML_PATH;
