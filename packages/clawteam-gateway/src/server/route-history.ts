/**
 * Route History Buffer
 *
 * Ring buffer storing the most recent routing decisions and results.
 * Used by the local API to expose route history without persistence.
 */

import type { RouteHistoryEntry } from './types.js';

export class RouteHistory {
  private readonly buffer: RouteHistoryEntry[];
  private readonly capacity: number;
  private head = 0;
  private count = 0;

  constructor(capacity = 100) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(entry: RouteHistoryEntry): void {
    this.buffer[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  getAll(): RouteHistoryEntry[] {
    if (this.count === 0) return [];

    const result: RouteHistoryEntry[] = [];
    const start = this.count < this.capacity
      ? 0
      : this.head;

    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      result.push(this.buffer[idx]);
    }

    // Return newest first
    return result.reverse();
  }

  get size(): number {
    return this.count;
  }
}
