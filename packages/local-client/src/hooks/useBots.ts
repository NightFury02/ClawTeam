/**
 * useBots — Bot list hook with polling
 */

import { useState, useEffect, useCallback } from 'react';
import { useConfig } from './useConfig.js';
import type { Bot } from '../api/types.js';

interface UseBotsResult {
  bots: Bot[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBots(): UseBotsResult {
  const { apiClient, config } = useConfig();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiClient.listBots();
      setBots(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, config.preferences.refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [refresh, config.preferences.refreshInterval]);

  return { bots, loading, error, refresh };
}
