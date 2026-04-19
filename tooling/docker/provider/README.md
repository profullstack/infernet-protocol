# Infernet provider Docker image

Pre-built container that boots the `infernet` CLI as a provider node. Used by:

- The **one-click deploy** flow in the web dashboard (via `@infernetprotocol/deploy-providers/runpod`).
- Anyone who wants to run a provider via `docker run` or `docker-compose` without managing Node.js installs.

## Build

```bash
docker build \
  -f tooling/docker/provider/Dockerfile \
  -t ghcr.io/profullstack/infernet-provider:latest \
  tooling/docker/provider
```

Pin the CLI version at build time:

```bash
docker build \
  --build-arg INFERNET_CLI_VERSION=1.2.3 \
  -f tooling/docker/provider/Dockerfile \
  -t ghcr.io/profullstack/infernet-provider:1.2.3 \
  tooling/docker/provider
```

## Run (local test)

```bash
docker run --rm -it \
  -e SUPABASE_URL=http://host.docker.internal:54321 \
  -e SUPABASE_SERVICE_ROLE_KEY=$LOCAL_SERVICE_ROLE \
  -e INFERNET_NODE_NAME=dev-provider \
  -p 46337:46337 \
  ghcr.io/profullstack/infernet-provider:latest
```

For NVIDIA passthrough, add `--gpus all` (requires the nvidia-container-toolkit).

## Required env

| Variable                    | Required | Default      | Purpose                                      |
|-----------------------------|:-------: |--------------|----------------------------------------------|
| `SUPABASE_URL`              | yes      | —            | Control-plane Supabase URL                   |
| `SUPABASE_SERVICE_ROLE_KEY` | yes      | —            | Service-role key for the Supabase project    |
| `INFERNET_NODE_ROLE`        | no       | `provider`   | `provider` / `aggregator`                    |
| `INFERNET_NODE_NAME`        | no       | `$HOSTNAME`  | Display name in the control-plane dashboard  |
| `INFERNET_P2P_PORT`         | no       | `46337`      | TCP port for peer traffic                    |

## Publish

```bash
docker push ghcr.io/profullstack/infernet-provider:1.2.3
docker push ghcr.io/profullstack/infernet-provider:latest
```
