/**
 * JSON Schema for Bot Registration Request
 */

import { JSONSchema7 } from 'json-schema';

export const registerBotSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['name', 'capabilities'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Bot name (alphanumeric, underscore, hyphen)',
    },
    ownerEmail: {
      type: 'string',
      format: 'email',
      description: 'Owner email address',
    },
    capabilities: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        required: ['name', 'description'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            description: 'Capability name',
          },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: 1000,
            description: 'Capability description',
          },
          parameters: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                description: { type: 'string' },
                required: { type: 'boolean' },
              },
              required: ['type'],
            },
            description: 'Parameter schema',
          },
          async: {
            type: 'boolean',
            description: 'Whether the capability is async',
          },
          estimatedTime: {
            type: 'string',
            pattern: '^\\d+(\\.\\d+)?\\s*(s|m|h|d|ms)$',
            description: 'Estimated execution time (e.g., "5s", "2m")',
          },
        },
      },
      description: 'List of capabilities',
    },
    tags: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
      },
      description: 'Tags for categorization',
    },
    availability: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., "UTC-8")',
        },
        workingHours: {
          type: 'string',
          pattern: '^\\d{2}:\\d{2}-\\d{2}:\\d{2}$',
          description: 'Working hours (e.g., "09:00-18:00")',
        },
        autoRespond: {
          type: 'boolean',
          description: 'Auto-respond when offline',
        },
      },
      required: ['timezone', 'workingHours', 'autoRespond'],
      description: 'Availability configuration',
    },
    userId: {
      type: 'string',
      format: 'email',
      description: 'User ID (email) for OpenClaw integration',
    },
    userName: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: 'User display name',
    },
    clientType: {
      type: 'string',
      enum: ['openclaw', 'custom', 'sdk'],
      description: 'Client type (openclaw, custom, sdk)',
    },
  },
  additionalProperties: false,
};

export const registerBotResponseSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        botId: { type: 'string' },
      },
    },
    traceId: { type: 'string' },
  },
};
