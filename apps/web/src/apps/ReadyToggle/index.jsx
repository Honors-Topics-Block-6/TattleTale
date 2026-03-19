import { useEffect, useState } from 'react';
import { SOCKET_EVENTS } from '@tattletale/shared';
import { lobbySocketRef } from '../../lib/lobbySocketRef';

const STORAGE_KEY = 'tattletale-chat-identity';
const READY_PREFIX = 'tattletale-ready:';

const CHAT_SERVER_URL = import.meta.env.VITE_CHAT_SERVER_URL || 'http://localhost:3001';

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getIdentity() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = safeParse(raw);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function readyStorageKey(lobbyCode, username) {
  const lobby = String(lobbyCode || '').trim();
  const user = String(username || '').trim().toLowerCase();
  if (!lobby || !user) return null;
  return `${READY_PREFIX}${lobby}:${user}`;
}

function ReadyToggleComponent() {
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState(() => getIdentity());
  const [startMessage, setStartMessage] = useState('');
  const [starting, setStarting] = useState(false);

  const lobbyCode = identity?.sessionId || null;
  const username = identity?.username || null;

  const key = readyStorageKey(lobbyCode, username);

  const isHost =
    identity?.playerId &&
    identity?.hostPlayerId &&
    identity.playerId === identity.hostPlayerId;

  useEffect(() => {
    const sync = () => {
      if (!key) return;
      setReady(localStorage.getItem(key) === 'true');
    };

    sync();

    const onReadyChanged = (e) => {
      const detail = e?.detail;
      if (!detail) return;
      setIdentity(getIdentity());
      if (detail?.lobbyCode && detail?.usernameKey && key) {
        const expected = readyStorageKey(detail.lobbyCode, detail.usernameKey);
        if (expected === key) setReady(Boolean(detail.value));
      }
    };

    window.addEventListener('tattletale:ready-changed', onReadyChanged);
    return () => window.removeEventListener('tattletale:ready-changed', onReadyChanged);
  }, [key]);

  const onStartGame = () => {
    setStartMessage('');
    const id = getIdentity();
    const socket = lobbySocketRef.current;
    if (!socket?.connected) {
      setStartMessage(`Connect in Chat Room first (${CHAT_SERVER_URL}).`);
      return;
    }
    if (!id?.playerId || !id?.reconnectToken || !id?.sessionId) {
      setStartMessage('Join a lobby in Chat Room first.');
      return;
    }
    if (id.playerId !== id.hostPlayerId) {
      setStartMessage('Only the lobby host can start the game.');
      return;
    }
    setStarting(true);
    socket.emit(
      SOCKET_EVENTS.client.startGame,
      {
        lobbyCode: id.sessionId,
        actorPlayerId: id.playerId,
        reconnectToken: id.reconnectToken,
      },
      (ack) => {
        setStarting(false);
        if (!ack?.ok) {
          setStartMessage(ack?.error?.message || 'Could not start game.');
          return;
        }
        setStartMessage('Game started — night cycle began.');
      },
    );
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 12,
        padding: 12,
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700 }}>Ready Toggle</div>
      <div>
        Status: <strong>{ready ? 'READY' : 'UNREADY'}</strong>
      </div>
      <div style={{ color: '#555', maxWidth: 220 }}>
        Use the desktop icon to toggle readiness. Everyone must be ready before the host starts.
      </div>
      {isHost ? (
        <button
          type="button"
          onClick={onStartGame}
          disabled={starting}
          style={{
            padding: '8px 14px',
            cursor: starting ? 'wait' : 'pointer',
            border: '1px solid #3b5f9a',
            borderRadius: 4,
            background: 'linear-gradient(180deg, #fefefe 0%, #dce8fb 100%)',
            fontFamily: 'Tahoma, sans-serif',
            fontSize: 12,
          }}
        >
          {starting ? 'Starting…' : 'Shut off (Start game)'}
        </button>
      ) : (
        <div style={{ color: '#777', fontSize: 11 }}>Waiting for host to start…</div>
      )}
      {startMessage ? (
        <div style={{ color: '#315280', fontSize: 11, maxWidth: 240 }}>{startMessage}</div>
      ) : null}
    </div>
  );
}

const readyIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="5" y="7" width="22" height="18" rx="2" fill="#e7f7ea" stroke="#2f8f3a" stroke-width="2"/>
    <path d="M10 16 L14 20 L22 12" fill="none" stroke="#2f8f3a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`);

const ReadyToggle = {
  id: 'ready-toggle',
  name: 'Ready Toggle',
  icon: readyIcon,
  component: ReadyToggleComponent,
  defaultWindow: {
    width: 280,
    height: 220,
    resizable: false,
    minWidth: 280,
    minHeight: 220,
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: false,
    section: 'programs',
  },
};

export default ReadyToggle;
