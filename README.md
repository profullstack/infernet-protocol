<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.infernet.white.svg">
    <img src="assets/logo.infernet.black.svg" alt="Infernet Protocol Logo" width="400" />
  </picture>
</p>

# Infernet Protocol

[![Crypto Payment](https://paybadge.profullstack.com/badge.svg)](https://paybadge.profullstack.com/?tickers=btc%2Ceth%2Csol%2Cusdc)

An open-source, peer-to-peer protocol for distributed GPU inference tasks.

Read the whitepaper at [INFERNET-PROTOCOL.md](https://github.com/profullstack/infernet-protocol/blob/master/INFERNET-PROTOCOL.md).

The architecture is outlined in [INFERNET-ARCHITECTURE.md](https://github.com/profullstack/infernet-protocol/blob/master/INFERNET-ARCHITECTURE.md).

## Table of Contents

- [Technologies](#technologies)
- [Platforms](#platforms)
- [Database](#database)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Clone the Repository](#clone-the-repository)
  - [Core Protocol](#core-protocol)
  - [Desktop Application](#desktop-application)
  - [Mobile Application](#mobile-application)
  - [PocketBase Integration](#pocketbase-integration)
- [PWA & Self-Hosting](#pwa--self-hosting)
  - [PWA Development](#pwa-development)
  - [Self-Hosting Mode](#self-hosting-mode)
  - [Docker Support](#docker-support)
- [USE CASES](#use-cases)
  - [Resource Provider: Donating or Renting GPU/CPU Time](#1-resource-provider-donating-or-renting-gpucpu-time)
  - [Resource Consumer: Training and Inference on the P2P Network](#2-resource-consumer-training-and-inference-on-the-p2p-network)
  - [Lightning Network Integration](#lightning-network-integration)
- [Contact](#contact)

[![GitHub](https://img.shields.io/github/license/profullstack/infernet-protocol)](https://github.com/profullstack/infernet-protocol/blob/master/LICENSE)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/m/profullstack/infernet-protocol)](https://github.com/profullstack/infernet-protocol/pulse)
[![GitHub last commit](https://img.shields.io/github/last-commit/profullstack/infernet-protocol)](https://github.com/profullstack/infernet-protocol/commits/master)

### Technologies
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=000&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![P2P](https://img.shields.io/badge/P2P-0072CE?logo=p2p&logoColor=fff&style=for-the-badge)](https://en.wikipedia.org/wiki/Peer-to-peer)
[![WebSockets](https://img.shields.io/badge/WebSockets-010101?logo=socket.io&logoColor=fff&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![REST API](https://img.shields.io/badge/REST%20API-009688?logo=fastapi&logoColor=fff&style=for-the-badge)](https://restfulapi.net/)
[![Multi-GPU](https://img.shields.io/badge/Multi--GPU-76B900?logo=nvidia&logoColor=fff&style=for-the-badge)](https://developer.nvidia.com/cuda-zone)
[![Multi-CPU](https://img.shields.io/badge/Multi--CPU-0071C5?logo=intel&logoColor=fff&style=for-the-badge)](https://www.intel.com/content/www/us/en/developer/overview.html)
[![Svelte](https://img.shields.io/badge/Svelte-FF3E00?logo=svelte&logoColor=fff&style=for-the-badge)](https://github.com/profullstack/infernet-protocol/tree/master/web)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=fff&style=for-the-badge)](https://github.com/profullstack/infernet-protocol/tree/master/web/server)
[![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=fff&style=for-the-badge)](https://github.com/profullstack/infernet-protocol/tree/master/desktop)
[![React Native](https://img.shields.io/badge/React%20Native-61DAFB?logo=react&logoColor=000&style=for-the-badge)](https://github.com/profullstack/infernet-protocol/tree/master/mobile)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=fff&style=for-the-badge)](https://github.com/profullstack/infernet-protocol/tree/master/web)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff&style=for-the-badge)](https://github.com/profullstack/infernet-protocol/tree/master/docker)

### Platforms
[![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=fff&style=for-the-badge)](https://www.android.com/)
[![iOS](https://img.shields.io/badge/iOS-000000?logo=apple&logoColor=fff&style=for-the-badge)](https://www.apple.com/ios/)
[![Windows](https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=fff&style=for-the-badge)](https://www.microsoft.com/windows)
[![macOS](https://img.shields.io/badge/macOS-000000?logo=macos&logoColor=fff&style=for-the-badge)](https://www.apple.com/macos/)
[![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=000&style=for-the-badge)](https://www.linux.org/)
[![Web](https://img.shields.io/badge/Web-4285F4?logo=googlechrome&logoColor=fff&style=for-the-badge)](https://www.w3.org/standards/webdesign/)

### Database
[![PocketBase](https://img.shields.io/badge/PocketBase-B8DBE4?logo=pocketbase&logoColor=000&style=for-the-badge)](https://pocketbase.io/)


## Repository Structure

- `desktop/` — Desktop application implementation
  - `electron/` — Electron-specific code for desktop app
  - `src/` — Desktop application source code

- `mobile/` — Mobile application implementation
  - `src/` — Mobile application source code

- `web/` — Progressive Web App (PWA) implementation
  - `src/` — Svelte 4 components (shared with desktop when possible)
  - `server/` — Hono.js server implementation

- `src/` — Core protocol implementation
  - `api/` — API endpoints and handlers
  - `db/` — Database models and operations
  - `network/` — P2P networking and communication
  - `execution/` — Inference execution environment
  - `identity/` — Identity and authentication

- `docker/` — Docker configuration for self-hosting

- `docs/` — Documentation, whitepaper, and assets

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/) (v10 or later)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (for mobile development)
- [Android Studio](https://developer.android.com/studio) (for Android development)
- [Xcode](https://developer.apple.com/xcode/) (for iOS development, macOS only)

### Clone the Repository

```bash
git clone https://github.com/profullstack/infernet-protocol.git
cd infernet-protocol
pnpm install
```

### Core Protocol

To run the core protocol server:

```bash
pnpm start
```

For development with auto-restart:

```bash
pnpm dev
```

### Desktop Application

The desktop application uses Electron with Svelte for the UI.

```bash
cd desktop
pnpm install
```

For development (runs both Vite dev server and Electron):

```bash
pnpm electron:dev
```

To build the desktop application:

```bash
pnpm electron:build
```

### Mobile Application

The mobile application uses React Native with Expo.

```bash
cd mobile
pnpm install
```

To start the Expo development server:

```bash
pnpm start
```

To run on Android or iOS:

```bash
pnpm android
# or
pnpm ios  # macOS only
```

### PocketBase Integration

All applications (desktop, mobile, and PWA) use PocketBase for data management. They connect to a remote P2P instance to seed nodes from https://infernet.tech/nodes.

The API exposes a public `/nodes` route when running in server mode.

## PWA & Self-Hosting

The Progressive Web App (PWA) is designed for GPU/CPU farm operators who need to manage their infrastructure through a web interface.

### PWA Development

The PWA uses Svelte 4 and Hono.js, sharing components with the desktop app where possible:

```bash
cd web
pnpm install
pnpm dev  # Start development server
```

To build the PWA for production:

```bash
pnpm build
```

### Self-Hosting Mode

The application can be self-hosted on a server:

```bash
cd web
pnpm build
pnpm start:server  # Start production server
```

### Docker Support

For containerized deployment:

```bash
# Build the Docker image
docker build -t infernet-protocol -f docker/Dockerfile .

# Run the container
docker run -p 3000:3000 -p 8080:8080 --gpus all infernet-protocol
```

This is particularly useful for GPU farm operators who need to manage multiple machines.

Visit [https://infernet.tech](https://infernet.tech) and [https://github.com/profullstack/infernet-protocol](https://github.com/profullstack/infernet-protocol)

## USE CASES

The Infernet Protocol enables a decentralized marketplace for AI computation resources, with two primary use cases that leverage Lightning Network (LN) for micropayments:

### 1. Resource Provider: Donating or Renting GPU/CPU Time

As a resource provider in the Infernet Protocol network, you can:

- **Monetize Idle Computing Resources**: Convert underutilized GPU/CPU capacity into a source of passive income by offering it to the network
- **Earn Lightning Network Payments**: Receive instant micropayments in Bitcoin via the Lightning Network for every computation task your hardware processes
- **Set Custom Pricing Models**: Define your own pricing based on hardware capabilities, availability schedules, and computation types
- **Build Reputation**: Establish a reputation score based on reliability, speed, and quality of service, attracting more clients
- **Join Specialized Pools**: Participate in specialized computation pools for specific AI model types or industries
- **Flexible Participation**: Choose between full-time operation or casual participation during off-hours

The desktop application and PWA provide comprehensive dashboards for monitoring earnings, hardware utilization, and reputation metrics.

### 2. Resource Consumer: Training and Inference on the P2P Network

As a consumer of computing resources, you can:

- **Access Distributed Computing Power**: Tap into a global network of GPUs and CPUs without capital investment in hardware
- **Pay-as-You-Go with Lightning**: Pay only for the actual computation used via instant Lightning Network micropayments
- **Scale Dynamically**: Easily scale your computation needs up or down based on project requirements
- **Select Specialized Hardware**: Choose specific hardware profiles optimized for your particular AI models
- **Prioritize Jobs**: Adjust pricing to prioritize urgent computation tasks
- **Distribute Workloads**: Split large jobs across multiple providers for faster processing
- **Ensure Privacy**: Leverage secure computation options for sensitive data processing

The mobile and web applications provide intuitive interfaces for submitting jobs, tracking progress, and managing budgets.

### Lightning Network Integration

The Infernet Protocol uses Lightning Network for all transactions, enabling:

- **Instant Micropayments**: Process payments in milliseconds with minimal fees
- **Trustless Operation**: No need for credit checks or deposits - pay only for what you use
- **Global Accessibility**: Anyone with internet access and Bitcoin can participate
- **Programmable Payments**: Automated payments based on computation metrics
- **Privacy-Preserving**: Transactions don't require revealing personal information

This payment infrastructure allows for truly decentralized AI computation marketplace that operates efficiently at global scale.

## Contact
For technical contributions or questions: protocol@infernet.tech

[![Discord](https://img.shields.io/discord/1011308539819597844?label=Discord&logo=Discord&style=for-the-badge)](https://discord.gg/U7dEXfBA3s)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?logo=reddit&logoColor=fff&style=for-the-badge)](https://www.reddit.com/r/Infernet/)
