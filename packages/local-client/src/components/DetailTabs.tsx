/**
 * DetailTabs — Sub-panel tab bar for task detail view
 */

import React from 'react';
import { Text, Box } from 'ink';

export type DetailPanel = 'info' | 'session' | 'timeline' | 'tree' | 'avatar';

const PANELS: Array<{ id: DetailPanel; label: string }> = [
  { id: 'info', label: 'Info' },
  { id: 'session', label: 'Session' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'tree', label: 'Tree' },
  { id: 'avatar', label: 'Avatar' },
];

interface Props {
  activePanel: DetailPanel;
  hasSession: boolean;
  hasTree: boolean;
}

export function DetailTabs({ activePanel, hasSession, hasTree }: Props) {
  return (
    <Box>
      {PANELS.map((panel) => {
        const isActive = panel.id === activePanel;
        const disabled =
          (panel.id === 'session' && !hasSession) ||
          (panel.id === 'tree' && !hasTree);

        return (
          <Box key={panel.id} marginRight={1}>
            <Text
              bold={isActive}
              inverse={isActive}
              dimColor={disabled && !isActive}
              color={isActive ? 'cyan' : undefined}
            >
              {`[${panel.label}]`}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
