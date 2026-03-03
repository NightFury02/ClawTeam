/**
 * RouterView — Router behavior display with real-time events
 */

import React, { useState, useEffect } from 'react';
import { Text, Box, useInput } from 'ink';
import { useRouterStatus } from '../hooks/useRouterStatus.js';
import { useConfig } from '../hooks/useConfig.js';
import { Spinner } from '../components/Spinner.js';
import { KeyHint } from '../components/KeyHint.js';

export function RouterView({ maxHeight: _maxHeight }: { maxHeight?: number }) {
  const { status, history, liveEvents, connected, loading, error, refresh } = useRouterStatus();
  const { routerClient } = useConfig();
  const [confirming, setConfirming] = useState<false | 'reset'>(false);
  const [message, setMessage] = useState('');

  // Clear message after 3s
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(t);
  }, [message]);

  useInput((input, key) => {
    if (confirming === 'reset') {
      if (input === 'y') {
        routerClient.resetMainSession()
          .then((res) => {
            if (res.success) {
              setMessage(`Session reset — new ID: ${res.newSessionId ?? 'unknown'}`);
            } else {
              setMessage(`Reset failed: ${res.message ?? 'unknown error'}`);
            }
          })
          .catch((e: Error) => setMessage(`Reset failed: ${e.message}`));
        setConfirming(false);
      }
      if (input === 'n' || key.escape) {
        setConfirming(false);
      }
      return;
    }

    if (input === 'r') refresh();
    if (input === 'S') setConfirming('reset');
  });

  if (loading) return <Spinner label="Connecting to router..." />;
  if (error) return <Text color="red">Router: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold> Router </Text>
        <Text color={connected ? 'green' : 'red'}>
          {connected ? 'connected ●' : 'disconnected ○'}
        </Text>
      </Box>

      {status && (
        <Box marginTop={1}>
          <Text> Tracked: <Text bold>{status.trackedTasks}</Text> tasks</Text>
          <Text>  <Text bold>{status.activeSessions}</Text> sessions</Text>
          <Text>  Poll: {status.pollIntervalMs / 1000}s</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor> Recent Routes:</Text>
        <Box>
          <Box width={3}><Text bold dimColor>#</Text></Box>
          <Box width={10}><Text bold dimColor>Time</Text></Box>
          <Box width={10}><Text bold dimColor>Task</Text></Box>
          <Box width={18}><Text bold dimColor>Action</Text></Box>
          <Box width={26}><Text bold dimColor>Session</Text></Box>
          <Box width={6}><Text bold dimColor>Result</Text></Box>
        </Box>
        {history.slice(0, 10).map((entry, i) => {
          const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });
          return (
            <Box key={i}>
              <Box width={3}><Text dimColor>{i + 1}</Text></Box>
              <Box width={10}><Text dimColor>{time}</Text></Box>
              <Box width={10}><Text>{entry.taskId.slice(0, 8)}</Text></Box>
              <Box width={18}><Text>{entry.action}</Text></Box>
              <Box width={26}><Text dimColor>{(entry.sessionKey ?? '-').slice(0, 25)}</Text></Box>
              <Box width={6}><Text color={entry.success ? 'green' : 'red'}>{entry.success ? '✔' : '✘'}</Text></Box>
            </Box>
          );
        })}
        {history.length === 0 && <Text dimColor>No route history</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor> Live Events:</Text>
        {liveEvents.slice(0, 10).map((evt, i) => (
          <Text key={i} dimColor> {evt.time} {evt.message}</Text>
        ))}
        {liveEvents.length === 0 && <Text dimColor> Waiting for events...</Text>}
      </Box>

      {confirming === 'reset' && (
        <Box marginTop={1}>
          <Text bold color="yellow">Reset main session? (y/n)</Text>
        </Box>
      )}

      {message && <Box marginTop={1}><Text color="yellow">{message}</Text></Box>}

      <KeyHint hints={[
        { key: 'r', label: 'refresh' },
        { key: 'S', label: 'reset session' },
      ]} />
    </Box>
  );
}
