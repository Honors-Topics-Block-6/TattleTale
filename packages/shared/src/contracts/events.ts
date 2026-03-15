import type {
  CreateLobbyCommand,
  JoinLobbyCommand,
  KickPlayerCommand,
  LeaveLobbyCommand,
  ReconnectCommand,
  StartGameCommand,
} from './commands.js';
import type { CommandAck, CommandErrorPayload } from './errors.js';
import type {
  LobbyCommandSuccess,
  LobbyView,
  SessionView,
  SocketReadyPayload,
  StartGameSuccess,
} from './views.js';

export const SOCKET_NAMESPACE = '/session';

export const SOCKET_EVENTS = {
  client: {
    createLobby: 'lobby:create',
    joinLobby: 'lobby:join',
    reconnect: 'lobby:reconnect',
    leaveLobby: 'lobby:leave',
    kickPlayer: 'lobby:kick-player',
    startGame: 'game:start',
  },
  server: {
    ready: 'system:ready',
    lobbyState: 'lobby:state',
    sessionState: 'session:state',
    commandError: 'command:error',
  },
} as const;

export type SocketEventName =
  | (typeof SOCKET_EVENTS.client)[keyof typeof SOCKET_EVENTS.client]
  | (typeof SOCKET_EVENTS.server)[keyof typeof SOCKET_EVENTS.server];

export interface ClientCommandPayloads {
  [SOCKET_EVENTS.client.createLobby]: CreateLobbyCommand;
  [SOCKET_EVENTS.client.joinLobby]: JoinLobbyCommand;
  [SOCKET_EVENTS.client.reconnect]: ReconnectCommand;
  [SOCKET_EVENTS.client.leaveLobby]: LeaveLobbyCommand;
  [SOCKET_EVENTS.client.kickPlayer]: KickPlayerCommand;
  [SOCKET_EVENTS.client.startGame]: StartGameCommand;
}

export interface ClientCommandAcks {
  [SOCKET_EVENTS.client.createLobby]: CommandAck<LobbyCommandSuccess>;
  [SOCKET_EVENTS.client.joinLobby]: CommandAck<LobbyCommandSuccess>;
  [SOCKET_EVENTS.client.reconnect]: CommandAck<LobbyCommandSuccess>;
  [SOCKET_EVENTS.client.leaveLobby]: CommandAck<{ lobby: LobbyView | null }>;
  [SOCKET_EVENTS.client.kickPlayer]: CommandAck<{ lobby: LobbyView }>;
  [SOCKET_EVENTS.client.startGame]: CommandAck<StartGameSuccess>;
}

export interface ServerPushPayloads {
  [SOCKET_EVENTS.server.ready]: SocketReadyPayload;
  [SOCKET_EVENTS.server.lobbyState]: LobbyView;
  [SOCKET_EVENTS.server.sessionState]: SessionView;
  [SOCKET_EVENTS.server.commandError]: CommandErrorPayload;
}
