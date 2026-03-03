/**
 * TaskTimeline — Vertical lifecycle timeline for a task
 */

import React from 'react';
import { Text, Box } from 'ink';
import type { Task } from '../api/types.js';

interface Props {
  task: Task;
}

interface Stage {
  label: string;
  time: string | undefined;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function durationBetween(a: string | undefined, b: string | undefined): string | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return null;
  return formatDuration(ms);
}

export function TaskTimeline({ task }: Props) {
  const stages: Stage[] = [
    { label: 'Created', time: task.createdAt },
    { label: 'Accepted', time: task.acceptedAt },
    { label: 'Processing', time: task.startedAt },
    {
      label: task.status === 'failed' || task.status === 'cancelled' || task.status === 'timeout'
        ? 'Failed/Cancelled'
        : 'Completed',
      time: task.completedAt,
    },
  ];

  const totalDuration = durationBetween(task.createdAt, task.completedAt ?? task.updatedAt);

  return (
    <Box flexDirection="column">
      {stages.map((stage, i) => {
        const reached = !!stage.time;
        const nextStage = stages[i + 1];
        const gap = nextStage ? durationBetween(stage.time, nextStage.time) : null;

        return (
          <Box key={stage.label} flexDirection="column">
            <Box>
              <Text color={reached ? 'green' : 'gray'}>
                {reached ? '●' : '○'}
              </Text>
              <Text color={reached ? undefined : 'gray'} bold={reached}>
                {` ${stage.label}`}
              </Text>
              {stage.time && (
                <Text dimColor>{`  ${new Date(stage.time).toLocaleTimeString('en-US', { hour12: false })}`}</Text>
              )}
            </Box>
            {i < stages.length - 1 && (
              <Box>
                <Text color={reached && nextStage?.time ? 'green' : 'gray'}>
                  {reached && nextStage?.time ? '│' : '┆'}
                </Text>
                {gap && <Text dimColor>{` ${gap}`}</Text>}
              </Box>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        {totalDuration && <Text dimColor>Total: {totalDuration}</Text>}
        {task.timeoutSeconds != null && (
          <Text dimColor>{totalDuration ? '  ' : ''}Timeout: {task.timeoutSeconds}s</Text>
        )}
      </Box>
      {task.retryCount != null && (
        <Text dimColor>Retries: {task.retryCount}/{task.maxRetries ?? '?'}</Text>
      )}
    </Box>
  );
}
