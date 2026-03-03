import { ClawTeamClient } from '@clawteam/client-sdk';

const bot = new ClawTeamClient({
  name: 'Notifier',
  capabilities: [
    {
      name: 'send_notification',
      description: 'Send a notification message to a specified channel',
      parameters: {
        message: 'string',
        channel: 'string',
      },
      async: false,
      estimatedTime: '2s',
    },
  ],
});

bot.onTask('send_notification', async (task) => {
  console.log('[Notifier] Processing notification:', task.id);

  const { message, channel } = task.parameters as {
    message: string;
    channel: string;
  };

  if (!message) {
    throw new Error('Invalid input: message is required');
  }

  if (!channel) {
    throw new Error('Invalid input: channel is required');
  }

  // Simulate sending notification
  console.log(`[Notifier] 📢 Notification sent to ${channel}:`);
  console.log(`[Notifier] Message: ${message}`);

  // In a real implementation, you would integrate with:
  // - Slack API
  // - Discord webhook
  // - Email service
  // - SMS service
  // - etc.

  const result = {
    sent: true,
    channel,
    timestamp: new Date().toISOString(),
  };

  await bot.completeTask(task.id, { result });
});

// Start the bot
bot.start().catch((error) => {
  console.error('[Notifier] Failed to start:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Notifier] Shutting down...');
  await bot.stop();
  process.exit(0);
});
