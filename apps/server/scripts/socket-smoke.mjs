import {
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
} from '@tattletale/shared';
import { io as createClient } from 'socket.io-client';

const SERVER_ORIGIN = process.env.SERVER_ORIGIN ?? 'http://localhost:3001';
const NAMESPACE_URL = `${SERVER_ORIGIN}${SOCKET_NAMESPACE}`;

function onceEvent(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for event: ${eventName}`));
    }, timeoutMs);

    function onEvent(payload) {
      clearTimeout(timer);
      resolve(payload);
    }

    socket.once(eventName, onEvent);
  });
}

function connectClient(label) {
  return new Promise((resolve, reject) => {
    const socket = createClient(NAMESPACE_URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`${label}: timed out connecting`));
    }, 5000);

    const readyPromise = onceEvent(socket, SOCKET_EVENTS.server.ready);

    socket.once('connect', async () => {
      try {
        const ready = await readyPromise;
        clearTimeout(timer);
        resolve({ socket, ready });
      } catch (error) {
        clearTimeout(timer);
        socket.disconnect();
        reject(error);
      }
    });

    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
}

function emitAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Ack timeout for event: ${eventName}`));
    }, 8000);

    socket.emit(eventName, payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

async function main() {
  const clients = [];

  try {
    const host = await connectClient('host');
    clients.push(host.socket);

    const createAck = await emitAck(host.socket, SOCKET_EVENTS.client.createLobby, {
      displayName: 'HostPlayer',
    });

    if (!createAck.ok) {
      throw new Error(`createLobby failed: ${createAck.error.code} ${createAck.error.message}`);
    }

    const lobbyCode = createAck.data.lobby.code;
    const hostPlayerId = createAck.data.playerId;
    const hostReconnectToken = createAck.data.reconnectToken;

    console.log('Lobby created');
    console.log(`  lobbyCode: ${lobbyCode}`);
    console.log(`  hostPlayerId: ${hostPlayerId}`);

    let receiverSocket = null;
    for (let index = 0; index < 6; index += 1) {
      const label = `player${index + 2}`;
      const playerConn = await connectClient(label);
      clients.push(playerConn.socket);

      const joinAck = await emitAck(playerConn.socket, SOCKET_EVENTS.client.joinLobby, {
        lobbyCode,
        displayName: `Player${index + 2}`,
      });

      if (!joinAck.ok) {
        throw new Error(`joinLobby (${label}) failed: ${joinAck.error.code} ${joinAck.error.message}`);
      }

      if (index === 0) {
        receiverSocket = playerConn.socket;
      }

      console.log(`Joined: ${joinAck.data.playerId} as Player${index + 2}`);
    }

    if (!receiverSocket) {
      throw new Error('No receiver socket was captured for chat validation.');
    }

    const lobbyChatPromise = onceEvent(receiverSocket, SOCKET_EVENTS.server.chatMessage);
    const lobbyChatAck = await emitAck(host.socket, SOCKET_EVENTS.client.chatSend, {
      lobbyCode,
      playerId: hostPlayerId,
      reconnectToken: hostReconnectToken,
      text: 'lobby chat smoke test',
    });
    if (!lobbyChatAck.ok) {
      throw new Error(`chatSend (lobby) failed: ${lobbyChatAck.error.code} ${lobbyChatAck.error.message}`);
    }
    const lobbyChatEvent = await lobbyChatPromise;
    console.log(`Lobby chat delivered: ${lobbyChatEvent.messageId}`);

    const startAck = await emitAck(host.socket, SOCKET_EVENTS.client.startGame, {
      lobbyCode,
      actorPlayerId: hostPlayerId,
      reconnectToken: hostReconnectToken,
    });

    if (!startAck.ok) {
      throw new Error(`startGame failed: ${startAck.error.code} ${startAck.error.message}`);
    }

    console.log('Game started');
    console.log(`  gameId: ${startAck.data.session.gameId}`);
    console.log(`  phase: ${startAck.data.session.phase}`);
    console.log(`  players: ${startAck.data.session.players.length}`);

    const sessionChatPromise = onceEvent(receiverSocket, SOCKET_EVENTS.server.chatMessage);
    const sessionChatAck = await emitAck(host.socket, SOCKET_EVENTS.client.chatSend, {
      lobbyCode,
      playerId: hostPlayerId,
      reconnectToken: hostReconnectToken,
      text: 'session chat smoke test',
    });
    if (!sessionChatAck.ok) {
      throw new Error(`chatSend (session) failed: ${sessionChatAck.error.code} ${sessionChatAck.error.message}`);
    }
    const sessionChatEvent = await sessionChatPromise;
    console.log(`Session chat delivered: ${sessionChatEvent.messageId}`);
    console.log('');
    console.log('Use these to verify persistence:');
    console.log(`  Neon games.lobby_code = ${lobbyCode}`);
    console.log(`  Neon games.id = ${startAck.data.session.gameId}`);
    console.log(`  Redis key lobby:${lobbyCode}`);
    console.log(`  Redis key session:${startAck.data.session.gameId}`);
    console.log(`  Neon message_audit_events.lobby_code = ${lobbyCode}`);
  } finally {
    for (const socket of clients) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
