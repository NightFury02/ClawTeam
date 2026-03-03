/**
 * k6 Performance Test - Accept API
 *
 * Tests POST /api/v1/tasks/:taskId/accept endpoint performance.
 *
 * Prerequisites:
 * 1. Install k6: brew install k6
 * 2. Start services: docker-compose up -d && npm run dev:api
 * 3. Seed test data: Create a team with invite code 'TEST-INVITE-CODE'
 *
 * Run:
 *   k6 run scripts/k6/accept-api.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const acceptDuration = new Trend('accept_duration');

// Test configuration - lower VUs since each accept consumes a task
export const options = {
  stages: [
    { duration: '20s', target: 20 },   // Ramp up to 20 VUs
    { duration: '40s', target: 20 },   // Stay at 20 VUs
    { duration: '20s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<50', 'p(99)<100'],
    errors: ['rate<0.05'],  // Error rate < 5% (some tasks may already be accepted)
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const INVITE_CODE = __ENV.INVITE_CODE || 'TEST-INVITE-CODE';

/**
 * Setup: Register bots and create tasks
 */
export function setup() {
  const timestamp = Date.now();

  // Register Alice (task sender)
  const aliceRes = http.post(
    `${BASE_URL}/api/v1/bots/register`,
    JSON.stringify({
      name: `k6_accept_alice_${timestamp}`,
      inviteCode: INVITE_CODE,
      ownerEmail: `k6-accept-alice-${timestamp}@test.com`,
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
      name: `k6_accept_lily_${timestamp}`,
      inviteCode: INVITE_CODE,
      ownerEmail: `k6-accept-lily-${timestamp}@test.com`,
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

  // Create many tasks for accept testing
  console.log('Creating tasks for accept test...');
  const taskIds = [];
  for (let i = 0; i < 100; i++) {
    const delegateRes = http.post(
      `${BASE_URL}/api/v1/tasks/delegate`,
      JSON.stringify({
        toBotId: lily.botId,
        capability: 'test_capability',
        parameters: { acceptTask: i },
        priority: 'normal',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alice.apiKey}`,
        },
      }
    );

    if (delegateRes.status === 201) {
      const body = JSON.parse(delegateRes.body);
      taskIds.push(body.data.taskId);
    }
  }

  console.log(`Setup complete: Created ${taskIds.length} tasks`);

  return { alice, lily, taskIds, currentIndex: 0 };
}

/**
 * Main test: Accept tasks
 */
export default function (data) {
  if (!data || !data.lily || !data.taskIds || data.taskIds.length === 0) {
    console.error('Setup failed, skipping test');
    errorRate.add(true);
    return;
  }

  // Get a task ID (round-robin through available tasks)
  const taskIndex = (__ITER + __VU) % data.taskIds.length;
  const taskId = data.taskIds[taskIndex];

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.lily.apiKey}`,
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/tasks/${taskId}/accept`, null, params);

  // Accept may fail if task already accepted (expected in concurrent test)
  const success = check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });

  errorRate.add(!success);
  acceptDuration.add(res.timings.duration);

  sleep(0.05);
}

/**
 * Teardown: Log summary
 */
export function teardown(data) {
  if (data && data.taskIds) {
    console.log(`Teardown: Accept test completed with ${data.taskIds.length} tasks`);
  }
}
