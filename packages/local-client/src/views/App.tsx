/**
 * App — Top-level tab navigation
 *
 * Uses fixed terminal height to prevent layout jumping between tabs.
 */

import React, { useState } from 'react';
import { Text, Box, useInput, useStdout } from 'ink';
import { DashboardView } from './DashboardView.js';
import { BotListView } from './BotListView.js';
import { MessageView } from './MessageView.js';
import { InboxView } from './InboxView.js';
import { RouterView } from './RouterView.js';
import { SessionView } from './SessionView.js';

const TABS = [
  { key: '1', label: 'Dashboard', view: DashboardView },
  { key: '2', label: 'Bots', view: BotListView },
  { key: '3', label: 'Messages', view: MessageView },
  { key: '4', label: 'Inbox', view: InboxView },
  { key: '5', label: 'Router', view: RouterView },
  { key: '6', label: 'Sessions', view: SessionView },
] as const;

/** Lines consumed by the App shell (tab bar + margin) */
const APP_CHROME_LINES = 2;

export function App() {
  const [activeTab, setActiveTab] = useState(0);
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const termWidth = stdout?.columns ?? 80;

  useInput((input) => {
    const idx = parseInt(input, 10) - 1;
    if (idx >= 0 && idx < TABS.length) {
      setActiveTab(idx);
    }
  });

  const ActiveView = TABS[activeTab].view;
  const viewHeight = Math.max(termHeight - APP_CHROME_LINES, 10);

  return (
    <Box flexDirection="column" height={termHeight} width={termWidth}>
      <Box>
        {TABS.map((tab, i) => (
          <Box key={tab.key} marginRight={1}>
            <Text
              bold={i === activeTab}
              color={i === activeTab ? 'cyan' : 'gray'}
              inverse={i === activeTab}
            >
              {` ${tab.key}:${tab.label} `}
            </Text>
          </Box>
        ))}
        <Box flexGrow={1} />
        <Text dimColor>ClawTeam</Text>
      </Box>
      <Box flexDirection="column" height={viewHeight}>
        <ActiveView maxHeight={viewHeight} />
      </Box>
    </Box>
  );
}
