/**
 * Prometheus Metrics Route
 *
 * Exposes /metrics endpoint for Prometheus scraping.
 */

import type { FastifyPluginAsync } from 'fastify';
import { register } from '../metrics';

/**
 * Create metrics route plugin.
 *
 * Registers GET /metrics endpoint that returns Prometheus-formatted metrics.
 *
 * Usage:
 * ```typescript
 * await fastify.register(createMetricsRoute(), { prefix: '/api/v1/tasks' });
 * // Metrics available at: GET /api/v1/tasks/metrics
 * ```
 */
export function createMetricsRoute(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/metrics', async (_request, reply) => {
      reply.type('text/plain; version=0.0.4; charset=utf-8');
      return register.metrics();
    });
  };
}
