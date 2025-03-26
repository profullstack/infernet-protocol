#!/usr/bin/env node

/**
 * Script to run PocketBase migrations
 */

import { runMigrations } from '../migrations/index.js';
import dotenv from 'dotenv';
import http from 'http';

// Load environment variables
dotenv.config();

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8080';
const MAX_RETRIES = 10;
const RETRY_INTERVAL = 1000; // 1 second

/**
 * Check if PocketBase server is running
 * @returns {Promise<boolean>}
 */
async function isPocketBaseRunning() {
  return new Promise((resolve) => {
    const url = new URL(PB_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: '/',
      method: 'HEAD',
      timeout: 1000
    };

    const req = http.request(options, (res) => {
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Wait for PocketBase server to be available
 * @returns {Promise<boolean>}
 */
async function waitForPocketBase() {
  console.log(`\n🔍 Checking if PocketBase is running at ${PB_URL}...`);
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (await isPocketBaseRunning()) {
      console.log('✅ PocketBase server is running!');
      return true;
    }
    
    console.log(`⏳ PocketBase server not available, retrying in ${RETRY_INTERVAL/1000} second... (${i+1}/${MAX_RETRIES})`);
    await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
  }
  
  console.error('\n❌ PocketBase server is not running. Please start it with "npm run db:start".');
  return false;
}

/**
 * Run migrations
 */
async function executeMigrations() {
  try {
    // Check if PocketBase is running
    const isRunning = await waitForPocketBase();
    if (!isRunning) {
      process.exit(1);
    }
    
    // Run migrations
    console.log('\n🚀 Running migrations...');
    await runMigrations();
    
    console.log('\n✅ Migrations completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running migrations:', error);
    process.exit(1);
  }
}

// Run migrations
executeMigrations();
