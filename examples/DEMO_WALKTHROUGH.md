# ClawTeam Platform - Demo Walkthrough

This document provides a detailed walkthrough of the ClawTeam demo scenario, explaining how bots collaborate to process data.

## Overview

The demo showcases a complete bot collaboration workflow where:
- **Orchestrator Bot** coordinates a multi-step workflow
- **DataAnalyzer Bot** performs statistical analysis
- **Notifier Bot** sends notifications

## Demo Scenario: Data Processing Workflow

### Participating Bots

#### 1. Orchestrator Bot
**Role**: Workflow coordinator

**Capabilities**:
- `process_workflow`: Orchestrates multi-step data processing

**Responsibilities**:
- Receives workflow requests from users
- Discovers bots with required capabilities
- Delegates tasks to appropriate bots
- Aggregates results

#### 2. DataAnalyzer Bot
**Role**: Data analysis specialist

**Capabilities**:
- `analyze_data`: Analyzes numerical data arrays

**Responsibilities**:
- Accepts array of numbers
- Calculates statistics (sum, average, min, max, median, standard deviation)
- Returns analysis results

#### 3. Notifier Bot
**Role**: Notification service

**Capabilities**:
- `send_notification`: Sends notifications to channels

**Responsibilities**:
- Accepts notification messages
- Delivers to specified channels
- Confirms delivery

## Workflow Execution

### Step-by-Step Flow

```
User Request → Orchestrator → DataAnalyzer → Notifier → Complete
```

### Detailed Steps

#### Step 0: User Initiates Workflow
```json
{
  "toBotId": "orchestrator-bot-id",
  "capability": "process_workflow",
  "parameters": {
    "data": [1, 2, 3, 4, 5]
  },
  "priority": "normal"
}
```

#### Step 1: Orchestrator Receives Task
- Orchestrator bot receives `process_workflow` task
- Validates input parameters
- Plans workflow execution

#### Step 2: Find DataAnalyzer Bot
- Orchestrator searches for bot with `analyze_data` capability
- Uses Capability Registry API: `/api/capabilities/search?capability=analyze_data`
- Finds DataAnalyzer bot

#### Step 3: Delegate Analysis Task
Orchestrator creates task for DataAnalyzer:
```json
{
  "fromBotId": "orchestrator-bot-id",
  "toBotId": "data-analyzer-bot-id",
  "capability": "analyze_data",
  "parameters": {
    "data": [1, 2, 3, 4, 5]
  },
  "priority": "normal"
}
```

#### Step 4: DataAnalyzer Processes Data
DataAnalyzer receives task via WebSocket and calculates:
```json
{
  "count": 5,
  "sum": 15,
  "avg": 3,
  "min": 1,
  "max": 5,
  "median": 3,
  "stdDev": 1.414
}
```

#### Step 5: Find Notifier Bot
- Orchestrator searches for bot with `send_notification` capability
- Finds Notifier bot

#### Step 6: Send Notification
Orchestrator creates task for Notifier:
```json
{
  "fromBotId": "orchestrator-bot-id",
  "toBotId": "notifier-bot-id",
  "capability": "send_notification",
  "parameters": {
    "message": "Data analysis completed! Results: avg=3.00, min=1, max=5, count=5",
    "channel": "workflow-status"
  },
  "priority": "normal"
}
```

#### Step 7: Complete Workflow
Orchestrator marks the workflow task as completed:
```json
{
  "success": true,
  "analysisResult": { ... },
  "processedAt": "2026-02-03T10:30:00Z"
}
```

## Expected Timeline

Total workflow duration: **< 10 seconds**

- Task creation: ~100ms
- Bot discovery: ~200ms per capability
- Analysis execution: ~5s
- Notification: ~2s
- Total overhead: ~1s

## Running the Demo

### Quick Start

```bash
# Terminal 1: Start demo environment
bash scripts/demo/start-demo.sh

# Wait for all services to start (~30 seconds)

# Browser: Open Dashboard
open http://localhost:5173

# Terminal 2: Trigger workflow (optional - use Dashboard instead)
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "fromBotId": "user",
    "toBotId": "orchestrator-bot-id",
    "capability": "process_workflow",
    "parameters": {"data": [10, 20, 30, 40, 50]},
    "priority": "normal"
  }'
```

### Using the Dashboard

1. **Navigate to Bots Page**
   - See 3 registered bots
   - Check their online status
   - View their capabilities

2. **Create a Task**
   - Go to Tasks page
   - Click "Create Task" button
   - Select "Orchestrator" as "To Bot"
   - Select "process_workflow" capability
   - Enter parameters: `{"data": [1, 2, 3, 4, 5]}`
   - Click "Create Task"

3. **Watch Real-Time Updates**
   - Task appears in task list
   - Status changes: pending → processing → completed
   - See sub-tasks for DataAnalyzer and Notifier
   - All updates happen automatically (WebSocket)

## Expected Output

### Dashboard View

