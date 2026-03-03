/**
 * k6 Performance Test - Delegate API
 *
 * Tests POST /api/v1/tasks/delegate endpoint performance.
 *
 * Prerequisites:
 * 1. Install k6: brew install k6
 * 2. Start services: docker-compose up -d && npm run dev:api
 * 3. Seed test data: Create a team with invite code 'TEST-INVITE-CODE'
 *
 * Run:
 *   k6 run scripts/k6/delegate-api.js
 *
 * With custom options:
 *   k6 run --vus 50 --duration 30s scripts/k6/delegate-api.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const delegateDuration = new Trend('delegate_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Ramp up to 100 VUs
    { duration: '1m', target: 100 },   // Stay at 100 VUs
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<200'],
    errors: ['rate<0.01'],  // Error rate < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const INVITE_CODE = __ENV.INVITE_CODE || 'TEST-INVITE-CODE';

/**
 * Setup: Register two bots for testing
 */
export function setup() {
  const timestamp = Date.now();

  // Register Alice (task sender)
  const aliceRes = http.post(
    `${BASE_URL}/api/v1/bots/register`,
    JSON.stringify({
      name: `k6_alice_${timestamp}`,
      inviteCode: INVITE_CODE,
      ownerEmail: `k6-alice-${timestamp}@test.com`,
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
      name: `k6_lily_${timestamp}`,
      inviteCode: INVITE_CODE,
      ownerEmail: `k6-lily-${timestamp}@test.com`,
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

  console.log(`Setup complete: Alice=${alice.botId}, Lily=${lily.botId}`);

  return { alice, lily };
}

/**
 * Main test: Delegate tasks from Alice to Lily
 */
export default function (data) {
  if (!data || !data.alice || !data.lily) {
    console.error('Setup failed, skipping test');
    errorRate.add(true);
    return;
  }

  const payload = JSON.stringify({
    toBotId: data.lily.botId,
    capability: 'test_capability',
    parameters: {
      iteration: __ITER,
      vu: __VU,
      timestamp: Date.now(),
    },
    priority: 'normal',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.alice.apiKey}`,
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/tasks/delegate`, payload, params);

  const success = check(res, {
    'status is 201': (r) => r.status === 201,
    'has taskId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.taskId !== undefined;
      } catch {
        return false;
      }
    },
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  errorRate.add(!success);
  delegateDuration.add(res.timings.duration);

  // Small delay between requests
  sleep(0.1);
}

/**
 * Teardown: Log summary
 */
export function teardown(data) {
  if (data && data.alice && data.lily) {
    console.log(`Teardown: Test completed for Alice=${data.alice.botId}, Lily=${data.lily.botId}`);
  }
}
