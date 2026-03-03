/**
 * BotRow — Single bot row for the bot directory table
 */

import React from 'react';
import { Text, Box } from 'ink';
import { StatusBadge } from './StatusBadge.js';
import type { Bot } from '../api/types.js';

interface Props {
  bot: Bot;
  index: number;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export function BotRow({ bot, index }: Props) {
  return (
    <Box>
      <Box width={3}><Text dimColor>{index + 1}</Text></Box>
      <Box width={12}><Text bold>{bot.name.slice(0, 11)}</Text></Box>
      <Box width={12}><StatusBadge status={bot.status} /></Box>
      <Box width={30}><Text>{bot.capabilities.join(', ').slice(0, 29)}</Text></Box>
      <Box width={12}><Text dimColor>{timeAgo(bot.lastSeenAt)}</Text></Box>
    </Box>
  );
}
