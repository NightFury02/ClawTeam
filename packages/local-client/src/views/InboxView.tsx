/**
 * InboxView — Inbox Tab for handling waiting_for_input tasks
 *
 * Shows tasks with status === 'waiting_for_input' and allows
 * the operator to provide human input to resume them.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Text, Box, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTasks } from '../hooks/useTasks.js';
import { useConfig } from '../hooks/useConfig.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { KeyHint } from '../components/KeyHint.js';
import { Spinner } from '../components/Spinner.js';

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}

type SubView = 'list' | 'detail';

export function InboxView({ maxHeight: _maxHeight }: { maxHeight?: number }) {
  const { tasks, loading, error, refresh } = useTasks();
  const { routerClient } = useConfig();
  const [selected, setSelected] = useState(0);
  const [subView, setSubView] = useState<SubView>('list');
  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const waitingTasks = useMemo(
    () => tasks.filter(t => t.status === 'waiting_for_input'),
    [tasks],
  );

  // Clamp selected index
  useEffect(() => {
    if (selected >= waitingTasks.length && waitingTasks.length > 0) {
      setSelected(waitingTasks.length - 1);
    }
  }, [waitingTasks.length, selected]);

  // Clear message after 3s
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(t);
  }, [message]);

  useInput((input, key) => {
    if (submitting) return;

    if (subView === 'detail') {
      if (key.escape) {
        setSubView('list');
        setInputValue('');
      }
      // Enter in detail is handled by the submit logic below
      return;
    }

    if (key.upArrow && selected > 0) setSelected(selected - 1);
    if (key.downArrow && selected < waitingTasks.length - 1) setSelected(selected + 1);
    if (key.return && waitingTasks.length > 0) {
      setSubView('detail');
      setInputValue('');
    }
    if (input === 'r') {
      refresh();
      setMessage('Refreshed');
    }
  });

  const handleSubmit = async (value: string) => {
    const task = waitingTasks[selected];
    if (!task || submitting) return;
    setSubmitting(true);
    try {
      await routerClient.resumeTask(task.id, value || undefined);
      setMessage(`Resumed task ${task.id.slice(0, 8)}`);
      setSubView('list');
      setInputValue('');
      refresh();
    } catch (e) {
      setMessage(`Resume failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Loading tasks..." />;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (subView === 'detail' && waitingTasks[selected]) {
    const task = waitingTasks[selected];
    const reason = task.result?.waitingReason ?? task.parameters?.waitingReason ?? 'Waiting for human input';
    const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);

    return (
      <Box flexDirection="column">
        <Text bold color="yellow">Respond to Task</Text>
        <Box marginTop={1} flexDirection="column">
          <Box><Box width={16}><Text dimColor>Task ID</Text></Box><Text>{task.id}</Text></Box>
          <Box><Box width={16}><Text dimColor>Capability</Text></Box><Text>{task.capability}</Text></Box>
          <Box><Box width={16}><Text dimColor>From → To</Text></Box><Text>{task.fromBotId} → {task.toBotId ?? '-'}</Text></Box>
          <Box><Box width={16}><Text dimColor>Status</Text></Box><StatusBadge status={task.status} /></Box>
          <Box marginTop={1}><Box width={16}><Text dimColor>Reason</Text></Box><Text color="yellow">{reasonStr}</Text></Box>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Enter your response (Enter to submit, Esc to cancel):</Text>
          <Box marginTop={1}>
            <Text color="cyan">{`> `}</Text>
            {submitting ? (
              <Text dimColor>Submitting...</Text>
            ) : (
              <TextInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
              />
            )}
          </Box>
        </Box>
        {message && <Box marginTop={1}><Text color="yellow">{message}</Text></Box>}
        <KeyHint hints={[
          { key: 'Enter', label: 'submit' },
          { key: 'Esc', label: 'cancel' },
        ]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold> Inbox </Text>
        <Text dimColor> {waitingTasks.length} tasks waiting for input</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {/* Table header */}
        <Box>
          <Box width={3}><Text bold dimColor>#</Text></Box>
          <Box width={12}><Text bold dimColor>Task ID</Text></Box>
          <Box width={1}><Text> </Text></Box>
          <Box width={20}><Text bold dimColor>Capability</Text></Box>
          <Box width={1}><Text> </Text></Box>
          <Box width={24}><Text bold dimColor>From → To</Text></Box>
          <Box width={1}><Text> </Text></Box>
          <Box flexGrow={1} flexShrink={1}><Text bold dimColor>Reason</Text></Box>
        </Box>

        {waitingTasks.length === 0 && <Text dimColor>  No tasks waiting for input</Text>}
        {waitingTasks.map((task, i) => {
          const isSelected = i === selected;
          const reason = task.result?.waitingReason ?? task.parameters?.waitingReason ?? '';
          const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
          return (
            <Box key={task.id}>
              <Box width={3}>
                {isSelected ? <Text inverse bold>{'> '}</Text> : <Text>{'  '}</Text>}
              </Box>
              <Box width={12}><Text wrap="truncate">{task.id.slice(0, 10)}</Text></Box>
              <Box width={1}><Text> </Text></Box>
              <Box width={20}><Text wrap="truncate">{truncate(task.capability, 18)}</Text></Box>
              <Box width={1}><Text> </Text></Box>
              <Box width={24}><Text wrap="truncate">{truncate(task.fromBotId, 10)} → {truncate(task.toBotId ?? '-', 10)}</Text></Box>
              <Box width={1}><Text> </Text></Box>
              <Box flexGrow={1} flexShrink={1}><Text wrap="truncate" dimColor={!isSelected}>{reasonStr}</Text></Box>
            </Box>
          );
        })}
      </Box>

      {message && <Box marginTop={1}><Text color="yellow">{message}</Text></Box>}

      <KeyHint hints={[
        { key: '↑↓', label: 'navigate' },
        { key: 'Enter', label: 'respond' },
        { key: 'r', label: 'refresh' },
      ]} />
    </Box>
  );
}
