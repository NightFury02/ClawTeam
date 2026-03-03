/**
 * JSON Schema for Capability Search Request
 */

import { JSONSchema7 } from 'json-schema';

export const searchCapabilitiesSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['query'],
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      description: 'Search query text',
    },
    filters: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (OR logic)',
        },
        maxResponseTime: {
          type: 'string',
          pattern: '^\\d+(\\.\\d+)?\\s*(s|m|h|d)$',
          description: 'Maximum response time (e.g., "10s")',
        },
        async: {
          type: 'boolean',
          description: 'Filter by async capability',
        },
      },
      additionalProperties: false,
      description: 'Optional filters',
    },
    page: {
      type: 'integer',
      minimum: 1,
      default: 1,
      description: 'Page number (1-indexed)',
    },
    pageSize: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 10,
      description: 'Page size (max 50)',
    },
  },
  additionalProperties: false,
};

export const searchCapabilitiesResponseSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              botId: { type: 'string' },
              botName: { type: 'string' },
              ownerEmail: { type: 'string' },
              capability: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  parameters: { type: 'object' },
                  async: { type: 'boolean' },
                  estimatedTime: { type: 'string' },
                },
              },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              lastModified: { type: 'string', format: 'date-time' },
            },
          },
        },
        total: { type: 'integer' },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
        hasMore: { type: 'boolean' },
      },
    },
    traceId: { type: 'string' },
  },
};
