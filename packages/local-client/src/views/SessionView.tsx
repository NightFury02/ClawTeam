/**
 * SessionView — Session monitoring view
 */

import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { useSessions } from '../hooks/useSessions.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { KeyHint } from '../components/KeyHint.js';
import { Spinner } from '../components/Spinner.js';

export function SessionView({ maxHeight: _maxHeight }: { maxHeight?: number }) {
  const { sessions, loading, error, refresh } = useSessions();
  const [selected, setSelected] = useState(0);
  const [showDetail, setShowDetail] = useState(false);

  useInput((input, key) => {
    if (showDetail) {
      if (key.escape) setShowDetail(false);
      return;
    }
    if (key.upArrow && selected > 0) setSelected(selected - 1);
    if (key.downArrow && selected < sessions.length - 1) setSelected(selected + 1);
    if (key.return && sessions.length > 0) setShowDetail(true);
    if (input === 'r') refresh();
  });

  if (loading) return <Spinner label="Loading sessions..." />;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (showDetail && sessions[selected]) {
    const s = sessions[selected];
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Session Detail</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>Session Key: {s.sessionKey}</Text>
          <Text>Task ID: {s.taskId}</Text>
          <Box><Text>State: </Text><StatusBadge status={s.sessionState} /></Box>
          <Text>Agent: {s.details.agentId ?? '-'}</Text>
          <Text>Session ID: {s.details.sessionId ?? '-'}</Text>
          <Text>Alive: {s.details.alive ? 'yes' : 'no'}</Text>
          <Text>Age: {s.details.ageMs ? `${Math.floor(s.details.ageMs / 60000)}m` : '-'}</Text>
          {s.details.jsonlAnalysis && (
            <>
              <Text>Model: {s.details.jsonlAnalysis.model ?? '-'}</Text>
              <Text>Messages: {s.details.jsonlAnalysis.messageCount}</Text>
              <Text>Tool Calls: {s.details.jsonlAnalysis.toolCallCount}</Text>
            </>
          )}
        </Box>
        <KeyHint hints={[{ key: 'Esc', label: 'back' }]} />
      </Box>
    );
  }

  const active = sessions.filter(s => s.sessionState !== 'dead' && s.sessionState !== 'unknown');

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold> Sessions </Text>
        <Text dimColor> {active.length} active</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Box width={3}><Text bold dimColor>#</Text></Box>
          <Box width={8}><Text bold dimColor>Agent</Text></Box>
          <Box width={28}><Text bold dimColor>Session Key</Text></Box>
          <Box width={14}><Text bold dimColor>State</Text></Box>
          <Box width={8}><Text bold dimColor>Age</Text></Box>
          <Box width={10}><Text bold dimColor>Model</Text></Box>
          <Box width={8}><Text bold dimColor>Tools</Text></Box>
        </Box>
        {sessions.map((s, i) => (
          <Box key={s.sessionKey + s.taskId}>
            {i === selected ? (
              <Text inverse bold>{`> `}</Text>
            ) : (
              <Text>{`  `}</Text>
            )}
            <Box width={3}><Text dimColor>{i + 1}</Text></Box>
            <Box width={8}><Text>{(s.details.agentId ?? '-').slice(0, 7)}</Text></Box>
            <Box width={28}><Text dimColor>{s.sessionKey.slice(0, 27)}</Text></Box>
            <Box width={14}><StatusBadge status={s.sessionState} /></Box>
            <Box width={8}><Text dimColor>{s.details.ageMs ? `${Math.floor(s.details.ageMs / 60000)}m` : '-'}</Text></Box>
            <Box width={10}><Text dimColor>{s.details.jsonlAnalysis?.model?.slice(0, 9) ?? '-'}</Text></Box>
            <Box width={8}><Text dimColor>{s.details.jsonlAnalysis?.toolCallCount ?? '-'}</Text></Box>
          </Box>
        ))}
        {sessions.length === 0 && <Text dimColor>No sessions tracked</Text>}
      </Box>

      <KeyHint hints={[
        { key: '↑↓', label: 'navigate' },
        { key: 'Enter', label: 'session detail' },
        { key: 'r', label: 'refresh' },
      ]} />
    </Box>
  );
}
