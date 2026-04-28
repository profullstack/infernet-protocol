# Infernet Protocol — Docker build/run/push for the provider image.
#
# Default target builds the multi-stage provider image from the CLI's
# version in apps/cli/package.json. Override TAG / IMAGE_NAME at the
# command line:
#
#   make build                                  # tag = CLI version (e.g. 0.1.2)
#   make build TAG=v1                           # tag = v1
#   make build IMAGE_NAME=myorg/infernet TAG=test
#
# Push targets assume `make login` (or `docker login`) ran first.

IMAGE_NAME ?= chovy/infernetprotocol
TAG        ?= $(shell node -p "require('./apps/cli/package.json').version")

# Buildx builder name — created on first `make buildx` invocation.
BUILDX_BUILDER ?= infernet-builder
PLATFORMS      ?= linux/amd64

PORT      ?= 8080
P2P_PORT  ?= 46337
MODEL     ?= qwen2.5:0.5b

.PHONY: help build run push login docker-info logs healthz

help:
	@echo "Infernet Protocol — Docker targets"
	@echo
	@echo "  make build               Build $(IMAGE_NAME):$(TAG) (and :latest)"
	@echo "  make run                 Run locally (port $(PORT) + $(P2P_PORT))"
	@echo "  make logs                Tail logs of the running container"
	@echo "  make healthz             Hit /healthz on the running container"
	@echo "  make login               docker login (one-time before push)"
	@echo "  make push                docker push $(IMAGE_NAME):$(TAG) and :latest"
	@echo "  make docker-info         Show resolved IMAGE_NAME / TAG"
	@echo
	@echo "  Override TAG / IMAGE_NAME on the command line, e.g."
	@echo "    make build TAG=v1"
	@echo "    make push IMAGE_NAME=myorg/infernet TAG=test"

docker-info:
	@echo "IMAGE: $(IMAGE_NAME):$(TAG)"
	@echo "       $(IMAGE_NAME):latest"
	@echo "PLAT:  $(PLATFORMS)"

build:
	docker build \
		-t $(IMAGE_NAME):$(TAG) \
		-t $(IMAGE_NAME):latest \
		-f docker/Dockerfile.provider \
		.

# Multi-arch build via buildx — needed if you want to publish for
# both amd64 (most servers) and arm64 (Apple Silicon dev boxes).
buildx-init:
	-docker buildx create --name $(BUILDX_BUILDER) --use
	docker buildx inspect $(BUILDX_BUILDER) --bootstrap

buildx-push: buildx-init
	docker buildx build \
		--platform $(PLATFORMS) \
		-t $(IMAGE_NAME):$(TAG) \
		-t $(IMAGE_NAME):latest \
		-f docker/Dockerfile.provider \
		--push \
		.

run:
	docker run --rm -it \
		-p $(PORT):$(PORT) \
		-p $(P2P_PORT):$(P2P_PORT) \
		-e PORT=$(PORT) \
		-e INFERNET_PUBLIC_PORT=$(P2P_PORT) \
		-e INFERNET_MODEL=$(MODEL) \
		-e INFERNET_CONTROL_PLANE=$${INFERNET_CONTROL_PLANE:-https://infernetprotocol.com} \
		-e INFERNET_BEARER=$${INFERNET_BEARER:-} \
		--name infernet-provider \
		$(IMAGE_NAME):$(TAG)

logs:
	docker logs -f infernet-provider

healthz:
	curl -fsS http://localhost:$(PORT)/healthz | python3 -m json.tool || \
		(echo "healthz failed — is the container running?  make run" && exit 1)

login:
	docker login

push:
	docker push $(IMAGE_NAME):$(TAG)
	docker push $(IMAGE_NAME):latest
	@echo
	@echo "Pushed:"
	@echo "  $(IMAGE_NAME):$(TAG)"
	@echo "  $(IMAGE_NAME):latest"
