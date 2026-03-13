import { randomUUID } from 'node:crypto';
import type { SystemEvent } from './types.js';

export function createSystemEvent(type: string, summary: string): SystemEvent {
  return {
    id: randomUUID(),
    type,
    summary,
    timestamp: Date.now(),
  };
}

export function pushSystemEvent(systemEvents: SystemEvent[], type: string, summary: string): SystemEvent {
  const event = createSystemEvent(type, summary);
  systemEvents.unshift(event);
  if (systemEvents.length > 200) {
    systemEvents.splice(200);
  }
  return event;
}
