/**
 * Configuration settings for Infernet Protocol
 */

// Load environment variables from .env file
require('dotenv').config();

module.exports = {
    // PocketBase configuration
    pocketbase: {
        url: process.env.POCKETBASE_URL || 'http://127.0.0.1:8090',
        adminEmail: process.env.POCKETBASE_ADMIN_EMAIL,
        adminPassword: process.env.POCKETBASE_ADMIN_PASSWORD,
        dataDir: process.env.POCKETBASE_DATA_DIR || './pb_data',
        useEmbedded: process.env.USE_EMBEDDED_POCKETBASE === 'true' || false,
        autoStart: process.env.POCKETBASE_AUTO_START === 'true' || false
    },
    
    // Server configuration
    server: {
        port: parseInt(process.env.PORT || '3000', 10),
        host: process.env.HOST || '0.0.0.0',
        apiPrefix: process.env.API_PREFIX || '/api/v1',
        corsOrigins: (process.env.CORS_ORIGINS || '*').split(',')
    },
    
    // Node configuration
    node: {
        type: process.env.NODE_TYPE || 'provider', // provider, client, or aggregator
        id: process.env.NODE_ID || `node_${Date.now()}`,
        discoveryInterval: parseInt(process.env.DISCOVERY_INTERVAL || '60000', 10), // milliseconds
        bootstrapNodes: (process.env.BOOTSTRAP_NODES || '').split(',').filter(Boolean),
        maxConnections: parseInt(process.env.MAX_CONNECTIONS || '100', 10),
        heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10) // milliseconds
    },
    
    // WebSocket configuration
    websocket: {
        port: parseInt(process.env.WS_PORT || '3001', 10),
        host: process.env.WS_HOST || '0.0.0.0',
        path: process.env.WS_PATH || '/ws',
        heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
        reconnectInterval: parseInt(process.env.WS_RECONNECT_INTERVAL || '5000', 10),
        maxReconnectAttempts: parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS || '10', 10)
    },
    
    // DHT configuration
    dht: {
        bootstrapNodes: (process.env.DHT_BOOTSTRAP_NODES || '').split(',').filter(Boolean),
        kBucketSize: parseInt(process.env.DHT_K_BUCKET_SIZE || '20', 10),
        refreshInterval: parseInt(process.env.DHT_REFRESH_INTERVAL || '3600000', 10), // 1 hour
        staleTimeout: parseInt(process.env.DHT_STALE_TIMEOUT || '900000', 10) // 15 minutes
    },
    
    // Docker configuration for task execution
    docker: {
        socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
        defaultImage: process.env.DEFAULT_DOCKER_IMAGE || 'ubuntu:latest',
        networkMode: process.env.DOCKER_NETWORK_MODE || 'bridge',
        cpuLimit: process.env.DOCKER_CPU_LIMIT,
        memoryLimit: process.env.DOCKER_MEMORY_LIMIT,
        gpuOptions: process.env.DOCKER_GPU_OPTIONS
    },
    
    // NOSTR configuration for decentralized identity
    nostr: {
        privateKey: process.env.NOSTR_PRIVATE_KEY,
        publicKey: process.env.NOSTR_PUBLIC_KEY,
        relays: (process.env.NOSTR_RELAYS || 'wss://relay.damus.io,wss://relay.nostr.info').split(','),
        enableNIP05: process.env.NOSTR_ENABLE_NIP05 === 'true' || false,
        nip05Domain: process.env.NOSTR_NIP05_DOMAIN,
        nip05Identifier: process.env.NOSTR_NIP05_IDENTIFIER
    },
    
    // Payment configuration
    payment: {
        methods: (process.env.PAYMENT_METHODS || 'lightning,polygon').split(','),
        minimumAmount: parseFloat(process.env.PAYMENT_MINIMUM_AMOUNT || '0.0001'),
        escrowEnabled: process.env.PAYMENT_ESCROW_ENABLED === 'true' || false,
        lightning: {
            nodeUrl: process.env.LIGHTNING_NODE_URL,
            macaroon: process.env.LIGHTNING_MACAROON,
            certificatePath: process.env.LIGHTNING_CERTIFICATE_PATH,
            invoiceExpirySeconds: parseInt(process.env.LIGHTNING_INVOICE_EXPIRY || '3600', 10)
        },
        polygon: {
            rpcUrl: process.env.POLYGON_RPC_URL,
            privateKey: process.env.POLYGON_PRIVATE_KEY,
            contractAddress: process.env.POLYGON_CONTRACT_ADDRESS,
            gasLimit: parseInt(process.env.POLYGON_GAS_LIMIT || '250000', 10)
        }
    },
    
    // Security configuration
    security: {
        encryptionKey: process.env.ENCRYPTION_KEY,
        jwtSecret: process.env.JWT_SECRET,
        jwtExpiryHours: parseInt(process.env.JWT_EXPIRY_HOURS || '24', 10),
        useSecureEnclave: process.env.USE_SECURE_ENCLAVE === 'true' || false,
        rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '100', 10),
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10) // 15 minutes
    },
    
    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
        file: process.env.LOG_FILE || './logs/infernet.log',
        maxSize: parseInt(process.env.LOG_MAX_SIZE || '10485760', 10), // 10MB
        maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
        console: process.env.LOG_TO_CONSOLE !== 'false'
    },
    
    // Content delivery configuration
    contentDelivery: {
        storageDir: process.env.CONTENT_STORAGE_DIR || './storage',
        maxContentSize: parseInt(process.env.MAX_CONTENT_SIZE || '10737418240', 10), // 10GB default
        tempDir: process.env.TEMP_DIR || './tmp',
        cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600000', 10), // 1 hour
        contentExpiryHours: parseInt(process.env.CONTENT_EXPIRY_HOURS || '24', 10)
    },
    
    // Job execution configuration
    jobs: {
        maxConcurrent: parseInt(process.env.MAX_CONCURRENT_JOBS || '5', 10),
        timeout: parseInt(process.env.JOB_TIMEOUT || '3600000', 10), // 1 hour default
        retryLimit: parseInt(process.env.JOB_RETRY_LIMIT || '3', 10),
        retryDelay: parseInt(process.env.JOB_RETRY_DELAY || '60000', 10) // 1 minute
    }
};
