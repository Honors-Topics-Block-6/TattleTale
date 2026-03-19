import { io } from 'socket.io-client';
import { SOCKET_NAMESPACE } from '@tattletale/shared';
import { lobbySocketRef } from './lobbySocketRef';
import { CHAT_SERVER_URL } from './sessionConstants.js';

let socket = null;

/**
 * Create the singleton Socket.IO client if needed (does not connect).
 * @returns {import('socket.io-client').Socket}
 */
export function ensureLobbySocket() {
  if (!socket) {
    socket = io(`${CHAT_SERVER_URL}${SOCKET_NAMESPACE}`, {
      autoConnect: false,
      reconnection: true,
    });
    lobbySocketRef.current = socket;
  }
  return socket;
}

/** @returns {import('socket.io-client').Socket | null} */
export function getLobbySocket() {
  return socket;
}

export function tearDownLobbySocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  lobbySocketRef.current = null;
  window.dispatchEvent(new CustomEvent('tattletale:lobby-socket-disconnected'));
}

export function notifyLobbySocketConnected() {
  window.dispatchEvent(new CustomEvent('tattletale:lobby-socket-connected'));
}
