import { useEffect, useState } from 'react';

const STORAGE_KEY = 'tattletale-chat-identity';
const READY_PREFIX = 'tattletale-ready:';

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

  const lobbyCode = identity?.sessionId || null;
  const username = identity?.username || null;

  const key = readyStorageKey(lobbyCode, username);

  useEffect(() => {
    const sync = () => {
      if (!key) return;
      setReady(localStorage.getItem(key) === 'true');
    };

    sync();

    const onReadyChanged = (e) => {
      const detail = e?.detail;
      if (!detail) return;
      // Refresh identity in case the lobby/username was just set.
      setIdentity(getIdentity());
      // If the event affects our current key, update the UI.
      if (detail?.lobbyCode && detail?.usernameKey && key) {
        const expected = readyStorageKey(detail.lobbyCode, detail.usernameKey);
        if (expected === key) setReady(Boolean(detail.value));
      }
    };

    window.addEventListener('tattletale:ready-changed', onReadyChanged);
    return () => window.removeEventListener('tattletale:ready-changed', onReadyChanged);
  }, [key]);

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
        gap: 6,
      }}
    >
      <div style={{ fontWeight: 700 }}>Ready Toggle</div>
      <div>
        Status: <strong>{ready ? 'READY' : 'UNREADY'}</strong>
      </div>
      <div style={{ color: '#555', maxWidth: 200 }}>
        Use the desktop icon to toggle your readiness in the lobby.
      </div>
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
    width: 250,
    height: 160,
    resizable: false,
    minWidth: 250,
    minHeight: 160,
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

