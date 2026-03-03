import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, API_ENDPOINTS } from '@/lib/config';
import { Message } from '@/lib/types';

async function fetchMessages(): Promise<Message[]> {
  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.messages}`);
  if (!response.ok) {
    throw new Error('Failed to fetch messages');
  }
  return response.json();
}

export function useMessages() {
  return useQuery({
    queryKey: ['messages'],
    queryFn: fetchMessages,
    refetchInterval: 5000,
  });
}
