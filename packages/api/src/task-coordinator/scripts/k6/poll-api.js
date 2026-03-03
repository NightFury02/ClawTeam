/**
 * k6 Performance Test - Poll API
 *
 * Tests GET /api/v1/tasks/pending endpoint performance.
 *
 * Prerequisites:
 * 1. Install k6: brew install k6
 * 2. Start services: docker-compose up -d && npm run dev:api
 * 3. Seed test data: Create a team with invite code 'TEST-INVITE-CODE'
 *
 * Run:
 *   k6 run scripts/k6/poll-api.js
 *
 * With custom options:
 *   k6 run --vus 50 --duration 30s scripts/k6/poll-api.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const pollDuration = new Trend('poll_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 VUs
    { duration: '1m', target: 50 },    // Stay at 50 VUs
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<50', 'p(99)<100'],
    errors: ['rate<0.01'],  // Error rate < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const INVITE_CODE = __ENV.INVITE_CODE || 'TEST-INVITE-CODE';

/**
 * Setup: Register a bot and create some pending tasks
 */
export function setup() {
  const timestamp = Date.now();

  // Register Alice (task sender)
  const aliceRes = http.post(
    `${BASE_URL}/api/v1/bots/register`,
    JSON.stringify({
      name: `k6_poll_alice_${timestamp}`,
      inviteCode: INVITE_CODE,
      ownerEmail: `k6-poll-alice-${timestamp}@test.com`,
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

  // Register Lily (task receiver / poller)
  const lilyRes = http.post(
    `${BASE_URL}/api/v1/bots/register`,
    JSON.stringify({
      name: `k6_poll_lily_${timestamp}`,
      inviteCode: INVITE_CODE,
      ownerEmail: `k6-poll-lily-${timestamp}@test.com`,
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

  // Create some pending tasks for Lily to poll
  console.log('Creating pending tasks for poll test...');
  for (let i = 0; i < 20; i++) {
    const delegateRes = http.post(
      `${BASE_URL}/api/v1/tasks/delegate`,
      JSON.stringify({
        toBotId: lily.botId,
        capability: 'test_capability',
        parameters: { setupTask: i },
        priority: ['urgent', 'high', 'normal', 'low'][i % 4],
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alice.apiKey}`,
        },
      }
    );

    if (delegateRes.status !== 201) {
      console.warn(`Failed to create task ${i}: ${delegateRes.status}`);
    }
  }

  console.log(`Setup complete: Alice=${alice.botId}, Lily=${lily.botId}`);

  return { alice, lily };
}

/**
 * Main test: Poll pending tasks for Lily
 */
export default function (data) {
  if (!data || !data.lily) {
    console.error('Setup failed, skipping test');
    errorRate.add(true);
    return;
  }

  const params = {
    headers: {
      Authorization: `Bearer ${data.lily.apiKey}`,
    },
  };

  const res = http.get(`${BASE_URL}/api/v1/tasks/pending?limit=10`, params);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'has tasks array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && Array.isArray(body.data.tasks);
      } catch {
        return false;
      }
    },
    'response time < 100ms': (r) => r.timings.duration < 100,
  });

  errorRate.add(!success);
  pollDuration.add(res.timings.duration);

  // Small delay between requests
  sleep(0.1);
}

/**
 * Teardown: Log summary
 */
export function teardown(data) {
  if (data && data.lily) {
    console.log(`Teardown: Poll test completed for Lily=${data.lily.botId}`);
  }
}
