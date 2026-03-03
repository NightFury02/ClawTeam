/**
 * ColumnTabs — Horizontal status column tab bar for Kanban dashboard
 */

import React from 'react';
import { Text, Box } from 'ink';
import type { ColumnId } from '../api/types.js';

const COLUMN_CONFIG: Array<{ id: ColumnId; icon: string; label: string; color: string }> = [
  { id: 'pending', icon: '◔', label: 'Pending', color: 'yellow' },
  { id: 'processing', icon: '●', label: 'Processing', color: 'blue' },
  { id: 'waiting', icon: '⏳', label: 'Waiting', color: 'yellow' },
  { id: 'completed', icon: '✔', label: 'Completed', color: 'green' },
  { id: 'failed', icon: '✘', label: 'Failed', color: 'red' },
];

interface Props {
  activeColumn: ColumnId;
  counts: Record<ColumnId, number>;
}

export function ColumnTabs({ activeColumn, counts }: Props) {
  return (
    <Box>
      {COLUMN_CONFIG.map((col) => {
        const isActive = col.id === activeColumn;
        const text = `${col.icon} ${col.label} [${counts[col.id]}]`;
        return (
          <Box key={col.id} marginRight={2}>
            <Text
              color={col.color}
              bold={isActive}
              inverse={isActive}
            >
              {` ${text} `}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
