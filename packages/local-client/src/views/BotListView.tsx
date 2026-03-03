/**
 * BotListView — Bot directory with operations
 */

import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { useBots } from '../hooks/useBots.js';
import { useConfig } from '../hooks/useConfig.js';
import { BotRow } from '../components/BotRow.js';
import { KeyHint } from '../components/KeyHint.js';
import { DelegateForm } from '../components/DelegateForm.js';
import { Spinner } from '../components/Spinner.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { BotAvatar } from '../components/BotAvatar.js';

type SubView = 'list' | 'detail' | 'delegate';

export function BotListView({ maxHeight: _maxHeight }: { maxHeight?: number }) {
  const { bots, loading, error, refresh } = useBots();
  const { apiClient, routerClient } = useConfig();
  const [selected, setSelected] = useState(0);
  const [subView, setSubView] = useState<SubView>('list');
  const [message, setMessage] = useState('');

  useInput((input, key) => {
    if (subView !== 'list') return;

    if (key.upArrow && selected > 0) setSelected(selected - 1);
    if (key.downArrow && selected < bots.length - 1) setSelected(selected + 1);
    if (key.return && bots.length > 0) setSubView('detail');
    if (input === 'd' && bots[selected]) setSubView('delegate');
    if (input === 'r') refresh();
    if (input === 's' && bots[selected]) {
      const bot = bots[selected];
      const next = bot.status === 'online' ? 'offline' : 'online';
      apiClient.updateBotStatus(bot.id, next)
        .then(() => { setMessage(`${bot.name} → ${next}`); refresh(); })
        .catch((e: Error) => setMessage(`Status change failed: ${e.message}`));
    }
    if (key.escape) setSubView('list');
  });

  if (loading) return <Spinner label="Loading bots..." />;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (subView === 'delegate' && bots[selected]) {
    return (
      <DelegateForm
        toBotId={bots[selected].id}
        onSubmit={async (data) => {
          try {
            await apiClient.delegateTask(data);
            setMessage('Task delegated');
            setSubView('list');
            refresh();
          } catch (e) {
            setMessage(`Delegate failed: ${(e as Error).message}`);
          }
        }}
        onIntentSubmit={async (data) => {
          try {
            await routerClient.delegateIntent(data.fromBotId, data.intentText);
            setMessage('Intent submitted');
            setSubView('list');
            refresh();
          } catch (e) {
            setMessage(`Intent failed: ${(e as Error).message}`);
          }
        }}
        onCancel={() => setSubView('list')}
      />
    );
  }

  if (subView === 'detail' && bots[selected]) {
    const bot = bots[selected];
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Bot Detail</Text>
        <Box marginTop={1}>
          <BotAvatar botStatus={bot.status} />
          <Box flexDirection="column" marginLeft={1}>
            <Text>ID: {bot.id}</Text>
            <Text>Name: {bot.name}</Text>
            <Box><Text>Status: </Text><StatusBadge status={bot.status} /></Box>
            <Text>Capabilities: {bot.capabilities.join(', ')}</Text>
            <Text>Last Seen: {bot.lastSeenAt ?? 'never'}</Text>
          </Box>
        </Box>
        <KeyHint hints={[
          { key: 'Esc', label: 'back' },
          { key: 'd', label: 'delegate task' },
          { key: 's', label: 'change status' },
        ]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold> Bot Directory </Text>
        <Text dimColor> {bots.length} bots</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Box width={3}><Text bold dimColor>#</Text></Box>
          <Box width={12}><Text bold dimColor>Name</Text></Box>
          <Box width={12}><Text bold dimColor>Status</Text></Box>
          <Box width={30}><Text bold dimColor>Capabilities</Text></Box>
          <Box width={12}><Text bold dimColor>Last Seen</Text></Box>
        </Box>
        {bots.map((bot, i) => (
          <Box key={bot.id}>
            {i === selected ? (
              <Text inverse bold>{`> `}</Text>
            ) : (
              <Text>{`  `}</Text>
            )}
            <BotRow bot={bot} index={i} />
          </Box>
        ))}
        {bots.length === 0 && <Text dimColor>No bots registered</Text>}
      </Box>

      {message && <Text color="yellow">{message}</Text>}

      <KeyHint hints={[
        { key: '↑↓', label: 'navigate' },
        { key: 'Enter', label: 'detail' },
        { key: 'd', label: 'delegate task' },
        { key: 's', label: 'change status' },
        { key: 'r', label: 'refresh' },
      ]} />
    </Box>
  );
}
