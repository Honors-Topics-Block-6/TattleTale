import { ClientMessageSchema, ClientPayloadSchemas, type ClientMessageType } from '@tattletale/shared';
import { z } from 'zod';

export type ParseResult =
  | { ok: true; type: ClientMessageType; seq: number; payload: unknown }
  | { ok: false; code: string; message: string };

export function parseClientMessage(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'INVALID_JSON', message: 'Message is not valid JSON' };
  }

  const envelope = ClientMessageSchema.safeParse(json);
  if (!envelope.success) {
    return { ok: false, code: 'INVALID_ENVELOPE', message: 'Invalid message envelope' };
  }

  const { type, seq, payload } = envelope.data;
  const schema = ClientPayloadSchemas[type as ClientMessageType];
  if (!schema) {
    return { ok: false, code: 'UNKNOWN_TYPE', message: `Unknown message type: ${type}` };
  }

  const payloadResult = (schema as z.ZodType).safeParse(payload);
  if (!payloadResult.success) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: `Invalid payload for ${type}: ${payloadResult.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  return { ok: true, type: type as ClientMessageType, seq, payload: payloadResult.data };
}
