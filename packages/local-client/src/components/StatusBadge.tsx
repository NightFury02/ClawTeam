/**
 * StatusBadge — Colored status indicator for terminal
 */

import React from 'react';
import { Text } from 'ink';

const STATUS_COLORS: Record<string, string> = {
  pending: 'yellow',
  accepted: 'cyan',
  processing: 'blue',
  waiting_for_input: 'yellow',
  completed: 'green',
  failed: 'red',
  cancelled: 'gray',
  timeout: 'yellow',
  online: 'green',
  offline: 'gray',
  busy: 'yellow',
  active: 'green',
  tool_calling: 'cyan',
  waiting: 'yellow',
  idle: 'gray',
  errored: 'red',
  dead: 'redBright',
  unknown: 'gray',
};

const STATUS_ICONS: Record<string, string> = {
  pending: '◔',
  accepted: '◑',
  processing: '●',
  waiting_for_input: '⏳',
  completed: '✔',
  failed: '✘',
  cancelled: '○',
  timeout: '⏱',
  online: '●',
  offline: '○',
  busy: '◑',
  active: '●',
  tool_calling: '⚙',
  waiting: '◔',
  idle: '○',
  errored: '✘',
  dead: '✘',
  unknown: '?',
};

interface Props {
  status: string;
  showLabel?: boolean;
}

export function StatusBadge({ status, showLabel = true }: Props) {
  const color = STATUS_COLORS[status] ?? 'white';
  const icon = STATUS_ICONS[status] ?? '?';
  return (
    <Text color={color}>
      {icon}{showLabel ? ` ${status}` : ''}
    </Text>
  );
}
