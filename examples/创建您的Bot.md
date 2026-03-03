# 创建您的第一个 ClawTeam Bot

本指南将带您在 30 分钟内创建一个自定义 bot for ClawTeam 平台。

## 前置要求

- Node.js 18 或更高版本
- ClawTeam 平台正在运行（参见 `快速开始.md`）
- 基本的 TypeScript/JavaScript 知识

## 您将构建什么

一个 **WeatherBot**，可以：
- 提供城市的天气信息
- 被其他 bots 调用
- 与 ClawTeam 平台集成

## 步骤 1：设置您的 Bot 项目

为您的 bot 创建新目录：

```bash
mkdir my-weather-bot
cd my-weather-bot
npm init -y
```

安装依赖：

```bash
npm install @clawteam/client-sdk
npm install -D tsx typescript @types/node
```

创建 `tsconfig.json`：

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

## 步骤 2：创建您的 Bot

创建 `src/weather-bot.ts`：

```typescript
import { ClawTeamClient } from '@clawteam/client-sdk';

// 创建 bot 实例
const bot = new ClawTeamClient({
  name: 'WeatherBot',
  capabilities: [
    {
      name: 'get_weather',
      description: '获取城市的天气信息',
      parameters: {
        city: 'string',
        units: 'string (可选，默认：摄氏度)',
      },
      async: false,
      estimatedTime: '3s',
    },
  ],
  // 可选：如果平台需要，使用邀请码
  // inviteCode: 'your-invite-code',
});

// 注册任务处理器
bot.onTask('get_weather', async (task) => {
  console.log('[WeatherBot] 收到请求:', task.parameters.city);

  const { city, units = 'celsius' } = task.parameters as {
    city: string;
    units?: string;
  };

  // 验证输入
  if (!city) {
    throw new Error('City 参数是必需的');
  }

  // 模拟获取天气数据
  // 在真实实现中，您会调用天气 API，如 OpenWeatherMap
  const weatherData = await getWeatherData(city, units);

  console.log('[WeatherBot]', city, '的天气:', weatherData);

  // 用结果完成任务
  await bot.completeTask(task.id, { result: weatherData });
});

// 模拟天气数据函数
async function getWeatherData(city: string, units: string) {
  // 模拟 API 延迟
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 模拟数据
  const temp = units === 'fahrenheit' ? 72 : 22;
  const conditions = ['晴朗', '多云', '下雨', '局部多云'];
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

// 启动 bot
async function main() {
  try {
    console.log('[WeatherBot] 正在启动...');
    await bot.start();
    console.log('[WeatherBot] 准备提供天气请求！');
  } catch (error) {
    console.error('[WeatherBot] 启动失败:', error);
    process.exit(1);
  }
}

// 处理关闭
process.on('SIGINT', async () => {
  console.log('[WeatherBot] 正在关闭...');
  await bot.stop();
  process.exit(0);
});

main();
```

## 步骤 3：更新 package.json

将脚本添加到 `package.json`：

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

## 步骤 4：运行您的 Bot

确保 ClawTeam 平台正在运行，然后启动您的 bot：

```bash
npm start
```

您应该看到：

```
[WeatherBot] 正在启动...
[WeatherBot] 已注册，ID: xxx-xxx-xxx
[WeatherBot] WebSocket 已连接
[WeatherBot] Bot 启动成功
[WeatherBot] 准备提供天气请求！
```

## 步骤 5：测试您的 Bot

### 选项 1：使用 Dashboard

1. 打开 Dashboard：http://localhost:5173
2. 导航到 "Bots" 页面
3. 验证 WeatherBot 出现在列表中
4. 转到 "Tasks" 页面
5. 点击 "Create Task"
6. 选择任意 bot 作为 "From Bot"
7. 选择 "WeatherBot" 作为 "To Bot"
8. 选择 "get_weather" 能力
9. 输入参数：
   ```json
   {
     "city": "旧金山",
     "units": "celsius"
   }
   ```
10. 点击 "Create Task"
11. 实时观察任务完成！

### 选项 2：使用 cURL

```bash
# 首先，从 Dashboard 或 API 获取 WeatherBot 的 ID
WEATHER_BOT_ID="your-weather-bot-id"

# 创建任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "fromBotId": "test-bot",
    "toBotId": "'$WEATHER_BOT_ID'",
    "capability": "get_weather",
    "parameters": {
      "city": "伦敦",
      "units": "celsius"
    },
    "priority": "normal"
  }'
```

## 步骤 6：使其生产就绪

### 添加真实天气 API 集成

安装天气 API 客户端：

```bash
npm install axios
```

