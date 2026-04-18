import { describe, expect, it } from 'vitest';
import { IntentType } from '../enums.js';
import { SubmitIntentPayloadSchema } from './messages.js';

// Regression test for commit 2971cf8:
// NightActionPayloadSchema must appear before VotePayloadSchema in the z.union so
// that actionType and metadata are not stripped by Zod's first-match-wins behaviour.

describe('SubmitIntentPayloadSchema union ordering', () => {
  it('preserves actionType and metadata on a night-action payload', () => {
    const input = {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: {
          actionType: 'HACKER_KILL',
          targetPlayerId: 'p2',
          metadata: { channelId: 'hacker-chan', silent: true },
        },
        clientTimestamp: '2026-04-17T00:00:00.000Z',
      },
    };

    const result = SubmitIntentPayloadSchema.parse(input);

    expect(result.intent.payload).toEqual({
      actionType: 'HACKER_KILL',
      targetPlayerId: 'p2',
      metadata: { channelId: 'hacker-chan', silent: true },
    });
  });

  it('parses a plain vote payload without coercing it into a night-action shape', () => {
    const input = {
      intent: {
        type: IntentType.SUBMIT_VOTE,
        payload: {
          targetPlayerId: 'p3',
        },
        clientTimestamp: '2026-04-17T00:00:00.000Z',
      },
    };

    const result = SubmitIntentPayloadSchema.parse(input);

    expect(result.intent.payload).toEqual({ targetPlayerId: 'p3' });
    expect((result.intent.payload as Record<string, unknown>).actionType).toBeUndefined();
  });
});
