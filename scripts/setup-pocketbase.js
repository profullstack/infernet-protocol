#!/usr/bin/env node

/**
 * Script to download and set up PocketBase
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PB_DIR = path.join(ROOT_DIR, 'pocketbase');
const DATA_DIR = path.join(PB_DIR, 'pb_data');

// Determine platform and architecture
const platform = os.platform();
const arch = os.arch();

// PocketBase version
const PB_VERSION = '0.22.6';

// Map platform and architecture to PocketBase download URL
function getPocketBaseUrl() {
  let platformStr, archStr;
  
  // Platform mapping
  switch (platform) {
    case 'linux':
      platformStr = 'linux';
      break;
    case 'darwin':
      platformStr = 'darwin';
      break;
    case 'win32':
      platformStr = 'windows';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  
  // Architecture mapping
  switch (arch) {
    case 'x64':
      archStr = 'amd64';
      break;
    case 'arm64':
      archStr = 'arm64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
  
  // Windows has a different extension
  const ext = platform === 'win32' ? 'zip' : 'zip';
  
  return `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${platformStr}_${archStr}.${ext}`;
}

async function setupPocketBase() {
  try {
    // Create PocketBase directory if it doesn't exist
    try {
      await fs.access(PB_DIR);
      console.log('PocketBase directory already exists');
    } catch (error) {
      console.log('Creating PocketBase directory...');
      await fs.mkdir(PB_DIR, { recursive: true });
    }
    
    // Create data directory if it doesn't exist
    try {
      await fs.access(DATA_DIR);
      console.log('PocketBase data directory already exists');
    } catch (error) {
      console.log('Creating PocketBase data directory...');
      await fs.mkdir(DATA_DIR, { recursive: true });
    }
    
    // Check if PocketBase executable already exists
    const pbExecutable = path.join(PB_DIR, platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
    try {
      await fs.access(pbExecutable);
      console.log('PocketBase executable already exists');
      return;
    } catch (error) {
      // PocketBase executable doesn't exist, download it
    }
    
    // Get download URL
    const downloadUrl = getPocketBaseUrl();
    console.log(`Downloading PocketBase from ${downloadUrl}...`);
    
    // Download and extract PocketBase
    const zipFile = path.join(PB_DIR, 'pocketbase.zip');
    
    // Download using curl
    execSync(`curl -L ${downloadUrl} -o ${zipFile}`, { stdio: 'inherit' });
    
    // Extract the zip file
    if (platform === 'win32') {
      // For Windows, use PowerShell to extract
      execSync(`powershell -command "Expand-Archive -Path ${zipFile} -DestinationPath ${PB_DIR} -Force"`, { stdio: 'inherit' });
    } else {
      // For Linux/macOS, use unzip
      execSync(`unzip -o ${zipFile} -d ${PB_DIR}`, { stdio: 'inherit' });
    }
    
    // Make the PocketBase executable executable on Linux/macOS
    if (platform !== 'win32') {
      execSync(`chmod +x ${pbExecutable}`, { stdio: 'inherit' });
    }
    
    // Remove the zip file
    await fs.unlink(zipFile);
    
    console.log('PocketBase setup completed successfully!');
  } catch (error) {
    console.error('Error setting up PocketBase:', error);
    process.exit(1);
  }
}

// Run the setup function
setupPocketBase();
