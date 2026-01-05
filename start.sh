#!/bin/bash
# GAIOL Web Server Start Script (Linux/macOS)
# This script starts the GAIOL web server with proper environment configuration

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Change to script directory
cd "$(dirname "$0")"

echo -e "${CYAN}🚀 Starting GAIOL Web Server...${NC}"
echo ""

# Load .env file if it exists
if [ -f .env ]; then
    echo -e "${GREEN}📄 Loading environment variables from .env file...${NC}"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}⚠️  No .env file found. Using environment variables or defaults.${NC}"
    echo -e "${YELLOW}   Create a .env file with your API keys for full functionality.${NC}"
fi

# Check required environment variables
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  Warning: OPENROUTER_API_KEY not set${NC}"
fi

if [ -z "$SUPABASE_URL" ] && [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  Warning: Supabase credentials not set - authentication features will be disabled${NC}"
fi

# Check if server is already running
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Server is already running on port 8080!${NC}"
    echo -e "${YELLOW}   Stop the existing server first, or use a different port.${NC}"
    echo ""
    HEALTH=$(curl -s http://localhost:8080/health)
    echo -e "${CYAN}Current server status:${NC}"
    echo "$HEALTH" | grep -o '"status":"[^"]*"' | head -1
    echo ""
    echo -e "${GREEN}Access at: http://localhost:8080${NC}"
    exit 0
fi

# Check if binary exists, build if needed
if [ ! -f "./web-server" ] || [ "$1" = "--build" ]; then
    echo -e "${CYAN}🔨 Building web server...${NC}"
    go build -o web-server ./cmd/web-server/main.go
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Build failed!${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo ""
fi

# Start the server
echo -e "${CYAN}🌐 Starting web server...${NC}"
echo ""

./web-server &
SERVER_PID=$!

# Wait a moment for server to start
sleep 3

# Check if server started successfully
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:8080/health)
    echo -e "${GREEN}✅ GAIOL Web Server is running!${NC}"
    echo ""
    echo -e "${CYAN}Server Status:${NC}"
    echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
    echo ""
    echo -e "${GREEN}📍 Access the application at: http://localhost:8080${NC}"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
    
    # Wait for server process
    wait $SERVER_PID
else
    echo -e "${RED}❌ Server failed to start or is not responding${NC}"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi
