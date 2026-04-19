# @infernetprotocol/api-schema

OpenAPI 3.1 specification for the Infernet Protocol control-plane API.

The authoritative document is [`openapi.yaml`](./openapi.yaml). The JS module re-exports the raw YAML so SDK generators can consume it programmatically:

```js
import { openapiYaml, openapiYamlPath } from "@infernetprotocol/api-schema";
```

## Usage

### Render docs locally

```bash
npx @redocly/cli preview-docs packages/api-schema/openapi.yaml
# or
npx swagger-ui-cli packages/api-schema/openapi.yaml
```

### Generate a client

```bash
npx @openapitools/openapi-generator-cli generate \
  -i packages/api-schema/openapi.yaml \
  -g python \
  -o dist/infernet-python-sdk
```

## Keeping the schema in sync

The schema is hand-authored today. Any new `/api/*` route in `apps/web/app/api/` should land with a matching change in `openapi.yaml` in the same PR.
