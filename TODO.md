# Infernet Protocol - TODO List

## Replace Mocked Data with PocketBase Integration

The following tasks involve replacing mock data with actual PocketBase database integration. All JavaScript code should use ESM modules and be managed with pnpm.

### Web Server API Endpoints

- [ ] Replace mock data in `/api/nodes` endpoint with actual PocketBase query
  - File: `/web/server/index.js`
  - Description: Currently returns hardcoded node data; should query the `nodes` collection from PocketBase

- [ ] Replace mock data in `/api/nodes/:id` endpoint with actual PocketBase query
  - File: `/web/server/index.js`
  - Description: Currently returns hardcoded node data for a specific ID; should query the `nodes` collection by ID

- [ ] Replace mock data in `/api/jobs` endpoint with actual PocketBase query
  - File: `/web/server/index.js`
  - Description: Currently returns hardcoded job data; should query the `jobs` collection from PocketBase

### Web Frontend (Svelte)

- [ ] Replace mock data in main dashboard page
  - File: `/web/src/routes/+page.svelte`
  - Description: Currently uses hardcoded stats, GPU data, and job data; should fetch from the API endpoints

- [ ] Replace mock data in GPU monitoring page
  - File: `/web/src/routes/gpu/+page.svelte`
  - Description: Currently uses hardcoded GPU stats and mock charts; should fetch real-time data from the API

- [ ] Replace mock data in nodes listing page
  - File: `/web/src/routes/nodes/+page.svelte`
  - Description: Currently uses hardcoded node data; should fetch from the `/api/nodes` endpoint

- [ ] Replace mock data in CPU monitoring page
  - File: `/web/src/routes/cpu/+page.svelte`
  - Description: Currently uses hardcoded CPU stats and mock charts; should fetch real-time data from the API

### Mobile Application (React Native)

- [ ] Replace mock data in HomeScreen
  - File: `/mobile/src/screens/HomeScreen.js`
  - Description: Currently generates random stats and job data; should fetch from PocketBase via API

- [ ] Replace mock data in ProvidersScreen
  - File: `/mobile/src/screens/ProvidersScreen.js`
  - Description: Currently generates random provider data; should fetch from PocketBase via API

- [ ] Replace mock data in JobsScreen
  - File: `/mobile/src/screens/JobsScreen.js`
  - Description: Currently generates random job data; should fetch from PocketBase via API

### Core Protocol Implementation

- [ ] Replace mock implementation in database statistics utility
  - File: `/src/db/utils.js`
  - Description: The `getStats()` function currently returns mock data; should use PocketBase Admin APIs to get actual collection statistics

## Implementation Strategy

1. Define proper PocketBase schema for all collections (nodes, jobs, providers, etc.)
2. Create utility functions for common PocketBase operations
3. Update API endpoints to use PocketBase instead of mock data
4. Update frontend components to fetch from the API endpoints
5. Ensure all code uses ESM modules and is managed with pnpm

## Additional Tasks

- [ ] Create PocketBase initialization script to set up required collections and schema
- [ ] Add authentication for API endpoints
- [ ] Implement real-time updates using PocketBase's realtime API and Socket.IO
- [ ] Add proper error handling and loading states throughout the application
