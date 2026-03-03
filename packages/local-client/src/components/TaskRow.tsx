/**
 * TaskRow — Single-line task row with adaptive column widths
 *
 * Shows: status, name, from→to, priority, age, session key (short), session state
 */

import React from 'react';
import { Text, Box } from 'ink';
import { StatusBadge } from './StatusBadge.js';
import type { Task, SessionState } from '../api/types.js';

interface Props {
  task: Task;
  selected?: boolean;
  sessionState?: SessionState | null;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

/** Show last segment of session key (after last _ or last 12 chars) */
function shortSession(key: string | undefined): string {
  if (!key) return '';
  const parts = key.split('_');
  const last = parts[parts.length - 1];
  return last.length > 12 ? last.slice(0, 12) : last;
}

const SESSION_ICONS: Record<string, string> = {
  active: '●', tool_calling: '⚙', waiting: '◔', idle: '○',
  errored: '✘', completed: '✔', dead: '✘', unknown: '?',
};
const SESSION_COLORS: Record<string, string> = {
  active: 'green', tool_calling: 'cyan', waiting: 'yellow', idle: 'gray',
  errored: 'red', completed: 'green', dead: 'redBright', unknown: 'gray',
};

export function TaskRow({ task, selected, sessionState }: Props) {
  const sel = !!selected;

  return (
    <Box width="100%">
      {/* Selector */}
      <Box width={2}>
        <Text inverse={sel} bold={sel}>{sel ? '>' : ' '}</Text>
      </Box>
      {/* Status */}
      <Box width={12}>
        <StatusBadge status={task.status} />
      </Box>
      {/* Name (capability) — flexible */}
      <Box flexGrow={2} flexShrink={1} flexBasis={10}>
        <Text inverse={sel} bold={sel} wrap="truncate">{task.capability}</Text>
      </Box>
      <Box width={1}><Text> </Text></Box>
      {/* From → To */}
      <Box flexGrow={1} flexShrink={1} flexBasis={8}>
        <Text inverse={sel} wrap="truncate">{task.fromBotId}</Text>
        <Text dimColor={!sel} inverse={sel}>{' → '}</Text>
        <Text inverse={sel} wrap="truncate">{task.toBotId ?? '-'}</Text>
      </Box>
      <Box width={1}><Text> </Text></Box>
      {/* Priority */}
      <Box width={5}>
        <Text dimColor={!sel} inverse={sel}>{task.priority.slice(0, 4)}</Text>
      </Box>
      <Box width={1}><Text> </Text></Box>
      {/* Age */}
      <Box width={4}>
        <Text dimColor={!sel} inverse={sel}>{timeAgo(task.createdAt)}</Text>
      </Box>
      <Box width={1}><Text> </Text></Box>
      {/* Executor session key (short) + state */}
      <Box flexGrow={1} flexShrink={1} flexBasis={6}>
        {task.executorSessionKey ? (
          <Box>
            <Text dimColor={!sel} inverse={sel} wrap="truncate">
              {shortSession(task.executorSessionKey)}
            </Text>
            {sessionState && (
              <Text color={SESSION_COLORS[sessionState] ?? 'gray'}>
                {' '}{SESSION_ICONS[sessionState] ?? '?'}
              </Text>
            )}
          </Box>
        ) : (
          <Text dimColor>-</Text>
        )}
      </Box>
    </Box>
  );
}
