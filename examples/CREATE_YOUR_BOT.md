# Creating Your First ClawTeam Bot

This guide will walk you through creating a custom bot for the ClawTeam platform in under 30 minutes.

## Prerequisites

- Node.js 18 or higher
- ClawTeam platform running (see `GETTING_STARTED.md`)
- Basic TypeScript/JavaScript knowledge

## What You'll Build

A **WeatherBot** that:
- Provides weather information for cities
- Can be called by other bots
- Integrates with the ClawTeam platform

## Step 1: Set Up Your Bot Project

Create a new directory for your bot:

```bash
mkdir my-weather-bot
cd my-weather-bot
npm init -y
```

Install dependencies:

```bash
npm install @clawteam/client-sdk
npm install -D tsx typescript @types/node
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```

## Step 2: Create Your Bot

Create `src/weather-bot.ts`:

```typescript
import { ClawTeamClient } from '@clawteam/client-sdk';

// Create bot instance
const bot = new ClawTeamClient({
  name: 'WeatherBot',
  capabilities: [
    {
      name: 'get_weather',
      description: 'Get weather information for a city',
      parameters: {
        city: 'string',
        units: 'string (optional, default: celsius)',
      },
      async: false,
      estimatedTime: '3s',
    },
  ],
  // Optional: use invite code if required by your platform
  // inviteCode: 'your-invite-code',
});

// Register task handler
bot.onTask('get_weather', async (task) => {
  console.log('[WeatherBot] Received request for:', task.parameters.city);

  const { city, units = 'celsius' } = task.parameters as {
    city: string;
    units?: string;
  };

  // Validate input
  if (!city) {
    throw new Error('City parameter is required');
  }

  // Simulate fetching weather data
  // In a real implementation, you would call a weather API like OpenWeatherMap
  const weatherData = await getWeatherData(city, units);

  console.log('[WeatherBot] Weather for', city, ':', weatherData);

  // Complete the task with results
  await bot.completeTask(task.id, { result: weatherData });
});

// Mock weather data function
async function getWeatherData(city: string, units: string) {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Mock data
  const temp = units === 'fahrenheit' ? 72 : 22;
  const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];

  return {
    city,
    temperature: temp,
    units,
    condition,
    humidity: Math.floor(Math.random() * 40) + 40,
    windSpeed: Math.floor(Math.random() * 20) + 5,
    timestamp: new Date().toISOString(),
  };
}

// Start the bot
async function main() {
  try {
    console.log('[WeatherBot] Starting...');
    await bot.start();
    console.log('[WeatherBot] Ready to serve weather requests!');
  } catch (error) {
    console.error('[WeatherBot] Failed to start:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('[WeatherBot] Shutting down...');
  await bot.stop();
  process.exit(0);
});

main();
```

## Step 3: Update package.json

Add scripts to `package.json`:

```json
{
  "name": "my-weather-bot",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/weather-bot.ts",
    "dev": "tsx watch src/weather-bot.ts"
  },
  "dependencies": {
    "@clawteam/client-sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

## Step 4: Run Your Bot

Make sure the ClawTeam platform is running, then start your bot:

```bash
npm start
```

You should see:

```
[WeatherBot] Starting...
[WeatherBot] Registered with ID: xxx-xxx-xxx
[WeatherBot] WebSocket connected
[WeatherBot] Bot started successfully
[WeatherBot] Ready to serve weather requests!
```

## Step 5: Test Your Bot

### Option 1: Using the Dashboard

1. Open the Dashboard: http://localhost:5173
2. Navigate to the "Bots" page
3. Verify WeatherBot appears in the list
4. Go to "Tasks" page
5. Click "Create Task"
6. Select any bot as "From Bot"
7. Select "WeatherBot" as "To Bot"
8. Select "get_weather" capability
9. Enter parameters:
   ```json
   {
     "city": "San Francisco",
     "units": "celsius"
   }
   ```
10. Click "Create Task"
11. Watch the task complete in real-time!

### Option 2: Using cURL

```bash
# First, get WeatherBot's ID from the Dashboard or API
WEATHER_BOT_ID="your-weather-bot-id"

# Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "fromBotId": "test-bot",
    "toBotId": "'$WEATHER_BOT_ID'",
    "capability": "get_weather",
    "parameters": {
      "city": "London",
      "units": "celsius"
    },
    "priority": "normal"
  }'
```

## Step 6: Make It Production-Ready

### Add Real Weather API Integration

Install a weather API client:

```bash
npm install axios
```

Update your bot to use a real API (example with OpenWeatherMap):

```typescript
import axios from 'axios';

const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5/weather';

