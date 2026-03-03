#!/bin/bash

set -e  # Exit on error

echo "🚀 Starting ClawTeam Demo Environment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/../.."

cd "$PROJECT_ROOT"

# Step 1: Check prerequisites
echo -e "${BLUE}[1/7]${NC} Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Warning:${NC} Docker is not installed or not running"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Warning:${NC} Node.js is not installed"
    exit 1
fi

echo -e "${GREEN}✓${NC} Prerequisites check passed"
echo ""

# Step 2: Install dependencies if needed
echo -e "${BLUE}[2/7]${NC} Installing dependencies..."

if [ ! -d "node_modules" ]; then
    npm install
else
    echo -e "${GREEN}✓${NC} Dependencies already installed"
fi

if [ ! -d "packages/api/node_modules" ]; then
    echo "Installing API dependencies..."
    cd packages/api && npm install && cd ../..
fi

if [ ! -d "packages/client-sdk/node_modules" ]; then
    echo "Installing Client SDK dependencies..."
    cd packages/client-sdk && npm install && cd ../..
fi

if [ ! -d "packages/dashboard/node_modules" ]; then
    echo "Installing Dashboard dependencies..."
    cd packages/dashboard && npm install && cd ../..
fi

if [ ! -d "examples/node_modules" ]; then
    echo "Installing Examples dependencies..."
    cd examples && npm install && cd ..
fi

echo ""

# Step 3: Start infrastructure
echo -e "${BLUE}[3/7]${NC} Starting infrastructure (PostgreSQL, Redis)..."

docker-compose up -d postgres redis

echo -e "${YELLOW}⏳${NC} Waiting for services to be ready..."
sleep 5

echo -e "${GREEN}✓${NC} Infrastructure started"
echo ""

# Step 4: Run database migrations
echo -e "${BLUE}[4/7]${NC} Running database migrations..."

if [ -f "packages/api/migrations/001_initial.sql" ]; then
    # Run migrations if they exist
    export PGPASSWORD=clawteam_dev
    psql -h localhost -U clawteam_user -d clawteam_dev -f packages/api/migrations/001_initial.sql 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Migrations completed"
else
    echo -e "${YELLOW}⚠${NC}  No migrations found (this is OK for first run)"
fi

echo ""

# Create logs directory
mkdir -p logs

# Step 5: Start API server
echo -e "${BLUE}[5/7]${NC} Starting API server..."

cd packages/api
npm run dev > ../../logs/api.log 2>&1 &
API_PID=$!
echo $API_PID > ../../.demo-api.pid
cd ../..

echo -e "${YELLOW}⏳${NC} Waiting for API server to start..."
sleep 8

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} API server started (PID: $API_PID)"
else
    echo -e "${YELLOW}⚠${NC}  API server may still be starting..."
fi

echo ""

# Step 6: Start Dashboard
echo -e "${BLUE}[6/7]${NC} Starting Dashboard..."

cd packages/dashboard
npm run dev > ../../logs/dashboard.log 2>&1 &
DASHBOARD_PID=$!
echo $DASHBOARD_PID > ../../.demo-dashboard.pid
cd ../..

echo -e "${GREEN}✓${NC} Dashboard started (PID: $DASHBOARD_PID)"
echo ""

# Step 7: Start demo bots
echo -e "${BLUE}[7/7]${NC} Starting demo bots..."

cd examples

# Start DataAnalyzer
npm run start:analyzer > ../logs/data-analyzer.log 2>&1 &
ANALYZER_PID=$!
echo $ANALYZER_PID > ../.demo-analyzer.pid
echo -e "${GREEN}✓${NC} DataAnalyzer bot started (PID: $ANALYZER_PID)"

sleep 2

# Start Notifier
npm run start:notifier > ../logs/notifier.log 2>&1 &
NOTIFIER_PID=$!
echo $NOTIFIER_PID > ../.demo-notifier.pid
echo -e "${GREEN}✓${NC} Notifier bot started (PID: $NOTIFIER_PID)"

sleep 2

# Start Orchestrator
npm run start:orchestrator > ../logs/orchestrator.log 2>&1 &
ORCHESTRATOR_PID=$!
echo $ORCHESTRATOR_PID > ../.demo-orchestrator.pid
echo -e "${GREEN}✓${NC} Orchestrator bot started (PID: $ORCHESTRATOR_PID)"

cd ..

echo ""
echo -e "${GREEN}✅ Demo environment started successfully!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}📊 Dashboard:${NC}        http://localhost:5173"
echo -e "${BLUE}🔧 API Server:${NC}       http://localhost:3000"
echo -e "${BLUE}📚 API Docs:${NC}         http://localhost:3000/docs"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}🎮 Demo Scenario:${NC}"
echo "  1. Open Dashboard at http://localhost:5173"
echo "  2. Navigate to 'Bots' to see the 3 registered bots"
echo "  3. Go to 'Tasks' and click 'Create Task'"
echo "  4. Select Orchestrator bot and use capability 'process_workflow'"
echo "  5. Parameters: {\"data\": [1, 2, 3, 4, 5]}"
echo "  6. Watch the tasks flow in real-time!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}💡 Logs:${NC}"
echo "  - API:          tail -f logs/api.log"
echo "  - Dashboard:    tail -f logs/dashboard.log"
echo "  - DataAnalyzer: tail -f logs/data-analyzer.log"
echo "  - Notifier:     tail -f logs/notifier.log"
echo "  - Orchestrator: tail -f logs/orchestrator.log"
echo ""
echo -e "${YELLOW}⏹  To stop:${NC} bash scripts/demo/stop-demo.sh"
echo ""
