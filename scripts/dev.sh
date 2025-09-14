#!/bin/bash

echo "🚀 Starting Verilog Core API in development mode..."

# Compile TypeScript
echo "📦 Compiling TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed"
    exit 1
fi

# Start the server
echo "🌐 Starting HTTP server..."
CORE_PORT=3000 node out/index.js