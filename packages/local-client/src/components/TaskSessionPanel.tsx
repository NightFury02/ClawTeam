/**
 * TaskSessionPanel — Display session info associated with a task
 */

import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import type { RouterClient } from '../api/router-client.js';
import type { SessionStatus } from '../api/types.js';

interface Props {
  sessionKey: string;
  routerClient: RouterClient;
}

function formatAge(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

export function TaskSessionPanel({ sessionKey, routerClient }: Props) {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const { sessions } = await routerClient.getSessions();
        const match = sessions.find(s => s.sessionKey === sessionKey);
        if (!cancelled) {
          setSession(match ?? null);
          setError(match ? null : 'Session not found');
        }
      } catch (e) {
        if (!cancelled) setError('Router unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [sessionKey, routerClient]);

  if (loading) return <Text dimColor>Loading session...</Text>;
  if (error) return <Text color="yellow">{error}</Text>;
  if (!session) return <Text dimColor>No session data</Text>;

  const d = session.details;
  const analysis = d.jsonlAnalysis;

  return (
    <Box flexDirection="column">
      <Box><Text bold>Session Key: </Text><Text>{session.sessionKey}</Text></Box>
      <Box>
        <Text bold>State: </Text>
        <Text color={session.sessionState === 'active' || session.sessionState === 'tool_calling' ? 'green' : session.sessionState === 'dead' || session.sessionState === 'errored' ? 'red' : 'yellow'}>
          {session.sessionState}
        </Text>
      </Box>
      <Box><Text bold>Alive: </Text><Text color={d.alive ? 'green' : 'red'}>{d.alive ? 'Yes' : 'No'}</Text></Box>
      {d.agentId && <Box><Text bold>Agent: </Text><Text>{d.agentId}</Text></Box>}
      {d.sessionId && <Box><Text bold>Session ID: </Text><Text>{d.sessionId}</Text></Box>}
      {d.ageMs != null && <Box><Text bold>Age: </Text><Text>{formatAge(d.ageMs)}</Text></Box>}
      {analysis && (
        <>
          {analysis.model && <Box><Text bold>Model: </Text><Text>{analysis.model}</Text></Box>}
          <Box><Text bold>Messages: </Text><Text>{analysis.messageCount}</Text></Box>
          <Box><Text bold>Tool Calls: </Text><Text>{analysis.toolCallCount}</Text></Box>
          {analysis.lastMessageRole && (
            <Box><Text bold>Last Role: </Text><Text>{analysis.lastMessageRole}</Text></Box>
          )}
          {analysis.lastStopReason && (
            <Box><Text bold>Stop Reason: </Text><Text>{analysis.lastStopReason}</Text></Box>
          )}
        </>
      )}
    </Box>
  );
}
