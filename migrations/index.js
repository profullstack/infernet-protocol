import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'scripts');
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8080';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@example.com';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'password123';

/**
 * Run all migrations in order
 */
async function runMigrations() {
  console.log(`Connecting to PocketBase at ${PB_URL}`);
  const pb = new PocketBase(PB_URL);
  
  try {
    // Admin authentication is required for schema modifications
    console.log('Authenticating as admin...');
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
    
    // Get all migration files
    console.log('Reading migration files...');
    const files = await fs.readdir(MIGRATIONS_DIR);
    const migrationFiles = files
      .filter(file => file.endsWith('.js') && !file.includes('rename_migrations') && !file.includes('migration_template'))
      .sort((a, b) => {
        // Extract timestamp from filename (timestamp_name.js)
        // Use string comparison for timestamps to avoid potential precision issues with large integers
        const timestampPartA = a.split('_')[0];
        const timestampPartB = b.split('_')[0];
        
        // Check if both parts are numeric timestamps
        const isTimestampA = /^\d+$/.test(timestampPartA);
        const isTimestampB = /^\d+$/.test(timestampPartB);
        
        // If both filenames start with timestamps, sort by timestamp (as strings to preserve full precision)
        if (isTimestampA && isTimestampB) {
          // If timestamps are the same length (both are timestamps), compare them directly
          if (timestampPartA.length === timestampPartB.length) {
            return timestampPartA.localeCompare(timestampPartB);
          }
          // If lengths differ, pad the shorter one with zeros for proper comparison
          return timestampPartA.length - timestampPartB.length;
        }
        
        // If only one filename starts with a timestamp, prioritize it
        if (isTimestampA) return -1;
        if (isTimestampB) return 1;
        
        // For non-timestamp filenames (e.g., old format 001_xxx.js), sort numerically if possible
        const numA = parseInt(timestampPartA);
        const numB = parseInt(timestampPartB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        
        // Otherwise, fall back to alphabetical sorting
        return a.localeCompare(b);
      });
      
    // Log the sorted migration files for verification
    console.log('Migration files will be executed in this order:');
    migrationFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file}`);
    });
    
    console.log(`Found ${migrationFiles.length} migration files`);
    
    // Run each migration in order
    for (const file of migrationFiles) {
      console.log(`\nRunning migration: ${file}`);
      const migrationPath = path.join(MIGRATIONS_DIR, file);
      const migration = await import(migrationPath);
      
      if (typeof migration.up !== 'function') {
        console.warn(`Warning: Migration ${file} does not export an 'up' function. Skipping.`);
        continue;
      }
      
      try {
        await migration.up(pb);
        console.log(`✅ Migration ${file} completed successfully`);
      } catch (error) {
        console.error(`❌ Migration ${file} failed:`, error);
        // Depending on your strategy, you might want to break here
        // or continue with the next migration
        if (error.message.includes('already exists')) {
          console.log(`⚠️ Collection already exists, continuing...`);
        } else {
          throw error; // Re-throw to stop the migration process
        }
      }
    }
    
    console.log('\n🎉 All migrations completed successfully');
  } catch (error) {
    console.error('\n❌ Migration process failed:', error);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

export { runMigrations };
