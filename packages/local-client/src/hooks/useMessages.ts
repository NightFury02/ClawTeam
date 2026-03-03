/**
 * useMessages — Message list hook with polling
 */

import { useState, useEffect, useCallback } from 'react';
import { useConfig } from './useConfig.js';
import type { Message } from '../api/types.js';

interface UseMessagesResult {
  messages: Message[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMessages(): UseMessagesResult {
  const { apiClient, config } = useConfig();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiClient.listMessages();
      setMessages(data);
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

  return { messages, loading, error, refresh };
}
