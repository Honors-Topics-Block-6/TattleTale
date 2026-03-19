import { useEffect, useMemo, useState } from 'react';
import { SOCKET_EVENTS } from '@tattletale/shared';
import useAppMenu from '../../os/hooks/useAppMenu';
import { getLobbySocket, tearDownLobbySocket } from '../../lib/lobbySocketManager';
import { CHAT_SERVER_URL, STORAGE_KEY } from '../../lib/sessionConstants';
import './chatRoom.css';

/** @param {import('socket.io-client').Socket} sock */
function runChatSocketCleanup(sock) {
  const unload = sock.__ttChatUnload;
  if (typeof unload === 'function') {
    unload();
    sock.__ttChatUnload = undefined;
  }
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatRoomComponent({ windowId }) {
  const [socketRev, setSocketRev] = useState(0);
  const [username, setUsername] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState('DAY_OPEN');
  const [sessionSelf, setSessionSelf] = useState(null);
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState('global');
  const [users, setUsers] = useState([]);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState('');
  const [dmTarget, setDmTarget] = useState('');
  const [error, setError] = useState('');

  const pushEvent = (event) => {
    setEvents((prev) => [event, ...prev].slice(0, 120));
  };

  const resetChatState = () => {
    setChannels([]);
    setUsers([]);
    setMessagesByChannel({});
    setEvents([]);
    setActiveChannelId('global');
    setDraft('');
    setError('');
    setJoined(false);
    setConnected(false);
    setSessionId('');
    setPhase('DAY_OPEN');
    setSessionSelf(null);
  };

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.username) setUsername(parsed.username);
      if (parsed?.sessionId) setSessionId(parsed.sessionId);
    } catch (parseError) {
      console.warn('Invalid chat identity cache', parseError);
    }
  }, [socketRev]);

  useEffect(() => {
    const bump = () => setSocketRev((n) => n + 1);
    window.addEventListener('tattletale:lobby-socket-connected', bump);
    window.addEventListener('tattletale:lobby-socket-disconnected', bump);
    return () => {
      window.removeEventListener('tattletale:lobby-socket-connected', bump);
      window.removeEventListener('tattletale:lobby-socket-disconnected', bump);
    };
  }, []);

  useEffect(() => {
    const socket = getLobbySocket();

    if (!socket) {
      setJoined(false);
      setConnected(false);
      return undefined;
    }

    runChatSocketCleanup(socket);

    const onConnect = () => {
      setConnected(true);
    };

    const onDisconnect = () => {
      setConnected(false);
      pushEvent({
        id: `disconnect-${Date.now()}`,
        type: 'CONNECTION_LOST',
        summary: 'Connection lost. Attempting reconnect...',
        timestamp: Date.now(),
      });
    };

    const onLobbyState = (lobbyView) => {
      setJoined(true);
      setError('');
      const lobbyStatus = lobbyView?.status;
      if (lobbyStatus && lobbyStatus !== 'IN_GAME') {
        setPhase(lobbyStatus);
      }
      const lobbyCode = lobbyView?.code || '';
      if (lobbyCode) setSessionId(lobbyCode);

      const parsed = (() => {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch {
          return {};
        }
      })();
      if (parsed?.username) setUsername(parsed.username);

      setChannels([]);
      setUsers([]);
      setMessagesByChannel({});
      setEvents([]);
      setActiveChannelId('global');
    };

    const onSessionState = (sessionView) => {
      if (sessionView?.phase) {
        setPhase(sessionView.phase);
      }
      setSessionSelf(sessionView?.self ?? null);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(SOCKET_EVENTS.server.lobbyState, onLobbyState);
    socket.on(SOCKET_EVENTS.server.sessionState, onSessionState);

    socket.__ttChatUnload = () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(SOCKET_EVENTS.server.lobbyState, onLobbyState);
      socket.off(SOCKET_EVENTS.server.sessionState, onSessionState);
    };

    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      runChatSocketCleanup(socket);
    };
  }, [socketRev]);

  const sendIntent = (type, payload) => {
    const sock = getLobbySocket();
    if (!sock?.connected) {
      setError('Not connected to server. Open Lobby and join a session.');
      return;
    }
    sock.emit('intent', {
      type,
      timestamp: Date.now(),
      payload: {
        sessionId: sessionId.trim(),
        playerId: (() => {
          try {
            const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return p?.playerId ?? null;
          } catch {
            return null;
          }
        })(),
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

  const onLeaveSession = () => {
    const s = getLobbySocket();
    if (s) runChatSocketCleanup(s);
    tearDownLobbySocket();
    localStorage.removeItem(STORAGE_KEY);
    resetChatState();
    setUsername('');
  };

  useAppMenu(windowId, {
    'session.disconnect': onLeaveSession,
    'chat.clear': () => setMessagesByChannel({}),
  });

  const visibleMessages = useMemo(
    () => messagesByChannel[activeChannelId] || [],
    [messagesByChannel, activeChannelId],
  );

  const socket = getLobbySocket();
  if (!socket?.connected) {
    return (
      <div className="chatroom-root">
        <div className="chatroom-join">
          <h3>Network Chat</h3>
          <p>
            Join a lobby from the <strong>Lobby</strong> app first. When you are connected, open Chat Room
            to send messages here.
          </p>
          <p className="chatroom-hint" style={{ color: '#555', fontSize: 11 }}>
            Server: {CHAT_SERVER_URL}
          </p>
          {socket && !socket.connected ? (
            <p className="chatroom-hint" style={{ color: '#a40000', fontSize: 11 }}>
              Connecting to server... If this stays stuck, check the Lobby app.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="chatroom-root">
        <div className="chatroom-join">
          <h3>Network Chat</h3>
          <p>Connected. Waiting for lobby state... Open the Lobby app if you have not finished joining.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chatroom-root">
      <div className="chatroom-topbar">
        <strong>{sessionId || '—'}</strong>
        {username ? <span className="chatroom-status">As {username}</span> : null}
        <span>Phase: {phase}</span>
        {sessionSelf && phase === 'NIGHT_ACTIONS' && (
          <span className="chatroom-status">
            {sessionSelf.sleeping ? 'Sleep mode' : 'Awake (night)'} · Team: {sessionSelf.team ?? '—'}
          </span>
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
        <button type="button" className="chatroom-button" onClick={onLeaveSession}>
          Leave session
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
          <div className="chatroom-heading">Users</div>
          {users.map((user) => (
            <div
              key={user.id}
              className={`chatroom-user-item ${user.online ? '' : 'offline'}`}
              title={user.name}
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

const chatIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
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
        items: [{ id: 'disconnect', label: 'Leave session', action: 'session.disconnect' }],
      },
      {
        id: 'chat',
        label: 'Chat',
        items: [{ id: 'clear', label: 'Clear Current Messages', action: 'chat.clear' }],
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
