import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, API_ENDPOINTS } from '@/lib/config';
import { Bot } from '@/lib/types';

async function fetchBots(): Promise<Bot[]> {
  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.bots}`);
  if (!response.ok) {
    throw new Error('Failed to fetch bots');
  }
  return response.json();
}

export function useBots() {
  return useQuery({
    queryKey: ['bots'],
    queryFn: fetchBots,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}
