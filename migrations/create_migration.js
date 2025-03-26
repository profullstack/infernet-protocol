#!/usr/bin/env node

/**
 * Create a new migration file with timestamp
 * 
 * Usage: node create_migration.js <migration_name>
 * Example: node create_migration.js create_users_collection
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(__dirname, 'scripts');
const TEMPLATE_PATH = path.join(SCRIPTS_DIR, 'migration_template.js');

async function createMigration() {
  try {
    // Get migration name from command line arguments
    const migrationName = process.argv[2];
    
    if (!migrationName) {
      console.error('Error: Migration name is required');
      console.log('Usage: node create_migration.js <migration_name>');
      console.log('Example: node create_migration.js create_users_collection');
      process.exit(1);
    }
    
    // Generate timestamp
    const timestamp = Date.now();
    
    // Create filename
    const filename = `${timestamp}_${migrationName}.js`;
    const filePath = path.join(SCRIPTS_DIR, filename);
    
    // Read template file
    const templateContent = await fs.readFile(TEMPLATE_PATH, 'utf8');
    
    // Replace placeholders
    const content = templateContent
      .replace(/\[MIGRATION_NAME\]/g, migrationName)
      .replace(/\[MIGRATION_DESCRIPTION\]/g, `This migration ${migrationName.replace(/_/g, ' ')}.`);
    
    // Write new migration file
    await fs.writeFile(filePath, content);
    
    console.log(`\n✅ Migration file created: ${filename}`);
    console.log(`Path: ${filePath}\n`);
  } catch (error) {
    console.error('Error creating migration file:', error);
    process.exit(1);
  }
}

// Run the function
createMigration();
