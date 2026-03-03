/**
 * useSessions — Session status hook with polling
 */

import { useState, useEffect, useCallback } from 'react';
import { useConfig } from './useConfig.js';
import type { SessionStatus } from '../api/types.js';

interface UseSessionsResult {
  sessions: SessionStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSessions(): UseSessionsResult {
  const { routerClient, config } = useConfig();
  const [sessions, setSessions] = useState<SessionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await routerClient.getSessions();
      setSessions(data.sessions);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [routerClient]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, config.preferences.refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [refresh, config.preferences.refreshInterval]);

  return { sessions, loading, error, refresh };
}
