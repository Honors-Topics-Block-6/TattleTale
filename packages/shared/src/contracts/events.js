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
};
//# sourceMappingURL=events.js.map