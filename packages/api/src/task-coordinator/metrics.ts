/**
 * Prometheus Metrics for Task Coordinator
 *
 * Exposes 10+ metrics for monitoring task creation, completion, timeouts,
 * API latency, queue length, and Redis fallback operations.
 *
 * Uses a dedicated Registry to avoid conflicts with other modules
 * and safely handles re-registration in test environments.
 */

import { Counter, Histogram, Gauge, Registry } from 'prom-client';

// Use a dedicated registry to avoid conflicts with default global registry
const register = new Registry();

/**
 * Safely create a metric, returning existing one if already registered.
 * This prevents "duplicate metric name" errors in test environments
 * where modules may be re-imported.
 */
function getOrCreateCounter(name: string, help: string, labelNames: string[]): Counter {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as Counter;
  const counter = new Counter({ name, help, labelNames, registers: [register] });
  return counter;
}

function getOrCreateHistogram(
  name: string,
  help: string,
  labelNames: string[],
  buckets: number[]
): Histogram {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as Histogram;
  const histogram = new Histogram({ name, help, labelNames, buckets, registers: [register] });
  return histogram;
}

function getOrCreateGauge(name: string, help: string, labelNames: string[]): Gauge {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as Gauge;
  const gauge = new Gauge({ name, help, labelNames, registers: [register] });
  return gauge;
}

// ===== Counter (Cumulative counters) =====

/**
 * Total number of tasks created, labeled by priority and capability.
 */
export const tasksCreatedTotal = getOrCreateCounter(
  'clawteam_tasks_created_total',
  'Total number of tasks created',
  ['priority', 'capability']
);

/**
 * Total number of tasks completed, labeled by status and capability.
 * Status can be: 'completed', 'failed', 'timeout', 'cancelled'
 */
export const tasksCompletedTotal = getOrCreateCounter(
  'clawteam_tasks_completed_total',
  'Total number of tasks completed',
  ['status', 'capability']
);

/**
 * Total number of tasks that timed out.
 */
export const tasksTimeoutTotal = getOrCreateCounter(
  'clawteam_tasks_timeout_total',
  'Total number of tasks timed out',
  ['capability']
);

/**
 * Total number of tasks cancelled by sender.
 */
export const tasksCancelledTotal = getOrCreateCounter(
  'clawteam_tasks_cancelled_total',
  'Total number of tasks cancelled',
  ['capability']
);

/**
 * Number of times Redis operations fell back to database.
 * Operations: 'poll', 'enqueue', 'cache'
 */
export const redisFallbackTotal = getOrCreateCounter(
  'clawteam_redis_fallback_total',
  'Number of times Redis operations fell back to database',
  ['operation']
);

// ===== Histogram (Distribution statistics) =====

/**
 * Task execution duration from creation to completion (in seconds).
 * Buckets: 1s, 5s, 10s, 30s, 1min, 5min, 10min, 30min, 1h
 */
export const taskDuration = getOrCreateHistogram(
  'clawteam_task_duration_seconds',
  'Task execution duration from creation to completion',
  ['capability', 'status'],
  [1, 5, 10, 30, 60, 300, 600, 1800, 3600]
);

/**
 * API endpoint latency (in seconds).
 * Buckets: 10ms, 50ms, 100ms, 500ms, 1s, 5s
 */
export const apiLatency = getOrCreateHistogram(
  'clawteam_api_latency_seconds',
  'API endpoint latency',
  ['method', 'path', 'status'],
  [0.01, 0.05, 0.1, 0.5, 1, 5]
);

// ===== Gauge (Instantaneous values) =====

/**
 * Current number of pending tasks in queue per bot and priority.
 */
export const queueLength = getOrCreateGauge(
  'clawteam_queue_length',
  'Current number of pending tasks in queue',
  ['bot_id', 'priority']
);

/**
 * Current number of tasks being processed (accepted or processing status).
 */
export const tasksProcessingCount = getOrCreateGauge(
  'clawteam_tasks_processing_count',
  'Current number of tasks being processed',
  []
);

/**
 * Total number of tasks in the system by status.
 */
export const tasksByStatus = getOrCreateGauge(
  'clawteam_tasks_by_status',
  'Total number of tasks by status',
  ['status']
);

// ===== Export Registry =====

/**
 * Dedicated Prometheus registry for task-coordinator metrics.
 * Use `register.metrics()` to get metrics in Prometheus format.
 */
export { register };

/**
 * Reset all metrics (useful for testing).
 */
export function resetMetrics(): void {
  register.resetMetrics();
}
