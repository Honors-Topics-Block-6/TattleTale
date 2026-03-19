#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         TattleTale Dev Runner          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Build shared package
echo -e "${YELLOW}Building shared package...${NC}"
npm run build:shared

# Parse arguments
MODE="${1:-web}"

case "$MODE" in
    web)
        echo -e "${GREEN}Starting web client only...${NC}"
        echo -e "${BLUE}Open http://localhost:5173 in your browser${NC}"
        echo
        npm run dev -w @tattletale/web
        ;;
    server)
        echo -e "${GREEN}Starting server only...${NC}"
        echo -e "${YELLOW}Note: Requires Redis and PostgreSQL to be running${NC}"
        echo
        npm run dev -w @tattletale/server
        ;;
    all)
        echo -e "${GREEN}Starting full stack (web + server)...${NC}"
        echo -e "${YELLOW}Note: Requires Redis and PostgreSQL to be running${NC}"
        echo
        npm run dev
        ;;
    build)
        echo -e "${GREEN}Building all packages...${NC}"
        npm run build
        ;;
    *)
        echo -e "${RED}Unknown mode: $MODE${NC}"
        echo
        echo "Usage: ./run.sh [mode]"
        echo
        echo "Modes:"
        echo "  web     - Start web client only (default)"
        echo "  server  - Start server only (requires Redis/PostgreSQL)"
        echo "  all     - Start both web and server"
        echo "  build   - Build all packages"
        exit 1
        ;;
esac
