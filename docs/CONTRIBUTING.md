# Infernet Protocol - Project Requirements

## Development Environment

### Package Management
- **pnpm**: Version 10.x or later for all package management
- All dependencies should be managed via pnpm workspaces for monorepo structure

### JavaScript Standards
- **ESM Modules**: All JavaScript code must use ES modules (import/export syntax)
- **Node.js**: Version 18.x or later
- **Vanilla JavaScript**: Avoid unnecessary dependencies and frameworks when possible

## Frontend Technologies

### Web & Desktop
- **Svelte 4**: For all web and desktop UI components
- **Vanilla CSS**: No CSS frameworks or preprocessors
- **Hono.js**: For web server implementation

### Mobile
- **React Native**: With Expo.dev for cross-platform mobile development
- **Expo SDK**: Latest stable version

## Backend Technologies

### Database
- **PocketBase**: For local embedded database
  - Used for managing data, job metadata, reputation history, and local node configurations
  - Should be integrated in both mobile and desktop apps
  - Should connect to remote P2P instance to seed nodes from https://infernet.tech/nodes

### Communication
- **WebSockets**: For real-time, bidirectional communication
- **REST API**: For standard HTTP endpoints

### Networking
- **P2P**: Decentralized discovery and peer-to-peer job distribution
- **DHT**: Kademlia implementation for distributed hash table

## Containerization

- **Docker**: For containerized deployment
- **Docker Compose**: For multi-container applications
- **GPU Passthrough**: Support for NVIDIA GPUs

## Authentication

- **Nostr Protocol**: For decentralized identity and authentication
- **Public Key Infrastructure**: For secure node communication

## Platform Support

### Desktop
- **Electron**: For cross-platform desktop application
- Windows, macOS, and Linux support

### Mobile
- Android and iOS via React Native

### Web
- Progressive Web App (PWA) support
- Self-hosting capabilities

## Code Style & Quality

- **ESLint**: For code quality and consistency
- **Prettier**: For code formatting
- **JSDoc**: For code documentation

## Architecture Principles

- **Modularity**: Components should be modular and reusable
- **Separation of Concerns**: Clear separation between UI, business logic, and data access
- **Minimal Dependencies**: Avoid unnecessary dependencies
- **Cross-Platform Compatibility**: Code should work across all supported platforms
- **Security First**: All communications should be encrypted, and all user data should be protected

## Documentation

- **Markdown**: All documentation should be in Markdown format
- **API Documentation**: All APIs should be documented
- **User Guides**: For each type of user (provider, consumer, etc.)

## Testing

- **Unit Tests**: For core functionality
- **Integration Tests**: For API endpoints and system integration
- **End-to-End Tests**: For critical user flows

## Deployment

- **CI/CD**: Automated builds and deployments
- **Docker Images**: For containerized deployment
- **Self-Hosting**: Support for self-hosting by users

---

*This document serves as a reference for all contributors to ensure consistency across the Infernet Protocol project.*
