/** Shared session / identity keys (Lobby + Chat Room + Ready Toggle). */

// Default matches `apps/server` env default (`PORT` defaults to 3001).
export const CHAT_SERVER_URL = import.meta.env.VITE_CHAT_SERVER_URL || 'http://localhost:3001';

export const STORAGE_KEY = 'tattletale-chat-identity';
export const READY_PREFIX = 'tattletale-ready:';
export const DEFAULT_LOBBY_CODE = 'tattletale-room-1';
