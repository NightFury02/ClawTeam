import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, API_ENDPOINTS } from '@/lib/config';
import { Task } from '@/lib/types';

async function fetchTasks(): Promise<Task[]> {
  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.tasks}`);
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  return response.json();
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}
