import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { ensurePrivateChannel, getChannelById, isMember } from './channels.js';
import { pushSystemEvent } from './events.js';
import {
  appendChannelMessage,
  findActiveLoginByIp,
  findPlayerById,
  findPlayerByName,
  getAccessibleChannels,
  getOrCreateSession,
  getPresenceSnapshot,
  getVisibleMessages,
  setPlayerOffline,
  upsertPlayer,
} from './state.js';
import type {
  ChatMessage,
  JoinPayload,
  PlayerIntent,
  SendMessagePayload,
  SessionState,
  SwitchChannelPayload,
} from './types.js';

interface SessionSocketData {
  sessionId?: string;
  playerId?: string;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  return input as Record<string, unknown>;
}

function parseJoinPayload(input: unknown): JoinPayload | null {
  const raw = asRecord(input);
  if (!raw) return null;
  if (typeof raw.sessionId !== 'string' || typeof raw.username !== 'string') return null;
  return {
    sessionId: raw.sessionId,
    username: raw.username,
    reconnectToken: typeof raw.reconnectToken === 'string' ? raw.reconnectToken : undefined,
  };
}

function parseSendPayload(input: unknown): SendMessagePayload | null {
  const raw = asRecord(input);
  if (!raw) return null;
  if (
    typeof raw.sessionId !== 'string' ||
    typeof raw.playerId !== 'string' ||
    typeof raw.channelId !== 'string' ||
    typeof raw.text !== 'string'
  ) {
    return null;
  }
  return {
    sessionId: raw.sessionId,
    playerId: raw.playerId,
    channelId: raw.channelId,
    text: raw.text,
  };
}

function parseSwitchPayload(input: unknown): SwitchChannelPayload | null {
  const raw = asRecord(input);
  if (!raw) return null;
  if (typeof raw.sessionId !== 'string' || typeof raw.playerId !== 'string') return null;
  if (
    raw.channelId !== undefined &&
    typeof raw.channelId !== 'string'
  ) {
    return null;
  }
  if (
    raw.targetUsername !== undefined &&
    typeof raw.targetUsername !== 'string'
  ) {
    return null;
  }
  return {
    sessionId: raw.sessionId,
    playerId: raw.playerId,
    channelId: raw.channelId as string | undefined,
    targetUsername: raw.targetUsername as string | undefined,
  };
}

function rejectIntent(socket: Socket, message: string): void {
  socket.emit('intent.rejected', { message, timestamp: Date.now() });
}

function normalizeIpAddress(rawAddress: string | undefined): string {
  if (!rawAddress) return 'unknown';
  return rawAddress.startsWith('::ffff:') ? rawAddress.slice(7) : rawAddress;
}

function emitPresence(io: Server, session: SessionState): void {
  io.to(`session:${session.id}`).emit('user.presence', {
    users: getPresenceSnapshot(session),
  });
}

function ensureIntentWindow(socket: Socket, session: SessionState): boolean {
  if (session.phase !== 'DAY_OPEN') {
    rejectIntent(socket, `Intent rejected in phase ${session.phase}.`);
    return false;
  }
  return true;
}

function emitSessionSnapshot(socket: Socket, session: SessionState, playerId: string): void {
  const player = findPlayerById(session, playerId);
  if (!player) return;
  socket.emit('session.snapshot', {
    sessionId: session.id,
    playerId: player.id,
    reconnectToken: player.reconnectToken,
    phase: session.phase,
    channels: getAccessibleChannels(session, player.id),
    users: getPresenceSnapshot(session),
    activeChannelId: player.activeChannelId,
    messagesByChannel: getVisibleMessages(session, player.id),
    systemEvents: session.systemEvents,
  });
}

