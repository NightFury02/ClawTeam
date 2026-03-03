/**
 * useTasks — Task data hook with polling and column grouping
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConfig } from './useConfig.js';
import type { Task, ColumnId } from '../api/types.js';

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function sortByPriorityThenDate(a: Task, b: Task): number {
  const pa = PRIORITY_ORDER[a.priority] ?? 99;
  const pb = PRIORITY_ORDER[b.priority] ?? 99;
  if (pa !== pb) return pa - pb;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  counts: Record<ColumnId, number>;
  columns: Record<ColumnId, Task[]>;
}

export function useTasks(): UseTasksResult {
  const { apiClient, config } = useConfig();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiClient.listTasks();
      setTasks(data);
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

  const columns = useMemo(() => {
    const cols: Record<ColumnId, Task[]> = {
      pending: [],
      processing: [],
      waiting: [],
      completed: [],
      failed: [],
    };

    for (const t of tasks) {
      switch (t.status) {
        case 'pending':
          cols.pending.push(t);
          break;
        case 'accepted':
        case 'processing':
          cols.processing.push(t);
          break;
        case 'waiting_for_input':
          cols.waiting.push(t);
          break;
        case 'completed':
          cols.completed.push(t);
          break;
        case 'failed':
        case 'cancelled':
        case 'timeout':
          cols.failed.push(t);
          break;
      }
    }

    cols.pending.sort(sortByPriorityThenDate);
    cols.processing.sort(sortByPriorityThenDate);
    cols.waiting.sort(sortByPriorityThenDate);
    cols.completed.sort(sortByPriorityThenDate);
    cols.failed.sort(sortByPriorityThenDate);

    return cols;
  }, [tasks]);

  const counts: Record<ColumnId, number> = {
    pending: columns.pending.length,
    processing: columns.processing.length,
    waiting: columns.waiting.length,
    completed: columns.completed.length,
    failed: columns.failed.length,
  };

  return { tasks, loading, error, refresh, counts, columns };
}
