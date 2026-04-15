import { z } from 'zod';
import { IntentType } from '../enums.js';

// ─── Client Message Types ────────────────────────────────────

export const ClientMessageTypes = [
  'joinLobby',
  'rejoinLobby',
  'kickPlayer',
  'startGame',
  'submitIntent',
] as const;

export type ClientMessageType = (typeof ClientMessageTypes)[number];

// ─── Client Payload Schemas ──────────────────────────────────

export const JoinLobbyPayloadSchema = z.object({
  displayName: z.string().min(2).max(24),
});
export type JoinLobbyPayload = z.infer<typeof JoinLobbyPayloadSchema>;

export const RejoinLobbyPayloadSchema = z.object({
  playerId: z.string().min(1),
  reconnectToken: z.string().min(1),
});
export type RejoinLobbyPayload = z.infer<typeof RejoinLobbyPayloadSchema>;

export const KickPlayerPayloadSchema = z.object({
  targetPlayerId: z.string().min(1),
});
export type KickPlayerPayload = z.infer<typeof KickPlayerPayloadSchema>;

export const StartGamePayloadSchema = z.object({});
export type StartGamePayload = z.infer<typeof StartGamePayloadSchema>;

export const VotePayloadSchema = z.object({
  targetPlayerId: z.string().nullable(),
});
export type VotePayload = z.infer<typeof VotePayloadSchema>;

export const NightActionPayloadSchema = z.object({
  actionType: z.string().min(1),
  targetPlayerId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type NightActionPayload = z.infer<typeof NightActionPayloadSchema>;

export const MessagePayloadSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1),
});
export type MessagePayload = z.infer<typeof MessagePayloadSchema>;

export const SubmitIntentPayloadSchema = z.object({
  intent: z.object({
    type: z.nativeEnum(IntentType),
    payload: z.union([VotePayloadSchema, NightActionPayloadSchema, MessagePayloadSchema]),
    clientTimestamp: z.string(),
  }),
});
export type SubmitIntentPayload = z.infer<typeof SubmitIntentPayloadSchema>;

export const ClientPayloadSchemas = {
  joinLobby: JoinLobbyPayloadSchema,
  rejoinLobby: RejoinLobbyPayloadSchema,
  kickPlayer: KickPlayerPayloadSchema,
  startGame: StartGamePayloadSchema,
  submitIntent: SubmitIntentPayloadSchema,
} as const;

// ─── Client Message Envelope ─────────────────────────────────

export const ClientMessageSchema = z.object({
  type: z.enum(ClientMessageTypes),
  seq: z.number().int().nonnegative(),
  payload: z.unknown(),
});

export interface ClientMessage<T extends ClientMessageType = ClientMessageType> {
  type: T;
  seq: number;
  payload: unknown;
}

// ─── Server Message Types ────────────────────────────────────

export type ServerMessageType =
  | 'ack'
  | 'lobbyState'
  | 'sessionState'
  | 'channelMessage'
  | 'playerEliminated'
  | 'error'
  | 'kicked';

export interface ServerMessage<T extends ServerMessageType = ServerMessageType> {
  type: T;
  ref?: number;
  payload: unknown;
}

export interface ServerErrorPayload {
  code: string;
  message: string;
}
