#!/bin/sh

echo "Starting Infernet Protocol services..."

# Start PocketBase in the background
echo "Starting PocketBase on port 8080..."
/app/bin/pocketbase serve --http="0.0.0.0:8080" &

# Wait for PocketBase to start
sleep 3

# Start the web server
echo "Starting web server on port 3000..."
cd /app/web && node server/index.js
