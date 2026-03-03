/**
 * MessageView — Messages Tab with list, type filter, and detail view
 */

import React, { useState, useMemo } from 'react';
import { Text, Box, useInput } from 'ink';
import { useMessages } from '../hooks/useMessages.js';
import { KeyHint } from '../components/KeyHint.js';
import { Spinner } from '../components/Spinner.js';
import type { MessageType } from '../api/types.js';

const TYPE_FILTERS: Array<MessageType | 'all'> = ['all', 'direct_message', 'task_notification', 'broadcast', 'system'];
const TYPE_LABELS: Record<string, { icon: string; color: string }> = {
  direct_message: { icon: 'DM', color: 'cyan' },
  task_notification: { icon: 'TN', color: 'blue' },
  broadcast: { icon: 'BC', color: 'magenta' },
  system: { icon: 'SY', color: 'gray' },
};

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour12: false });
}

type SubView = 'list' | 'detail';

export function MessageView({ maxHeight: _maxHeight }: { maxHeight?: number }) {
  const { messages, loading, error, refresh } = useMessages();
  const [selected, setSelected] = useState(0);
  const [filterIdx, setFilterIdx] = useState(0);
  const [subView, setSubView] = useState<SubView>('list');

  const activeFilter = TYPE_FILTERS[filterIdx];

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return messages;
    return messages.filter(m => m.type === activeFilter);
  }, [messages, activeFilter]);

  useInput((input, key) => {
    if (subView === 'detail') {
      if (key.escape || input === 'q') setSubView('list');
      if (input === 'r') refresh();
      return;
    }

    if (key.upArrow && selected > 0) setSelected(selected - 1);
    if (key.downArrow && selected < filtered.length - 1) setSelected(selected + 1);
    if (key.return && filtered.length > 0) setSubView('detail');
    if (input === 'f') {
      setFilterIdx((filterIdx + 1) % TYPE_FILTERS.length);
      setSelected(0);
    }
    if (input === 'r') refresh();
  });

  if (loading) return <Spinner label="Loading messages..." />;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (subView === 'detail' && filtered[selected]) {
    const msg = filtered[selected];
    const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2);
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Message Detail</Text>
        <Box marginTop={1} flexDirection="column">
          <Box><Box width={16}><Text dimColor>Message ID</Text></Box><Text>{msg.messageId}</Text></Box>
          <Box><Box width={16}><Text dimColor>Type</Text></Box><Text color={TYPE_LABELS[msg.type]?.color}>{msg.type}</Text></Box>
          <Box><Box width={16}><Text dimColor>From → To</Text></Box><Text>{msg.fromBotId} → {msg.toBotId}</Text></Box>
          <Box><Box width={16}><Text dimColor>Priority</Text></Box><Text>{msg.priority}</Text></Box>
          <Box><Box width={16}><Text dimColor>Status</Text></Box><Text>{msg.status}</Text></Box>
          <Box><Box width={16}><Text dimColor>Task ID</Text></Box><Text>{msg.taskId ?? '-'}</Text></Box>
          <Box><Box width={16}><Text dimColor>Content Type</Text></Box><Text>{msg.contentType}</Text></Box>
          <Box><Box width={16}><Text dimColor>Created</Text></Box><Text>{msg.createdAt}</Text></Box>
          <Box><Box width={16}><Text dimColor>Read At</Text></Box><Text>{msg.readAt ?? '-'}</Text></Box>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Content:</Text>
            <Text>{contentStr}</Text>
          </Box>
        </Box>
        <KeyHint hints={[
          { key: 'Esc', label: 'back' },
          { key: 'r', label: 'refresh' },
        ]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold> Messages </Text>
        <Text dimColor> {filtered.length} messages</Text>
        <Text dimColor>  filter: </Text>
        <Text color="cyan">{activeFilter}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {/* Table header */}
        <Box>
          <Box width={4}><Text bold dimColor>#</Text></Box>
          <Box width={5}><Text bold dimColor>Type</Text></Box>
          <Box width={1}><Text> </Text></Box>
          <Box width={24}><Text bold dimColor>From → To</Text></Box>
          <Box width={1}><Text> </Text></Box>
          <Box flexGrow={1} flexShrink={1}><Text bold dimColor>Content</Text></Box>
          <Box width={1}><Text> </Text></Box>
          <Box width={7}><Text bold dimColor>Pri</Text></Box>
          <Box width={9}><Text bold dimColor>Time</Text></Box>
        </Box>

        {filtered.length === 0 && <Text dimColor>  No messages</Text>}
        {filtered.map((msg, i) => {
          const typeInfo = TYPE_LABELS[msg.type] ?? { icon: '??', color: 'white' };
          const contentPreview = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          const isSelected = i === selected;
          return (
            <Box key={msg.messageId}>
              <Box width={4}>
                {isSelected ? <Text inverse bold>{'> '}</Text> : <Text>{'  '}</Text>}
              </Box>
              <Box width={5}><Text color={typeInfo.color}>{typeInfo.icon}</Text></Box>
              <Box width={1}><Text> </Text></Box>
              <Box width={24}><Text wrap="truncate">{truncate(msg.fromBotId, 10)} → {truncate(msg.toBotId, 10)}</Text></Box>
              <Box width={1}><Text> </Text></Box>
              <Box flexGrow={1} flexShrink={1}><Text wrap="truncate" dimColor={!isSelected}>{contentPreview}</Text></Box>
              <Box width={1}><Text> </Text></Box>
              <Box width={7}><Text>{msg.priority}</Text></Box>
              <Box width={9}><Text dimColor>{formatTime(msg.createdAt)}</Text></Box>
            </Box>
          );
        })}
      </Box>

      <KeyHint hints={[
        { key: '↑↓', label: 'navigate' },
        { key: 'Enter', label: 'detail' },
        { key: 'f', label: 'filter type' },
        { key: 'r', label: 'refresh' },
      ]} />
    </Box>
  );
}