export function attachIntentHandler(io: Server, socket: Socket): void {
  socket.on('intent', (intent: PlayerIntent) => {
    if (!intent?.type || !intent.payload) {
      rejectIntent(socket, 'Malformed intent payload.');
      return;
    }

    if (intent.type === 'JOIN_SESSION') {
      const join = parseJoinPayload(intent.payload);
      if (!join) {
        socket.emit('session.error', { message: 'Invalid join payload.' });
        return;
      }
      if (!join.sessionId?.trim() || !join.username?.trim()) {
        socket.emit('session.error', { message: 'Session ID and username are required.' });
        return;
      }

      const session = getOrCreateSession(join.sessionId.trim());
      const clientIp = normalizeIpAddress(socket.handshake.address);
      const activeLogin = findActiveLoginByIp(clientIp);
      const reconnectingSamePlayer = Boolean(
        activeLogin && join.reconnectToken && activeLogin.player.reconnectToken === join.reconnectToken
      );

      if (activeLogin && !reconnectingSamePlayer) {
        socket.emit('session.error', {
          message: `IP ${clientIp} already has an active login (${activeLogin.player.name}).`,
        });
        return;
      }

      const player = upsertPlayer(session, join.username, socket.id, clientIp, join.reconnectToken);
      const socketData = socket.data as SessionSocketData;
      socketData.sessionId = session.id;
      socketData.playerId = player.id;

      socket.join(`session:${session.id}`);
      getAccessibleChannels(session, player.id).forEach((channel) => {
        socket.join(`channel:${channel.id}`);
      });

      const event = pushSystemEvent(
        session.systemEvents,
        'PLAYER_JOINED',
        `${player.name} joined the session.`
      );
      io.to(`session:${session.id}`).emit('system.event', event);
      emitPresence(io, session);
      emitSessionSnapshot(socket, session, player.id);
      return;
    }

    const socketData = socket.data as SessionSocketData;
    const sessionId = intent.payload.sessionId || socketData.sessionId;
    const playerId = intent.payload.playerId || socketData.playerId;
    if (!sessionId || !playerId) {
      rejectIntent(socket, 'Join a session first.');
      return;
    }

    const session = getOrCreateSession(sessionId);
    const player = findPlayerById(session, playerId);
    if (!player) {
      rejectIntent(socket, 'Player not found in session.');
      return;
    }

    if (!ensureIntentWindow(socket, session)) return;

    if (intent.type === 'SEND_MESSAGE') {
      const payload = parseSendPayload(intent.payload);
      if (!payload) {
        rejectIntent(socket, 'Invalid SEND_MESSAGE payload.');
        return;
      }
      const channel = getChannelById(session, payload.channelId);
      if (!channel) {
        rejectIntent(socket, 'Channel does not exist.');
        return;
      }
      if (!isMember(channel, player.id)) {
        rejectIntent(socket, 'You do not have access to that channel.');
        return;
      }

      const text = payload.text?.trim();
      if (!text) {
        rejectIntent(socket, 'Message text is required.');
        return;
      }

      const message: ChatMessage = {
        id: randomUUID(),
        channelId: channel.id,
        senderId: player.id,
        senderName: player.name,
        text,
        timestamp: Date.now(),
      };
      appendChannelMessage(session, message);
      io.to(`channel:${channel.id}`).emit('chat.message', message);
      return;
    }

    if (intent.type === 'SWITCH_CHANNEL') {
      const payload = parseSwitchPayload(intent.payload);
      if (!payload) {
        rejectIntent(socket, 'Invalid SWITCH_CHANNEL payload.');
        return;
      }
      let targetChannelId = payload.channelId;

      if (!targetChannelId && payload.targetUsername?.trim()) {
        const target = findPlayerByName(session, payload.targetUsername);
        if (!target) {
          rejectIntent(socket, `User ${payload.targetUsername} not found.`);
          return;
        }
        const privateChannel = ensurePrivateChannel(session, player, target);
        targetChannelId = privateChannel.id;

        [player, target].forEach((participant) => {
          if (participant.socketId) {
            io.sockets.sockets.get(participant.socketId)?.join(`channel:${privateChannel.id}`);
            io.to(participant.socketId).emit('channel.available', privateChannel);
          }
        });

        const event = pushSystemEvent(
          session.systemEvents,
          'TEMP_CHANNEL_CREATED',
          `Private channel opened for ${player.name} and ${target.name}.`
        );
        io.to(`session:${session.id}`).emit('system.event', event);
      }

      if (!targetChannelId) {
        rejectIntent(socket, 'Channel target is required.');
        return;
      }

      const channel = getChannelById(session, targetChannelId);
      if (!channel || !isMember(channel, player.id)) {
        rejectIntent(socket, 'Cannot switch to unavailable channel.');
        return;
      }

      player.activeChannelId = channel.id;
      socket.join(`channel:${channel.id}`);
      socket.emit('channel.switched', { channelId: channel.id });
      return;
    }

    rejectIntent(socket, `Unsupported intent type: ${intent.type}`);
  });
}

export function attachDisconnectHandler(io: Server, socket: Socket): void {
  socket.on('disconnect', () => {
    const { sessionId, playerId } = socket.data as SessionSocketData;
    if (!sessionId || !playerId) return;
    const session = getOrCreateSession(sessionId);
    const player = findPlayerById(session, playerId);
    if (!player) return;

    setPlayerOffline(session, player.id);
    const event = pushSystemEvent(
      session.systemEvents,
      'PLAYER_DISCONNECTED',
      `${player.name} disconnected. Reconnect is allowed.`
    );
    io.to(`session:${session.id}`).emit('system.event', event);
    emitPresence(io, session);
  });
}
