# Infernet provider image — pre-built Docker image that launches the
# `infernet` CLI in --foreground mode, ready to accept jobs from a
# remote Supabase control plane.
#
# Required env at runtime:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   INFERNET_NODE_NAME               (defaults to hostname)
#   INFERNET_NODE_ROLE               (defaults to 'provider')
#   INFERNET_P2P_PORT                (defaults to 46337)
#
# Published to ghcr.io/profullstack/infernet-provider:<tag>.

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Pre-install the CLI from npm. The RunPod pod template and similar
# template-based services will pull this image and run it; keeping
# the install bake-time keeps cold-start latency low.
ARG INFERNET_CLI_VERSION=latest
RUN npm install -g "@infernetprotocol/cli@${INFERNET_CLI_VERSION}"

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 46337/tcp

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
