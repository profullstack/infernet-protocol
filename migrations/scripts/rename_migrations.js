/**
 * Script to rename migration files with timestamps
 * 
 * This script renames the existing migration files to use Unix timestamps
 * as prefixes for better sorting and organization.
 */

import fs from 'fs';
import path from 'path';

const SCRIPTS_DIR = path.resolve('./migrations/scripts');

// Function to rename migration files
async function renameMigrations() {
  try {
    // Get all migration files
    const files = fs.readdirSync(SCRIPTS_DIR);
    
    // Filter out non-migration files
    const migrationFiles = files.filter(file => 
      file.match(/^\d{3}_.*\.js$/) && !file.includes('rename_migrations')
    );
    
    console.log(`Found ${migrationFiles.length} migration files to rename`);
    
    // Sort files by their current numeric prefix
    migrationFiles.sort((a, b) => {
      const numA = parseInt(a.split('_')[0]);
      const numB = parseInt(b.split('_')[0]);
      return numA - numB;
    });
    
    // Get current timestamp as base
    const now = Date.now();
    const ONE_MINUTE = 60 * 1000;
    
    // Rename each file with a timestamp
    // Using increments of 1 minute to ensure proper ordering
    const renamedFiles = [];
    
    for (let i = 0; i < migrationFiles.length; i++) {
      const file = migrationFiles[i];
      const timestamp = now + (i * ONE_MINUTE);
      const newName = file.replace(/^\d{3}_/, `${timestamp}_`);
      
      const oldPath = path.join(SCRIPTS_DIR, file);
      const newPath = path.join(SCRIPTS_DIR, newName);
      
      fs.renameSync(oldPath, newPath);
      console.log(`Renamed ${file} to ${newName}`);
      
      renamedFiles.push({
        oldName: file,
        newName: newName
      });
    }
    
    console.log('\nAll migration files renamed successfully!');
    console.log('\nNew migration filenames:');
    renamedFiles.forEach(file => {
      console.log(`${file.oldName} -> ${file.newName}`);
    });
    
    return renamedFiles;
  } catch (error) {
    console.error('Error renaming migration files:', error);
    throw error;
  }
}

// Execute the function
renameMigrations().catch(console.error);
