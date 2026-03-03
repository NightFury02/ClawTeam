/**
 * useRouterStatus — Router status hook with WebSocket real-time events
 */

import { useState, useEffect, useCallback } from 'react';
import { useConfig } from './useConfig.js';
import type { RouterStatus, RouteHistoryEntry, RouterWsEvent } from '../api/types.js';

interface UseRouterStatusResult {
  status: RouterStatus | null;
  history: RouteHistoryEntry[];
  liveEvents: Array<{ time: string; message: string }>;
  connected: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRouterStatus(): UseRouterStatusResult {
  const { routerClient } = useConfig();
  const [status, setStatus] = useState<RouterStatus | null>(null);
  const [history, setHistory] = useState<RouteHistoryEntry[]>([]);
  const [liveEvents, setLiveEvents] = useState<Array<{ time: string; message: string }>>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        routerClient.getStatus(),
        routerClient.getRouteHistory(),
      ]);
      setStatus(s);
      setHistory(h.entries);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [routerClient]);

  useEffect(() => {
    refresh();

    routerClient.connectWs();
    routerClient.on('connected', () => setConnected(true));
    routerClient.on('disconnected', () => setConnected(false));
    routerClient.on('event', (event: RouterWsEvent) => {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false });
      let message = '';
      if (event.type === 'task_routed') {
        message = `[route] ${(event as any).taskId?.slice(0, 8)} → ${(event as any).action} ${(event as any).success ? '✔' : '✘'}`;
      } else if (event.type === 'poll_complete') {
        message = `[poll] fetched:${(event as any).fetched} routed:${(event as any).routed} skipped:${(event as any).skipped}`;
      } else if (event.type === 'session_state_changed') {
        message = `[heartbeat] ${(event as any).sessionKey} → ${(event as any).state}`;
      }
      setLiveEvents(prev => [{ time, message }, ...prev].slice(0, 50));
      refresh();
    });

    return () => {
      routerClient.disconnect();
      routerClient.removeAllListeners();
    };
  }, [routerClient, refresh]);

  return { status, history, liveEvents, connected, loading, error, refresh };
}
