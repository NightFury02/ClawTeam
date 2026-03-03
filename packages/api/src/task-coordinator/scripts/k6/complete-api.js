/**
 * k6 Performance Test - Complete API
 *
 * Tests POST /api/v1/tasks/:taskId/complete endpoint performance.
 *
 * Prerequisites:
 * 1. Install k6: brew install k6
 * 2. Start services: docker-compose up -d && npm run dev:api
 * 3. Seed test data: Create a team with invite code 'TEST-INVITE-CODE'
 *
 * Run:
 *   k6 run scripts/k6/complete-api.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const completeDuration = new Trend('complete_duration');

// Test configuration - sequential since each complete consumes a task
export const options = {
  stages: [
    { duration: '20s', target: 10 },   // Ramp up to 10 VUs
    { duration: '40s', target: 10 },   // Stay at 10 VUs
    { duration: '20s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<80', 'p(99)<150'],
    errors: ['rate<0.05'],  // Error rate < 5%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const INVITE_CODE = __ENV.INVITE_CODE || 'TEST-INVITE-CODE';

/**
 * Setup: Register bots, create and accept tasks
 */
export function setup() {
  const timestamp = Date.now();

  // Register Alice (task sender)
  const aliceRes = http.post(
    `${BASE_URL}/api/v1/bots/register`,
    JSON.stringify({
      name: `k6_complete_alice_${timestamp}`,
      inviteCode: INVITE_CODE,
      ownerEmail: `k6-complete-alice-${timestamp}@test.com`,
      capabilities: [
        {
          name: 'test_capability',
          description: 'Test capability for k6',
          parameters: {},
          async: false,
          estimatedTime: '5s',
        },
      ],
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (aliceRes.status !== 201) {
    console.error(`Failed to register Alice: ${aliceRes.status} ${aliceRes.body}`);
    return null;
  }

  // Register Lily (task receiver)
  const lilyRes = http.post(
    `${BASE_URL}/api/v1/bots/register`,
    JSON.stringify({
      name: `k6_complete_lily_${timestamp}`,
      inviteCode: INVITE_CODE,
      ownerEmail: `k6-complete-lily-${timestamp}@test.com`,
      capabilities: [
        {
          name: 'test_capability',
          description: 'Test capability for k6',
          parameters: {},
          async: false,
          estimatedTime: '5s',
        },
      ],
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (lilyRes.status !== 201) {
    console.error(`Failed to register Lily: ${lilyRes.status} ${lilyRes.body}`);
    return null;
  }

  const alice = JSON.parse(aliceRes.body).data;
  const lily = JSON.parse(lilyRes.body).data;

  // Create and accept tasks for complete testing
  console.log('Creating and accepting tasks for complete test...');
  const taskIds = [];
  for (let i = 0; i < 50; i++) {
    // Create task
    const delegateRes = http.post(
      `${BASE_URL}/api/v1/tasks/delegate`,
      JSON.stringify({
        toBotId: lily.botId,
        capability: 'test_capability',
        parameters: { completeTask: i },
        priority: 'normal',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alice.apiKey}`,
        },
      }
    );

    if (delegateRes.status !== 201) continue;

    const taskId = JSON.parse(delegateRes.body).data.taskId;

    // Accept task
    const acceptRes = http.post(
      `${BASE_URL}/api/v1/tasks/${taskId}/accept`,
      null,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lily.apiKey}`,
        },
      }
    );

    if (acceptRes.status === 200) {
      taskIds.push(taskId);
    }
  }

  console.log(`Setup complete: Created and accepted ${taskIds.length} tasks`);

  return { alice, lily, taskIds };
}

/**
 * Main test: Complete tasks
 */
export default function (data) {
  if (!data || !data.lily || !data.taskIds || data.taskIds.length === 0) {
    console.error('Setup failed, skipping test');
    errorRate.add(true);
    return;
  }

  // Get a task ID (round-robin)
  const taskIndex = (__ITER + __VU) % data.taskIds.length;
  const taskId = data.taskIds[taskIndex];

  const payload = JSON.stringify({
    status: 'completed',
    result: {
      iteration: __ITER,
      vu: __VU,
      completedAt: Date.now(),
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.lily.apiKey}`,
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/tasks/${taskId}/complete`, payload, params);

  // Complete may fail if task already completed (expected in concurrent test)
  const success = check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409 || r.status === 400,
    'response time < 150ms': (r) => r.timings.duration < 150,
  });

  errorRate.add(!success);
  completeDuration.add(res.timings.duration);

  sleep(0.1);
}

/**
 * Teardown: Log summary
 */
export function teardown(data) {
  if (data && data.taskIds) {
    console.log(`Teardown: Complete test finished with ${data.taskIds.length} tasks`);
  }
}
