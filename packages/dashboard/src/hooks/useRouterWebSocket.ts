import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ROUTER_WS_URL } from '@/lib/config';
import type { RouterWsEvent } from '@/lib/types';

export function useRouterWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      try {
        const ws = new WebSocket(`${ROUTER_WS_URL}/router-ws`);

        ws.onopen = () => {
          if (!mounted) return;
          console.log('[RouterWS] Connected');
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!mounted) return;
          try {
            const msg: RouterWsEvent = JSON.parse(event.data);
            switch (msg.type) {
              case 'task_routed':
                queryClient.invalidateQueries({ queryKey: ['router-route-history'] });
                queryClient.invalidateQueries({ queryKey: ['router-tracked-tasks'] });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                break;
              case 'session_state_changed':
                queryClient.invalidateQueries({ queryKey: ['router-sessions'] });
                break;
              case 'poll_complete':
                queryClient.invalidateQueries({ queryKey: ['router-status'] });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                break;
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => {};

        ws.onclose = () => {
          if (!mounted) return;
          console.log('[RouterWS] Disconnected');
          setIsConnected(false);
          wsRef.current = null;
          reconnectRef.current = setTimeout(() => {
            if (mounted) connect();
          }, 5000);
        };

        wsRef.current = ws;
      } catch {
        // connection failed, will retry
      }
    }

    connect();

    return () => {
      mounted = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [queryClient]);

  return { isConnected };
}