**Bot List Page:**
```
┌─────────────────────────────────────┐
│ DataAnalyzer         [online]       │
│ • analyze_data                      │
│   Analyzes numerical data           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Notifier             [online]       │
│ • send_notification                 │
│   Sends notifications               │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Orchestrator         [online]       │
│ • process_workflow                  │
│   Coordinates workflow              │
└─────────────────────────────────────┘
```

**Task List Page:**
```
┌─────────────────────────────────────┐
│ process_workflow    [completed]     │
│ Orchestrator → Orchestrator         │
│ Duration: 8.5s                      │
│ Result: { success: true, ... }      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ analyze_data        [completed]     │
│ Orchestrator → DataAnalyzer         │
│ Duration: 5.2s                      │
│ Result: { avg: 3, min: 1, ... }     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ send_notification   [completed]     │
│ Orchestrator → Notifier             │
│ Duration: 2.1s                      │
│ Result: { sent: true }              │
└─────────────────────────────────────┘
```

### Terminal Output

**DataAnalyzer Log:**
```
[DataAnalyzer] Starting bot...
[DataAnalyzer] Registered with ID: abc-123
[DataAnalyzer] WebSocket connected
[DataAnalyzer] Bot started successfully
[DataAnalyzer] Received task: analyze_data (task-456)
[DataAnalyzer] Processing task: task-456
[DataAnalyzer] Analysis result: { count: 5, sum: 15, avg: 3, ... }
[DataAnalyzer] Task completed: task-456
```

**Notifier Log:**
```
[Notifier] Starting bot...
[Notifier] Registered with ID: def-789
[Notifier] WebSocket connected
[Notifier] Bot started successfully
[Notifier] Processing notification: task-789
[Notifier] 📢 Notification sent to workflow-status:
[Notifier] Message: Data analysis completed! Results: avg=3.00, min=1, max=5, count=5
```

**Orchestrator Log:**
```
[Orchestrator] Starting bot...
[Orchestrator] Registered with ID: ghi-012
[Orchestrator] WebSocket connected
[Orchestrator] Bot started successfully
[Orchestrator] Starting workflow: task-123
[Orchestrator] Step 1: Finding DataAnalyzer bot...
[Orchestrator] Found DataAnalyzer: abc-123
[Orchestrator] Step 2: Delegating analysis task...
[Orchestrator] Waiting for analysis to complete...
[Orchestrator] Analysis complete: { avg: 3, ... }
[Orchestrator] Step 3: Finding Notifier bot...
[Orchestrator] Found Notifier: def-789
[Orchestrator] Step 4: Sending notification...
[Orchestrator] Workflow completed successfully
```

## Troubleshooting

### Common Issues

#### Bots not appearing in Dashboard
- Check bot logs: `tail -f logs/data-analyzer.log`
- Verify API server is running: `curl http://localhost:3000/health`
- Check database connection

#### Tasks not executing
- Verify bots are online (green status in Dashboard)
- Check WebSocket connection in browser console
- Review API server logs: `tail -f logs/api.log`

#### WebSocket disconnections
- Check firewall settings
- Verify port 3000 is accessible
- Look for connection errors in logs

### Getting Help

If you encounter issues:
1. Check all logs in the `logs/` directory
2. Verify all services are running: `ps aux | grep node`
3. Check Docker services: `docker-compose ps`
4. Review error messages in browser console (F12)

## Next Steps

After completing the demo:

1. **Explore the Code**
   - Review bot implementations in `examples/bots/`
   - Study the Client SDK in `packages/client-sdk/`
   - Examine Dashboard components in `packages/dashboard/`

2. **Create Your Own Bot**
   - Follow the guide: `examples/CREATE_YOUR_BOT.md`
   - Experiment with different capabilities
   - Test bot interactions

3. **Customize the Workflow**
   - Modify Orchestrator logic
   - Add new capabilities to existing bots
   - Create new demo scenarios

4. **Deep Dive**
   - Read architecture docs: `docs/architecture.md`
   - Explore API documentation: http://localhost:3000/docs
   - Study the core modules (Task Coordinator, Message Bus, etc.)

## Demo Variations

### Variation 1: Large Dataset
```json
{
  "data": [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
}
```

### Variation 2: Multiple Workflows
Create multiple tasks simultaneously to see parallel processing.

### Variation 3: Priority Testing
Create tasks with different priorities (urgent, high, normal, low) to observe task ordering.

### Variation 4: Error Handling
Try invalid input to see error handling:
```json
{
  "data": "not-an-array"
}
```

## Architecture Highlights

The demo showcases these key platform features:

1. **Dynamic Bot Discovery**: Bots find each other by capability
2. **Asynchronous Task Delegation**: Fire-and-forget task creation
3. **Real-Time Updates**: WebSocket-based status updates
4. **Priority Queuing**: Tasks processed by priority
5. **Error Handling**: Graceful failure and retry
6. **Observability**: Full visibility into task flow

## Performance Metrics

Expected performance for the demo workflow:

- **Bot Registration**: < 500ms
- **Capability Search**: < 100ms
- **Task Creation**: < 50ms
- **Task Dispatch**: < 200ms (via WebSocket)
- **End-to-End Workflow**: < 10s

Monitor these in the Dashboard's task cards (Duration field).
