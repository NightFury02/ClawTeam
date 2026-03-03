import { ClawTeamClient } from '@clawteam/client-sdk';

const bot = new ClawTeamClient({
  name: 'DataAnalyzer',
  capabilities: [
    {
      name: 'analyze_data',
      description: 'Analyze array of numbers and return statistical information',
      parameters: {
        data: 'number[]',
      },
      async: false,
      estimatedTime: '5s',
    },
  ],
});

bot.onTask('analyze_data', async (task) => {
  console.log('[DataAnalyzer] Processing task:', task.id);

  const data = task.parameters.data as number[];

  if (!Array.isArray(data)) {
    throw new Error('Invalid input: data must be an array of numbers');
  }

  if (data.length === 0) {
    throw new Error('Invalid input: data array is empty');
  }

  // Calculate statistics
  const sum = data.reduce((acc, val) => acc + val, 0);
  const avg = sum / data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);

  // Calculate median
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  // Calculate standard deviation
  const variance = data.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);

  const result = {
    count: data.length,
    sum,
    avg,
    min,
    max,
    median,
    stdDev,
  };

  console.log('[DataAnalyzer] Analysis result:', result);

  await bot.completeTask(task.id, result);
});

// Start the bot
bot.start().catch((error) => {
  console.error('[DataAnalyzer] Failed to start:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[DataAnalyzer] Shutting down...');
  await bot.stop();
  process.exit(0);
});
