import { randomUUID } from 'node:crypto';
import type { ChannelState, ChatMessage, Phase, PlayerState, SessionState } from './types.js';

const sessions = new Map<string, SessionState>();
const ACTIVE_PHASE: Phase = 'DAY_OPEN';

function createChannel(id: string, label: string, type: ChannelState['type'], members: string[]): ChannelState {
  return {
    id,
    label,
    type,
    members,
    locked: false,
  };
}

export function getOrCreateSession(sessionId: string): SessionState {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const next: SessionState = {
    id: sessionId,
    phase: ACTIVE_PHASE,
    players: new Map(),
    channels: new Map(),
    messagesByChannel: new Map(),
    systemEvents: [],
  };

  next.channels.set('global', createChannel('global', 'global', 'GLOBAL', []));
  next.channels.set('system', createChannel('system', 'system', 'SYSTEM', []));
  next.messagesByChannel.set('global', []);
  next.messagesByChannel.set('system', []);

  sessions.set(sessionId, next);
  return next;
}

export function getSession(sessionId: string): SessionState | null {
  return sessions.get(sessionId) ?? null;
}

function addUniqueMember(channel: ChannelState, playerId: string): void {
  if (!channel.members.includes(playerId)) channel.members.push(playerId);
}

export function upsertPlayer(
  session: SessionState,
  username: string,
  socketId: string,
  reconnectToken?: string
): PlayerState {
  const normalized = username.trim();
  if (reconnectToken) {
    const reconnectTarget = [...session.players.values()].find(
      (player) => player.reconnectToken === reconnectToken && player.name === normalized
    );
    if (reconnectTarget) {
      reconnectTarget.online = true;
      reconnectTarget.socketId = socketId;
      return reconnectTarget;
    }
  }

  const existingByName = [...session.players.values()].find((player) => player.name === normalized);
  if (existingByName && !existingByName.online) {
    existingByName.online = true;
    existingByName.socketId = socketId;
    return existingByName;
  }

  const player: PlayerState = {
    id: randomUUID(),
    name: normalized,
    online: true,
    socketId,
    reconnectToken: randomUUID(),
    activeChannelId: 'global',
  };

  session.players.set(player.id, player);

  const globalChannel = session.channels.get('global');
  const systemChannel = session.channels.get('system');
  if (globalChannel) addUniqueMember(globalChannel, player.id);
  if (systemChannel) addUniqueMember(systemChannel, player.id);
  return player;
}

export function setPlayerOffline(session: SessionState, playerId: string): void {
  const player = session.players.get(playerId);
  if (!player) return;
  player.online = false;
  player.socketId = undefined;
}

export function getAccessibleChannels(session: SessionState, playerId: string): ChannelState[] {
  return [...session.channels.values()].filter((channel) => channel.members.includes(playerId));
}

export function appendChannelMessage(session: SessionState, message: ChatMessage): void {
  const list = session.messagesByChannel.get(message.channelId) ?? [];
  list.push(message);
  if (list.length > 300) {
    list.splice(0, list.length - 300);
  }
  session.messagesByChannel.set(message.channelId, list);
}

export function getVisibleMessages(session: SessionState, playerId: string): Record<string, ChatMessage[]> {
  const channels = getAccessibleChannels(session, playerId);
  const result: Record<string, ChatMessage[]> = {};
  channels.forEach((channel) => {
    result[channel.id] = session.messagesByChannel.get(channel.id) ?? [];
  });
  return result;
}

export function findPlayerById(session: SessionState, playerId: string): PlayerState | null {
  return session.players.get(playerId) ?? null;
}

export function findPlayerByName(session: SessionState, username: string): PlayerState | null {
  const normalized = username.trim().toLowerCase();
  const found = [...session.players.values()].find((player) => player.name.toLowerCase() === normalized);
  return found ?? null;
}

export function getPresenceSnapshot(session: SessionState): Array<{ id: string; name: string; online: boolean }> {
  return [...session.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    online: player.online,
  }));
}