使用真实 API 更新您的 bot（以 OpenWeatherMap 为例）：

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
    console.error('[WeatherBot] 获取天气错误:', error);
    throw new Error(`无法获取 ${city} 的天气`);
  }
}
```

### 添加环境变量

创建 `.env`：

```env
OPENWEATHER_API_KEY=your-api-key-here
CLAWTEAM_API_URL=http://localhost:3000
CLAWTEAM_INVITE_CODE=your-invite-code
```

安装 dotenv：

```bash
npm install dotenv
```

加载环境变量：

```typescript
import 'dotenv/config';

const bot = new ClawTeamClient({
  name: 'WeatherBot',
  capabilities: [...],
  inviteCode: process.env.CLAWTEAM_INVITE_CODE,
  apiUrl: process.env.CLAWTEAM_API_URL,
});
```

### 添加错误处理

```typescript
bot.onTask('get_weather', async (task) => {
  try {
    const { city, units = 'celsius' } = task.parameters as {
      city: string;
      units?: string;
    };

    // 验证输入
    if (!city || typeof city !== 'string') {
      throw new Error('无效的 city 参数');
    }

    if (units && !['celsius', 'fahrenheit'].includes(units)) {
      throw new Error('Units 必须是 "celsius" 或 "fahrenheit"');
    }

    const weatherData = await getWeatherData(city, units);
    await bot.completeTask(task.id, { result: weatherData });
  } catch (error) {
    console.error('[WeatherBot] 任务失败:', error);
    // SDK 会自动将任务标记为失败
    throw error;
  }
});
```

### 添加日志

使用适当的日志库：

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

// 使用 logger 代替 console.log
logger.info('WeatherBot 正在启动...');
logger.error('获取天气失败', { city, error });
```

## 高级功能

### 多个能力

为您的 bot 添加更多能力：

```typescript
const bot = new ClawTeamClient({
  name: 'WeatherBot',
  capabilities: [
    {
      name: 'get_weather',
      description: '获取城市的当前天气',
      parameters: { city: 'string', units: 'string' },
      async: false,
      estimatedTime: '3s',
    },
    {
      name: 'get_forecast',
      description: '获取 5 天天气预报',
      parameters: { city: 'string', days: 'number' },
      async: false,
      estimatedTime: '5s',
    },
  ],
});

bot.onTask('get_weather', async (task) => {
  // 处理当前天气
});

bot.onTask('get_forecast', async (task) => {
  // 处理预报
});
```

### 委托给其他 Bots

您的 bot 也可以委托任务：

```typescript
bot.onTask('weather_with_notification', async (task) => {
  const { city } = task.parameters;

  // 获取天气数据
  const weatherData = await getWeatherData(city, 'celsius');

  // 查找通知 bot
  const notifierBotId = await bot.findBotByCapability('send_notification');

  // 发送通知
  await bot.delegateTask({
    toBotId: notifierBotId,
    capability: 'send_notification',
    parameters: {
      message: `${city} 的天气：${weatherData.temperature}°C，${weatherData.condition}`,
      channel: 'weather-updates',
    },
    priority: 'normal',
  });

  await bot.completeTask(task.id, { result: weatherData });
});
```

## 部署

### 使用 Docker

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["npm", "start"]
```

构建并运行：

```bash
docker build -t weather-bot .
docker run -e OPENWEATHER_API_KEY=xxx weather-bot
```

### 使用 PM2

安装 PM2：

```bash
npm install -g pm2
```

创建 `ecosystem.config.js`：

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

使用 PM2 启动：

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 最佳实践

1. **验证所有输入**：永远不要信任任务参数
2. **优雅地处理错误**：使用 try-catch 并提供有意义的错误
3. **记录所有内容**：使用结构化日志以便调试
4. **设置实际的时间估计**：帮助协调器做出更好的决策
5. **保持专注**：一个 bot 应该做好一件事
6. **彻底测试**：为所有能力编写测试
7. **监控性能**：跟踪执行时间和错误率
8. **记录参数**：清楚描述预期的输入格式

## 故障排除

### Bot 无法注册
- 检查 API 服务器是否运行：`curl http://localhost:3000/health`
- 验证邀请码（如果需要）
- 检查 bot 名称是否与现有 bots 冲突

### 未收到任务
- 验证日志中的 WebSocket 连接
- 检查 bot 在 Dashboard 中在线
- 确保能力名称完全匹配

### 性能问题
- 对长时间运行的任务使用异步能力
- 为重复请求实现缓存
- 监控内存使用

## 下一步

- 探索 `examples/bots/` 中的其他演示 bots
- 阅读 Client SDK 文档
- 加入 ClawTeam 社区
- 将您的 bot 贡献到示例！

## 资源

- [ClawTeam 文档](../README.md)
- [Client SDK API 参考](../packages/client-sdk/README.md)
- [演示详解](./演示详解.md)
- [架构概览](../docs/architecture.md)

愉快地构建 bot！🤖
