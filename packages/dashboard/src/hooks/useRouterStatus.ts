import { useQuery } from '@tanstack/react-query';
import { routerApi } from '@/lib/router-api';

export function useRouterStatus() {
  return useQuery({
    queryKey: ['router-status'],
    queryFn: routerApi.getStatus,
    refetchInterval: 5000,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['router-sessions'],
    queryFn: routerApi.getSessions,
    refetchInterval: 5000,
  });
}

export function useTrackedTasks() {
  return useQuery({
    queryKey: ['router-tracked-tasks'],
    queryFn: routerApi.getTrackedTasks,
    refetchInterval: 5000,
  });
}

export function useRouteHistory() {
  return useQuery({
    queryKey: ['router-route-history'],
    queryFn: routerApi.getRouteHistory,
    refetchInterval: 5000,
  });
}
