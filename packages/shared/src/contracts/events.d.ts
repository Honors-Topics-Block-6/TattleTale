import type { CreateLobbyCommand, JoinLobbyCommand, KickPlayerCommand, LeaveLobbyCommand, ReconnectCommand, StartGameCommand } from './commands.js';
import type { CommandAck, CommandErrorPayload } from './errors.js';
import type { LobbyCommandSuccess, LobbyView, SessionView, SocketReadyPayload, StartGameSuccess } from './views.js';
export declare const SOCKET_NAMESPACE = "/session";
export declare const SOCKET_EVENTS: {
    readonly client: {
        readonly createLobby: "lobby:create";
        readonly joinLobby: "lobby:join";
        readonly reconnect: "lobby:reconnect";
        readonly leaveLobby: "lobby:leave";
        readonly kickPlayer: "lobby:kick-player";
        readonly startGame: "game:start";
    };
    readonly server: {
        readonly ready: "system:ready";
        readonly lobbyState: "lobby:state";
        readonly sessionState: "session:state";
        readonly commandError: "command:error";
    };
};
export type SocketEventName = (typeof SOCKET_EVENTS.client)[keyof typeof SOCKET_EVENTS.client] | (typeof SOCKET_EVENTS.server)[keyof typeof SOCKET_EVENTS.server];
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
    [SOCKET_EVENTS.client.leaveLobby]: CommandAck<{
        lobby: LobbyView | null;
    }>;
    [SOCKET_EVENTS.client.kickPlayer]: CommandAck<{
        lobby: LobbyView;
    }>;
    [SOCKET_EVENTS.client.startGame]: CommandAck<StartGameSuccess>;
}
export interface ServerPushPayloads {
    [SOCKET_EVENTS.server.ready]: SocketReadyPayload;
    [SOCKET_EVENTS.server.lobbyState]: LobbyView;
    [SOCKET_EVENTS.server.sessionState]: SessionView;
    [SOCKET_EVENTS.server.commandError]: CommandErrorPayload;
}
//# sourceMappingURL=events.d.ts.map