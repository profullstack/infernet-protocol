#!/usr/bin/env node

/**
 * Script to start the PocketBase server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PB_DIR = path.join(ROOT_DIR, 'pocketbase');
const PB_EXECUTABLE = path.join(PB_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');

// PocketBase configuration
const PB_PORT = process.env.POCKETBASE_PORT || 8080;
const PB_HOST = process.env.POCKETBASE_HOST || '127.0.0.1';

async function startPocketBase() {
  try {
    // Check if PocketBase executable exists
    try {
      await fs.access(PB_EXECUTABLE);
    } catch (error) {
      console.error('\n❌ PocketBase executable not found. Please run "npm run db:setup" first.\n');
      process.exit(1);
    }
    
    console.log(`\n🚀 Starting PocketBase server at http://${PB_HOST}:${PB_PORT}...\n`);
    
    // Start PocketBase with the specified host and port
    const pbProcess = spawn(
      PB_EXECUTABLE,
      ['serve', '--http', `${PB_HOST}:${PB_PORT}`],
      {
        cwd: PB_DIR,
        stdio: 'inherit'
      }
    );
    
    // Handle process events
    pbProcess.on('error', (error) => {
      console.error(`\n❌ Failed to start PocketBase: ${error.message}\n`);
      process.exit(1);
    });
    
    pbProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`\n❌ PocketBase exited with code ${code}\n`);
        process.exit(code);
      }
    });
    
    // Handle termination signals
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down PocketBase server...');
      pbProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down PocketBase server...');
      pbProcess.kill('SIGTERM');
    });
  } catch (error) {
    console.error('\n❌ Error starting PocketBase:', error);
    process.exit(1);
  }
}

// Run the start function
startPocketBase();