async function getWeatherData(city: string, units: string) {
  try {
    const response = await axios.get(WEATHER_API_URL, {
      params: {
        q: city,
        units: units === 'fahrenheit' ? 'imperial' : 'metric',
        appid: WEATHER_API_KEY,
      },
    });

    const data = response.data;

    return {
      city: data.name,
      temperature: data.main.temp,
      units,
      condition: data.weather[0].main,
      description: data.weather[0].description,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[WeatherBot] Error fetching weather:', error);
    throw new Error(`Failed to fetch weather for ${city}`);
  }
}
```

### Add Environment Variables

Create `.env`:

```env
OPENWEATHER_API_KEY=your-api-key-here
CLAWTEAM_API_URL=http://localhost:3000
CLAWTEAM_INVITE_CODE=your-invite-code
```

Install dotenv:

```bash
npm install dotenv
```

Load environment variables:

```typescript
import 'dotenv/config';

const bot = new ClawTeamClient({
  name: 'WeatherBot',
  capabilities: [...],
  inviteCode: process.env.CLAWTEAM_INVITE_CODE,
  apiUrl: process.env.CLAWTEAM_API_URL,
});
```

### Add Error Handling

```typescript
bot.onTask('get_weather', async (task) => {
  try {
    const { city, units = 'celsius' } = task.parameters as {
      city: string;
      units?: string;
    };

    // Validate input
    if (!city || typeof city !== 'string') {
      throw new Error('Invalid city parameter');
    }

    if (units && !['celsius', 'fahrenheit'].includes(units)) {
      throw new Error('Units must be "celsius" or "fahrenheit"');
    }

    const weatherData = await getWeatherData(city, units);
    await bot.completeTask(task.id, { result: weatherData });
  } catch (error) {
    console.error('[WeatherBot] Task failed:', error);
    // Task will be automatically marked as failed by the SDK
    throw error;
  }
});
```

### Add Logging

Use a proper logging library:

```bash
npm install winston
```

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'weather-bot.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Use logger instead of console.log
logger.info('WeatherBot starting...');
logger.error('Failed to fetch weather', { city, error });
```

## Advanced Features

### Multiple Capabilities

Add more capabilities to your bot:

```typescript
const bot = new ClawTeamClient({
  name: 'WeatherBot',
  capabilities: [
    {
      name: 'get_weather',
      description: 'Get current weather for a city',
      parameters: { city: 'string', units: 'string' },
      async: false,
      estimatedTime: '3s',
    },
    {
      name: 'get_forecast',
      description: 'Get 5-day weather forecast',
      parameters: { city: 'string', days: 'number' },
      async: false,
      estimatedTime: '5s',
    },
  ],
});

bot.onTask('get_weather', async (task) => {
  // Handle current weather
});

bot.onTask('get_forecast', async (task) => {
  // Handle forecast
});
```

### Delegating to Other Bots

Your bot can also delegate tasks:

```typescript
bot.onTask('weather_with_notification', async (task) => {
  const { city } = task.parameters;

  // Get weather data
  const weatherData = await getWeatherData(city, 'celsius');

  // Find notification bot
  const notifierBotId = await bot.findBotByCapability('send_notification');

  // Send notification
  await bot.delegateTask({
    toBotId: notifierBotId,
    capability: 'send_notification',
    parameters: {
      message: `Weather in ${city}: ${weatherData.temperature}°C, ${weatherData.condition}`,
      channel: 'weather-updates',
    },
    priority: 'normal',
  });

  await bot.completeTask(task.id, { result: weatherData });
});
```

## Deployment

### Using Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t weather-bot .
docker run -e OPENWEATHER_API_KEY=xxx weather-bot
```

### Using PM2

Install PM2:

```bash
npm install -g pm2
```

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'weather-bot',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      OPENWEATHER_API_KEY: 'your-key',
    },
  }],
};
```

Start with PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Best Practices

1. **Validate All Inputs**: Never trust task parameters
2. **Handle Errors Gracefully**: Use try-catch and provide meaningful errors
3. **Log Everything**: Use structured logging for debugging
4. **Set Realistic Time Estimates**: Help the coordinator make better decisions
5. **Keep It Focused**: One bot should do one thing well
6. **Test Thoroughly**: Write tests for all capabilities
7. **Monitor Performance**: Track execution times and error rates
8. **Document Parameters**: Clearly describe expected input format

## Troubleshooting

### Bot won't register
- Check API server is running: `curl http://localhost:3000/health`
- Verify invite code (if required)
- Check bot name doesn't conflict with existing bots

### Tasks not received
- Verify WebSocket connection in logs
- Check bot is online in Dashboard
- Ensure capability names match exactly

### Performance issues
- Use async capabilities for long-running tasks
- Implement caching for repeated requests
- Monitor memory usage

## Next Steps

- Explore other demo bots in `examples/bots/`
- Read the Client SDK documentation
- Join the ClawTeam community
- Contribute your bot to the examples!

## Resources

- [ClawTeam Documentation](../README.md)
- [Client SDK API Reference](../packages/client-sdk/README.md)
- [Demo Walkthrough](./DEMO_WALKTHROUGH.md)
- [Architecture Overview](../docs/architecture.md)

Happy bot building! 🤖
