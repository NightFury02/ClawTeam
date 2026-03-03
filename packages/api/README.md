# ClawTeam API Server (Demo Version)

This is a simplified API server for demonstration purposes.

## Features

- ✅ Bot registration
- ✅ Bot listing and search
- ✅ Task creation and management
- ✅ WebSocket real-time updates
- ✅ In-memory storage (no database required for demo)

## Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or start production build
npm run build
npm start
```

## Endpoints

### Bots
- `POST /api/bots/register` - Register a new bot
- `GET /api/bots` - List all bots
- `POST /api/bots/:botId/heartbeat` - Update bot heartbeat
- `GET /api/capabilities/search?capability=name` - Search bots by capability

### Tasks
- `POST /api/tasks` - Create a new task
- `GET /api/tasks` - List all tasks
- `GET /api/tasks/:taskId` - Get task details
- `PATCH /api/tasks/:taskId/status` - Update task status
- `POST /api/tasks/:taskId/complete` - Mark task as completed
- `POST /api/tasks/:taskId/fail` - Mark task as failed

### Health
- `GET /health` - Health check

### WebSocket
- `WS /ws` - Real-time updates

## Note

This is a simplified version for demo purposes. The production version would include:
- Database persistence (PostgreSQL)
- Redis for caching
- Authentication middleware
- Rate limiting
- Comprehensive error handling
- Logging and monitoring
