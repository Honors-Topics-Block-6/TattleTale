import { useEffect, useRef, useState } from 'react';
import { SOCKET_EVENTS } from '@tattletale/shared';
import useAppMenu from '../../os/hooks/useAppMenu';
import {
  ensureLobbySocket,
  getLobbySocket,
  notifyLobbySocketConnected,
  tearDownLobbySocket,
} from '../../lib/lobbySocketManager';
import {
  CHAT_SERVER_URL,
  DEFAULT_LOBBY_CODE,
  READY_PREFIX,
  STORAGE_KEY,
} from '../../lib/sessionConstants';
import './lobby.css';

/** @param {import('socket.io-client').Socket} sock */
function runLobbySocketCleanup(sock) {
  const unload = sock.__ttLobbyUnload;
  if (typeof unload === 'function') {
    unload();
    sock.__ttLobbyUnload = undefined;
  }
}

function readyStorageKeyFor(lobbyCode, usernameValue) {
  const lobby = String(lobbyCode || '').trim();
  const user = String(usernameValue || '').trim().toLowerCase();
  if (!lobby || !user) return null;
  return `${READY_PREFIX}${lobby}:${user}`;
}

function LobbyComponent({ windowId }) {
  const [username, setUsername] = useState('');
  const [sessionId, setSessionId] = useState(DEFAULT_LOBBY_CODE);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [phase, setPhase] = useState('WAITING');
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [mePlayerId, setMePlayerId] = useState(null);
  const [meReady, setMeReady] = useState(false);
  const [sessionSelf, setSessionSelf] = useState(null);
  const [error, setError] = useState('');
  const identityRef = useRef({ reconnectToken: null, playerId: null, username: '' });
  const lastLobbyCodeRef = useRef(null);
  const usernameLowerRef = useRef('');

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.username) setUsername(parsed.username);
      if (parsed?.sessionId) setSessionId(parsed.sessionId);
      identityRef.current = {
        reconnectToken: parsed.reconnectToken || null,
        playerId: parsed.playerId || null,
        username: parsed.username || '',
      };
    } catch (parseError) {
      console.warn('Invalid chat identity cache', parseError);
    }
  }, []);

  useEffect(() => {
    usernameLowerRef.current = username.trim().toLowerCase();
  }, [username]);

  useEffect(() => {
    const onReadyChanged = (e) => {
      const detail = e?.detail;
      if (!detail) return;
      const { lobbyCode, usernameKey, value } = detail;
      if (!lobbyCode || !usernameKey) return;

      if (lastLobbyCodeRef.current !== lobbyCode) return;
      if (usernameLowerRef.current !== usernameKey) return;

      setMeReady(Boolean(value));

      const s = getLobbySocket();
      const id = identityRef.current;
      if (
        s?.connected &&
        id.playerId &&
        id.reconnectToken &&
        lastLobbyCodeRef.current === lobbyCode
      ) {
        s.emit(SOCKET_EVENTS.client.setLobbyReady, {
          lobbyCode,
          playerId: id.playerId,
          reconnectToken: id.reconnectToken,
          ready: Boolean(value),
        });
      }
    };

    window.addEventListener('tattletale:ready-changed', onReadyChanged);
    return () => window.removeEventListener('tattletale:ready-changed', onReadyChanged);
  }, []);

  const connectAndJoin = () => {
    if (!username.trim() || !sessionId.trim()) {
      setError('Username and lobby code are required.');
      return;
    }
    if (connecting) return;

    const socket = ensureLobbySocket();

    if (joined && socket.connected) {
      setError('');
      return;
    }

    setConnecting(true);
    setError(`Connecting to ${CHAT_SERVER_URL}...`);

    runLobbySocketCleanup(socket);

    const applyLobbyCommandSuccess = (data) => {
      if (!data?.lobby || !data.playerId || !data.reconnectToken) return;
      const { lobby, playerId, reconnectToken } = data;
      identityRef.current = {
        ...identityRef.current,
        reconnectToken,
        playerId,
        username: username.trim(),
      };
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...identityRef.current,
          sessionId: lobby.code,
          hostPlayerId: lobby.hostPlayerId,
        }),
      );
      const wantReady =
        localStorage.getItem(readyStorageKeyFor(lobby.code, username.trim())) === 'true';
      const mePl = lobby.players.find((p) => p.playerId === playerId);
      if (mePl && mePl.ready !== wantReady && socket.connected) {
        socket.emit(SOCKET_EVENTS.client.setLobbyReady, {
          lobbyCode: lobby.code,
          playerId,
          reconnectToken,
          ready: wantReady,
        });
      }
    };

    const onConnect = () => {
      setConnected(true);
      setConnecting(false);
      setError('');
      notifyLobbySocketConnected();

      socket.emit(
        SOCKET_EVENTS.client.joinLobby,
        {
          lobbyCode: sessionId.trim(),
          displayName: username.trim(),
        },
        (ack) => {
          if (ack?.ok && ack.data) {
            applyLobbyCommandSuccess(ack.data);
          }
        },
      );
    };

    const onDisconnect = () => {
      setConnected(false);
      setConnecting(false);
    };

    const onLobbyState = (lobbyView) => {
      setJoined(true);
      setConnecting(false);
      const lobbyStatus = lobbyView?.status;
      if (lobbyStatus && lobbyStatus !== 'IN_GAME') {
        setPhase(lobbyStatus);
      }
      setError('');

      const players = lobbyView?.players || [];
      setLobbyPlayers(players);

      const lobbyCode = lobbyView?.code || sessionId.trim();
      lastLobbyCodeRef.current = lobbyCode;

      const normalizedUsername = username.trim().toLowerCase();
      const identityPlayerId = identityRef.current.playerId;

      const meById = identityPlayerId
        ? players.find((p) => p.playerId === identityPlayerId)
        : null;
      const meByName = players.find(
        (p) => p.displayName?.toLowerCase() === normalizedUsername,
      );
      const me = meById || meByName;

      const nextMePlayerId = me?.playerId || null;
      setMePlayerId(nextMePlayerId);

      identityRef.current = {
        ...identityRef.current,
        username: username.trim(),
        playerId: nextMePlayerId,
      };
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...identityRef.current,
          sessionId: lobbyCode,
          hostPlayerId: lobbyView.hostPlayerId,
        }),
      );

      const readyKey = readyStorageKeyFor(lobbyCode, username.trim());
      const wantReady = readyKey ? localStorage.getItem(readyKey) === 'true' : false;
      setMeReady(wantReady);

      if (
        me &&
        socket.connected &&
        identityRef.current.reconnectToken &&
        me.ready !== wantReady
      ) {
        socket.emit(SOCKET_EVENTS.client.setLobbyReady, {
          lobbyCode,
          playerId: me.playerId,
          reconnectToken: identityRef.current.reconnectToken,
          ready: wantReady,
        });
      }
    };

    const onSessionState = (sessionView) => {
      if (sessionView?.phase) {
        setPhase(sessionView.phase);
      }
      setSessionSelf(sessionView?.self ?? null);
    };

    const onCommandError = (commandError) => {
      setConnecting(false);
      const code = commandError?.code;
      if (code === 'LOBBY_NOT_FOUND') {
        socket.emit(
          SOCKET_EVENTS.client.createLobby,
          {
            displayName: username.trim(),
            settings: undefined,
          },
          (ack) => {
            if (ack?.ok && ack.data) {
              applyLobbyCommandSuccess(ack.data);
            }
          },
        );
        return;
      }
      setError(commandError?.message || 'Command failed. Check lobby code and try again.');
    };

    const onConnectError = (connectError) => {
      setConnecting(false);
      setConnected(false);
      const baseMessage = connectError?.message || 'Socket.IO connection failed.';
      setError(
        `${baseMessage} Could not connect to ${CHAT_SERVER_URL}. ` +
          `Is the server running? Set VITE_CHAT_SERVER_URL if needed.`,
      );
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(SOCKET_EVENTS.server.lobbyState, onLobbyState);
    socket.on(SOCKET_EVENTS.server.sessionState, onSessionState);
    socket.on(SOCKET_EVENTS.server.commandError, onCommandError);
    socket.on('connect_error', onConnectError);

    socket.__ttLobbyUnload = () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(SOCKET_EVENTS.server.lobbyState, onLobbyState);
      socket.off(SOCKET_EVENTS.server.sessionState, onSessionState);
      socket.off(SOCKET_EVENTS.server.commandError, onCommandError);
      socket.off('connect_error', onConnectError);
    };

    if (!socket.connected) {
      socket.connect();
    } else {
      setConnected(true);
      setConnecting(false);
      setError('');
      notifyLobbySocketConnected();
      socket.emit(
        SOCKET_EVENTS.client.joinLobby,
        {
          lobbyCode: sessionId.trim(),
          displayName: username.trim(),
        },
        (ack) => {
          if (ack?.ok && ack.data) {
            applyLobbyCommandSuccess(ack.data);
          }
        },
      );
    }
  };

  const onLeave = () => {
    tearDownLobbySocket();
    setConnected(false);
    setJoined(false);
    identityRef.current = { reconnectToken: null, playerId: null, username: '' };
    localStorage.removeItem(STORAGE_KEY);
    lastLobbyCodeRef.current = null;
    setLobbyPlayers([]);
    setSessionSelf(null);
    setError('');
  };

  useAppMenu(windowId, {
    'lobby.connect': connectAndJoin,
    'lobby.disconnect': onLeave,
  });

  if (!joined) {
    return (
      <div className="lobby-root">
        <div className="lobby-join">
          <h3>Lobby</h3>
          <p>Join an existing lobby code or create a new one if the code does not exist yet.</p>
          <input
            className="lobby-input"
            placeholder="Display name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="lobby-input"
            placeholder="Lobby code"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          />
          <button type="button" className="lobby-button" onClick={connectAndJoin} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Join lobby'}
          </button>
          {error ? <div className="lobby-error">{error}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-root">
      <div className="lobby-panel">
        <div className="lobby-topbar">
          <strong>Lobby: {sessionId}</strong>
          <span className="lobby-status">Phase: {phase}</span>
          {phase === 'WAITING' && (
            <span className="lobby-status">You: {meReady ? 'Shut off' : 'On'}</span>
          )}
          {sessionSelf && phase === 'NIGHT_ACTIONS' && (
            <span className="lobby-status">
              {sessionSelf.sleeping ? 'Sleep mode' : 'Awake (night)'} · Team: {sessionSelf.team ?? '—'}
            </span>
          )}
          <button type="button" className="lobby-button" onClick={onLeave} style={{ marginLeft: 'auto' }}>
            Leave lobby
          </button>
          <span className="lobby-status">{connected ? 'Connected' : 'Reconnecting…'}</span>
        </div>
        <div className="lobby-main">
          <div className="lobby-players">
            <h4>Players</h4>
            {lobbyPlayers.map((player) => {
              const displayReady = player.playerId === mePlayerId ? meReady : player.ready;
              const isOffline = !player.connected;
              return (
                <div
                  key={player.playerId}
                  className={`lobby-player-row ${isOffline ? 'offline' : ''}`}
                  title={player.displayName}
                >
                  {player.displayName}
                  {player.playerId === mePlayerId ? ' (You)' : ''}
                  {phase === 'WAITING' && displayReady ? ' · Shut off' : ''}
                  {player.isHost ? ' · Host' : ''}
                </div>
              );
            })}
            {phase === 'WAITING' ? (
              <p className="lobby-hint">
                Use the desktop power icon or Ready Toggle to shut off your station. When everyone has shut
                off and the lobby is full, the game starts automatically.
              </p>
            ) : null}
          </div>
        </div>
        {error ? <div className="lobby-error" style={{ padding: '6px 8px' }}>{error}</div> : null}
      </div>
    </div>
  );
}

const lobbyIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="4" y="6" width="24" height="20" rx="2" fill="#f0f4ff" stroke="#4d6ec2" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="5" fill="none" stroke="#4d6ec2" stroke-width="1.5"/>
    <path d="M16 11 L16 8" stroke="#4d6ec2" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M8 26 L24 26" stroke="#888" stroke-width="1"/>
  </svg>
`);

const Lobby = {
  id: 'lobby',
  name: 'Lobby',
  icon: lobbyIcon,
  component: LobbyComponent,
  defaultWindow: {
    width: 420,
    height: 380,
    resizable: true,
    minWidth: 320,
    minHeight: 280,
  },
  menuBar: {
    items: [
      {
        id: 'session',
        label: 'Session',
        items: [
          { id: 'connect', label: 'Connect / Join', action: 'lobby.connect' },
          { id: 'disconnect', label: 'Leave lobby', action: 'lobby.disconnect' },
        ],
      },
    ],
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Join or create a game lobby',
  },
};

export default Lobby;
