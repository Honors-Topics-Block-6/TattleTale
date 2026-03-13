import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import useAppMenu from '../../os/hooks/useAppMenu';
import './chatRoom.css';

const CHAT_SERVER_URL = import.meta.env.VITE_CHAT_SERVER_URL || 'http://localhost:4000';
const DEFAULT_SESSION_ID = 'tattletale-room-1';
const STORAGE_KEY = 'tattletale-chat-identity';

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatRoomComponent({ windowId }) {
  const [username, setUsername] = useState('');
  const [sessionId, setSessionId] = useState(DEFAULT_SESSION_ID);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState('DAY_OPEN');
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

    if (!socketRef.current) {
      socketRef.current = io(CHAT_SERVER_URL, {
        transports: ['websocket'],
        autoConnect: false,
        reconnection: true,
      });
    }

    const socket = socketRef.current;
    if (!socket.connected) {
      socket.connect();
    }

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

    socket.on('connect', () => {
      setConnected(true);
      setError('');
      socket.emit('intent', {
        type: 'JOIN_SESSION',
        timestamp: Date.now(),
        payload: {
          sessionId: sessionId.trim(),
          username: username.trim(),
          reconnectToken: identityRef.current.reconnectToken,
        },
      });
    });

    socket.on('disconnect', () => {
      setConnected(false);
      pushEvent({
        id: `disconnect-${Date.now()}`,
        type: 'CONNECTION_LOST',
        summary: 'Connection lost. Attempting reconnect...',
        timestamp: Date.now(),
      });
    });

    socket.on('session.snapshot', (snapshot) => {
      setJoined(true);
      setPhase(snapshot.phase);
      setChannels(snapshot.channels || []);
      setUsers(snapshot.users || []);
      setMessagesByChannel(snapshot.messagesByChannel || {});
      setEvents(snapshot.systemEvents || []);
      setActiveChannelId(snapshot.activeChannelId || 'global');
      storeIdentity({
        reconnectToken: snapshot.reconnectToken,
        playerId: snapshot.playerId,
        username: username.trim(),
      });
    });

    socket.on('chat.message', (message) => {
      setMessagesByChannel((prev) => {
        const list = prev[message.channelId] || [];
        return {
          ...prev,
          [message.channelId]: [...list, message].slice(-200),
        };
      });
    });

    socket.on('system.event', (event) => {
      pushEvent(event);
    });

    socket.on('channel.available', (channel) => {
      setChannels((prev) => {
        const exists = prev.some((item) => item.id === channel.id);
        if (exists) return prev;
        return [...prev, channel];
      });
    });

    socket.on('channel.switched', (payload) => {
      setActiveChannelId(payload.channelId);
    });

    socket.on('user.presence', (presencePayload) => {
      setUsers(presencePayload.users || []);
    });

    socket.on('intent.rejected', (reason) => {
      setError(reason.message || 'Intent rejected by server.');
      pushEvent({
        id: `reject-${Date.now()}`,
        type: 'INTENT_REJECTED',
        summary: reason.message || 'Action rejected',
        timestamp: Date.now(),
      });
    });

    socket.on('session.error', (sessionError) => {
      setError(sessionError.message || 'Unable to join session.');
    });
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
          <button type="button" className="chatroom-button" onClick={connectAndJoin}>
            Join Session
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
          <div className="chatroom-heading">Users</div>
          {users.map((user) => (
            <div
              key={user.id}
              className={`chatroom-user-item ${user.online ? '' : 'offline'}`}
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
