import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS, SOCKET_NAMESPACE } from '@tattletale/shared';
import useAppMenu from '../../os/hooks/useAppMenu';
import useMenuStore from '../../os/store/menuStore';
import './chatRoom.css';

// Default matches `apps/server` env default (`PORT` defaults to 3001).
const CHAT_SERVER_URL = import.meta.env.VITE_CHAT_SERVER_URL || 'http://localhost:3001';
const DEFAULT_SESSION_ID = 'tattletale-room-1';
const STORAGE_KEY = 'tattletale-chat-identity';
const READY_PREFIX = 'tattletale-ready:';

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatRoomComponent({ windowId }) {
  const openContextMenu = useMenuStore((state) => state.openContextMenu);
  const [username, setUsername] = useState('');
  const [sessionId, setSessionId] = useState(DEFAULT_SESSION_ID);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [phase, setPhase] = useState('DAY_OPEN');
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [mePlayerId, setMePlayerId] = useState(null);
  const [meReady, setMeReady] = useState(false);
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState('global');
  const [users, setUsers] = useState([]);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState('');
  const [dmTarget, setDmTarget] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const identityRef = useRef({ reconnectToken: null, playerId: null, username: '' });
  const lastLobbyCodeRef = useRef(null);
  const usernameLowerRef = useRef('');

  const readyStorageKeyFor = (lobbyCode, usernameValue) => {
    const lobby = String(lobbyCode || '').trim();
    const user = String(usernameValue || '').trim().toLowerCase();
    if (!lobby || !user) return null;
    return `${READY_PREFIX}${lobby}:${user}`;
  };

  const pushEvent = (event) => {
    setEvents((prev) => [event, ...prev].slice(0, 120));
  };

  const storeIdentity = (nextIdentity) => {
    identityRef.current = nextIdentity;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...nextIdentity,
      sessionId,
    }));
  };

  const resetStateForNewJoin = () => {
    setChannels([]);
    setUsers([]);
    setMessagesByChannel({});
    setEvents([]);
    setActiveChannelId('global');
    setDraft('');
    setError('');
  };

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
    };

    window.addEventListener('tattletale:ready-changed', onReadyChanged);
    return () => window.removeEventListener('tattletale:ready-changed', onReadyChanged);
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const connectAndJoin = () => {
    if (!username.trim() || !sessionId.trim()) {
      setError('Username and session are required.');
      return;
    }
    if (connecting) return;

    if (!socketRef.current) {
      // Server registers the realtime handlers under `SOCKET_NAMESPACE` (default: `/session`).
      socketRef.current = io(`${CHAT_SERVER_URL}${SOCKET_NAMESPACE}`, {
        // Let Socket.IO negotiate the best transport (websocket-first can fail
        // if the server/client don't fully agree on protocol details).
        autoConnect: false,
        reconnection: true,
      });
    }

    const socket = socketRef.current;
    setConnecting(true);
    setError(`Connecting to ${CHAT_SERVER_URL}...`);

    socket.off('connect');
    socket.off('disconnect');
    socket.off('session.snapshot');
    socket.off('chat.message');
    socket.off('system.event');
    socket.off('channel.available');
    socket.off('channel.switched');
    socket.off('user.presence');
    socket.off('intent.rejected');
    socket.off('session.error');
    socket.off('connect_error');

    socket.on('connect', () => {
      setConnected(true);
      setConnecting(false);
      setError('');

      // Minimal compatibility with the current server skeleton:
      // treat `sessionId` as `lobbyCode` and use joinLobby.
      socket.emit(SOCKET_EVENTS.client.joinLobby, {
        lobbyCode: sessionId.trim(),
        displayName: username.trim(),
      });
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setConnecting(false);
      pushEvent({
        id: `disconnect-${Date.now()}`,
        type: 'CONNECTION_LOST',
        summary: 'Connection lost. Attempting reconnect...',
        timestamp: Date.now(),
      });
    });

    // When using the foundation namespace events, the server emits lobby/session state.
    // This app UI will at least stop "Connecting..." once we get a lobby state.
    socket.on(SOCKET_EVENTS.server.lobbyState, (lobbyView) => {
      setJoined(true);
      setConnecting(false);
      setPhase(lobbyView?.status || 'LOBBY');
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

      // Persist minimal identity so the desktop "Ready Toggle" can find our lobby + username.
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
        }),
      );

      // Local-only readiness, keyed by lobbyCode + username.
      const readyKey = readyStorageKeyFor(lobbyCode, username.trim());
      setMeReady(readyKey ? localStorage.getItem(readyKey) === 'true' : false);

      // The foundation skeleton doesn't provide chat messages yet; keep UI stable.
      setChannels([]);
      setUsers([]);
      setMessagesByChannel({});
      setEvents([]);
      setActiveChannelId('global');
    });

    socket.on(SOCKET_EVENTS.server.commandError, (commandError) => {
      setConnecting(false);
      const code = commandError?.code;
      // If the requested lobby doesn't exist yet, fall back to creating it.
      if (code === 'LOBBY_NOT_FOUND') {
        socket.emit(SOCKET_EVENTS.client.createLobby, {
          displayName: username.trim(),
          settings: undefined,
        });
        return;
      }
      setError(commandError?.message || 'Command failed. Check lobby/session inputs.');
    });

    socket.on('connect_error', (connectError) => {
      setConnecting(false);
      setConnected(false);
      const baseMessage =
        connectError?.message || 'Socket.IO connection failed.';
      setError(
        `${baseMessage} Could not connect to ${CHAT_SERVER_URL}. ` +
          `Is the chat server running on that port? ` +
          `If not, set VITE_CHAT_SERVER_URL.`
      );
    });

    // Register handlers before triggering the connection. Otherwise, a fast
    // successful handshake can happen before listeners are attached, leaving
    // the UI stuck on "Connecting...".
    if (!socket.connected) {
      socket.connect();
    }
  };

  const sendIntent = (type, payload) => {
    if (!socketRef.current || !connected) {
      setError('Not connected to server.');
      return;
    }
    socketRef.current.emit('intent', {
      type,
      timestamp: Date.now(),
      payload: {
        sessionId: sessionId.trim(),
        playerId: identityRef.current.playerId,
        ...payload,
      },
    });
  };

  const onSendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    sendIntent('SEND_MESSAGE', { channelId: activeChannelId, text });
    setDraft('');
  };

  const onSwitchChannel = (channelId) => {
    sendIntent('SWITCH_CHANNEL', { channelId });
  };

  const onCreateDm = () => {
    const target = dmTarget.trim();
    if (!target) return;
    sendIntent('SWITCH_CHANNEL', { targetUsername: target });
    setDmTarget('');
  };

  const onUserContextMenu = (event, user) => {
    event.preventDefault();
    event.stopPropagation();

    const isSelf = user.name?.toLowerCase() === username.trim().toLowerCase();
    openContextMenu(event.clientX, event.clientY, [
      {
        id: 'chat-with-user',
        label: isSelf ? 'This is you' : `Chat with ${user.name}`,
        disabled: isSelf,
        action: () => {
          sendIntent('SWITCH_CHANNEL', { targetUsername: user.name });
        },
      },
    ]);
  };

  const onLeave = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setConnected(false);
    setJoined(false);
    identityRef.current = { reconnectToken: null, playerId: null, username: '' };
    localStorage.removeItem(STORAGE_KEY);
    resetStateForNewJoin();
  };

  useAppMenu(windowId, {
    'session.connect': connectAndJoin,
    'session.disconnect': onLeave,
    'chat.clear': () => setMessagesByChannel({}),
  });

  const visibleMessages = useMemo(
    () => messagesByChannel[activeChannelId] || [],
    [messagesByChannel, activeChannelId]
  );

  if (!joined) {
    return (
      <div className="chatroom-root">
        <div className="chatroom-join">
          <h3>Network Chat</h3>
          <p>Server-authoritative chat with intent-based actions.</p>
          <input
            className="chatroom-input"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <input
            className="chatroom-input"
            placeholder="Session ID"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
          />
          <button
            type="button"
            className="chatroom-button"
            onClick={connectAndJoin}
            disabled={connecting}
          >
            {connecting ? 'Connecting...' : 'Join Session'}
          </button>
          {error && <div className="chatroom-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="chatroom-root">
      <div className="chatroom-topbar">
        <strong>{sessionId}</strong>
        <span>Phase: {phase}</span>
        {phase === 'WAITING' && (
          <span className="chatroom-status">{meReady ? 'Ready: YES' : 'Ready: NO'}</span>
        )}
        <input
          className="chatroom-input"
          placeholder="Create/open DM with username"
          value={dmTarget}
          onChange={(event) => setDmTarget(event.target.value)}
        />
        <button type="button" className="chatroom-button" onClick={onCreateDm}>
          Open DM
        </button>
        <button type="button" className="chatroom-button" onClick={onLeave}>
          Leave
        </button>
        <span className="chatroom-status">{connected ? 'Connected' : 'Reconnecting...'}</span>
      </div>

      <div className="chatroom-main">
        <aside className="chatroom-panel">
          <div className="chatroom-heading">Channels</div>
          <ul className="chatroom-list">
            {channels.map((channel) => (
              <li key={channel.id}>
                <button
                  type="button"
                  className={`chatroom-list-item ${activeChannelId === channel.id ? 'active' : ''}`}
                  onClick={() => onSwitchChannel(channel.id)}
                >
                  #{channel.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="chatroom-feed">
          <div className="chatroom-messages">
            {visibleMessages.map((message) => (
              <div className="chatroom-message" key={message.id}>
                <span className="chatroom-message-meta">[{formatTime(message.timestamp)}]</span>
                <strong>{message.senderName}: </strong>
                <span>{message.text}</span>
              </div>
            ))}
          </div>

          <div className="chatroom-system-events">
            {events.map((event) => (
              <div key={event.id} className="chatroom-event-item">
                [{formatTime(event.timestamp)}] {event.summary}
              </div>
            ))}
          </div>

          <div className="chatroom-composer">
            <input
              className="chatroom-input"
              value={draft}
              placeholder="Type message..."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSendMessage();
              }}
            />
            <button type="button" className="chatroom-button" onClick={onSendMessage}>
              Send
            </button>
          </div>
        </section>

        <aside className="chatroom-panel">
          <div className="chatroom-heading">{phase === 'WAITING' ? 'Lobby Players' : 'Users'}</div>
          {phase === 'WAITING'
            ? lobbyPlayers.map((player) => {
                const displayReady = player.playerId === mePlayerId ? meReady : false;
                const isOffline = !player.connected;
                return (
                  <div
                    key={player.playerId}
                    className={`chatroom-user-item ${isOffline ? 'offline' : ''}`}
                    title={player.displayName}
                  >
                    {player.displayName}
                    {player.playerId === mePlayerId ? ' (You)' : ''}
                    {displayReady ? ' (Ready)' : ''}
                  </div>
                );
              })
            : users.map((user) => (
                <div
                  key={user.id}
                  className={`chatroom-user-item ${user.online ? '' : 'offline'}`}
                  onContextMenu={(event) => onUserContextMenu(event, user)}
                  title={`Right-click to chat with ${user.name}`}
                >
                  {user.name} {user.online ? '' : '(offline)'}
                </div>
              ))}
        </aside>
      </div>
      {error && <div className="chatroom-error" style={{ padding: '6px 8px' }}>{error}</div>}
    </div>
  );
}

const chatIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="4" width="28" height="20" rx="2" fill="#e7f0ff" stroke="#4d78c2" stroke-width="1"/>
    <path d="M8 24 L8 30 L14 24 Z" fill="#e7f0ff" stroke="#4d78c2" stroke-width="1"/>
    <rect x="6" y="8" width="20" height="2" fill="#4d78c2"/>
    <rect x="6" y="12" width="16" height="2" fill="#4d78c2"/>
    <rect x="6" y="16" width="12" height="2" fill="#4d78c2"/>
  </svg>
`);

const ChatRoom = {
  id: 'chat-room',
  name: 'Chat Room',
  icon: chatIcon,
  component: ChatRoomComponent,
  defaultWindow: {
    width: 980,
    height: 640,
    resizable: true,
    minWidth: 720,
    minHeight: 420,
  },
  menuBar: {
    items: [
      {
        id: 'session',
        label: 'Session',
        items: [
          { id: 'connect', label: 'Connect / Join', action: 'session.connect' },
          { id: 'disconnect', label: 'Disconnect', action: 'session.disconnect' },
        ],
      },
      {
        id: 'chat',
        label: 'Chat',
        items: [
          { id: 'clear', label: 'Clear Current Messages', action: 'chat.clear' },
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
    description: 'Real-time multi-user network chat',
  },
};

export default ChatRoom;
