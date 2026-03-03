/**
 * JSON Schema for Capability Update Request
 */

import { JSONSchema7 } from 'json-schema';

export const updateCapabilitiesSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['capabilities'],
  properties: {
    capabilities: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        required: ['name', 'description', 'parameters', 'async', 'estimatedTime'],
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
  },
  additionalProperties: false,
};

export const updateCapabilitiesResponseSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        botId: { type: 'string' },
        capabilitiesCount: { type: 'number' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    traceId: { type: 'string' },
  },
};

export const updateStatusSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: ['online', 'offline', 'busy', 'focus_mode'],
      description: 'New bot status',
    },
  },
  additionalProperties: false,
};

export const botParamsSchema: JSONSchema7 = {
  type: 'object',
  required: ['botId'],
  properties: {
    botId: {
      type: 'string',
      minLength: 1,
      description: 'Bot ID',
    },
  },
};
