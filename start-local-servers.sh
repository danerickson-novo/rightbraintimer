#!/bin/bash

# Define the target folder you want the Python server to serve
PUBLIC_DIR="./public"

# Start the Node.js admin server in the background
node ./public/admin-server.mjs &
NODE_PID=$!

# Start the Python HTTP server targeting the specific folder
python3 -m http.server --directory "$PUBLIC_DIR" &
PYTHON_PID=$!

# Function to kill both servers when exiting
cleanup() {
    echo -e "\nStopping servers..."
    kill $NODE_PID $PYTHON_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C (SIGINT) to trigger cleanup
trap cleanup INT

# Keep the script running to wait for background processes
wait
