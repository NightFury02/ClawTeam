import { ClawTeamClient } from '@clawteam/client-sdk';

const bot = new ClawTeamClient({
  name: 'Orchestrator',
  capabilities: [
    {
      name: 'process_workflow',
      description: 'Orchestrate a data processing workflow',
      parameters: {
        data: 'number[]',
      },
      async: true,
      estimatedTime: '10s',
    },
  ],
});

bot.onTask('process_workflow', async (task) => {
  console.log('[Orchestrator] Starting workflow:', task.id);

  const data = task.parameters.data as number[];

  if (!Array.isArray(data)) {
    throw new Error('Invalid input: data must be an array of numbers');
  }

  try {
    // Step 1: Find bot with analyze_data capability
    console.log('[Orchestrator] Step 1: Finding DataAnalyzer bot...');
    const analyzerBotId = await bot.findBotByCapability('analyze_data');
    console.log('[Orchestrator] Found DataAnalyzer:', analyzerBotId);

    // Step 2: Delegate analysis task
    console.log('[Orchestrator] Step 2: Delegating analysis task...');
    const delegatedTask = await bot.delegateTask({
      toBotId: analyzerBotId,
      capability: 'analyze_data',
      parameters: { data },
      priority: 'normal',
    });

    // Wait for analysis to complete
    console.log('[Orchestrator] Waiting for analysis to complete...');
    const completedTask = await waitForTaskCompletion(delegatedTask.id);
    const analysisResult = completedTask.result;
    console.log('[Orchestrator] Analysis complete:', analysisResult);

    // Step 3: Find bot with notification capability
    console.log('[Orchestrator] Step 3: Finding Notifier bot...');
    const notifierBotId = await bot.findBotByCapability('send_notification');
    console.log('[Orchestrator] Found Notifier:', notifierBotId);

    // Step 4: Send notification with results
    console.log('[Orchestrator] Step 4: Sending notification...');
    const notificationMessage = `Data analysis completed! Results: avg=${analysisResult.avg.toFixed(
      2
    )}, min=${analysisResult.min}, max=${
      analysisResult.max
    }, count=${analysisResult.count}`;

    await bot.delegateTask({
      toBotId: notifierBotId,
      capability: 'send_notification',
      parameters: {
        message: notificationMessage,
        channel: 'workflow-status',
      },
      priority: 'normal',
    });

    // Complete the workflow
    const result = {
      success: true,
      analysisResult: analysisResult,
      processedAt: new Date().toISOString(),
    };

    console.log('[Orchestrator] Workflow completed successfully');
    await bot.completeTask(task.id, result);
  } catch (error) {
    console.error('[Orchestrator] Workflow failed:', error);
    throw error;
  }
});

// Helper function to wait for task completion
async function waitForTaskCompletion(taskId: string): Promise<any> {
  const maxAttempts = 60; // 60 seconds max
  const pollInterval = 1000; // Check every second

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(
        `${bot.getApiUrl()}/api/tasks/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${bot.getApiKey()}`,
          },
        }
      );

      if (response.ok) {
        const task = await response.json();
        if (task.status === 'completed') {
          return task;
        }
        if (task.status === 'failed' || task.status === 'timeout') {
          throw new Error(`Task failed: ${task.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('[Orchestrator] Error polling task:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task timeout: exceeded maximum wait time');
}

// Start the bot
bot.start().catch((error) => {
  console.error('[Orchestrator] Failed to start:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Orchestrator] Shutting down...');
  await bot.stop();
  process.exit(0);
});
