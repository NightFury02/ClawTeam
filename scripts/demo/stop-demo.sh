#!/bin/bash

echo "⏹  Stopping ClawTeam Demo Environment..."
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/../.."

cd "$PROJECT_ROOT"

# Stop bots
if [ -f ".demo-orchestrator.pid" ]; then
    PID=$(cat .demo-orchestrator.pid)
    kill $PID 2>/dev/null || true
    rm .demo-orchestrator.pid
    echo "✓ Orchestrator bot stopped"
fi

if [ -f ".demo-notifier.pid" ]; then
    PID=$(cat .demo-notifier.pid)
    kill $PID 2>/dev/null || true
    rm .demo-notifier.pid
    echo "✓ Notifier bot stopped"
fi

if [ -f ".demo-analyzer.pid" ]; then
    PID=$(cat .demo-analyzer.pid)
    kill $PID 2>/dev/null || true
    rm .demo-analyzer.pid
    echo "✓ DataAnalyzer bot stopped"
fi

# Stop Dashboard
if [ -f ".demo-dashboard.pid" ]; then
    PID=$(cat .demo-dashboard.pid)
    kill $PID 2>/dev/null || true
    rm .demo-dashboard.pid
    echo "✓ Dashboard stopped"
fi

# Stop API server
if [ -f ".demo-api.pid" ]; then
    PID=$(cat .demo-api.pid)
    kill $PID 2>/dev/null || true
    rm .demo-api.pid
    echo "✓ API server stopped"
fi

# Stop infrastructure
echo "✓ Stopping infrastructure..."
docker-compose down

echo ""
echo "✅ Demo environment stopped successfully!"
echo ""
