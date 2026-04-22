import { useEffect, useState } from 'react';
import useGameStore from './stores/gameStore';
import { useSocket } from './lib/SocketContext';
import LeaderboardPanel from './components/LeaderboardPanel';
import {
  fetchMe,
  getAuthToken,
  login,
  logout,
  register,
  setAuthToken,
  updateProfile,
} from './lib/auth-api';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8787';
const API_BASE = WS_URL.replace(/^ws/, 'http');

// ─── Helpers ────────────────────────────────────────────────────

function randomDisplayName() {
  return `Player${Math.floor(Math.random() * 900) + 100}`;
}

function waitForConnected(socket, wsUrl, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let unsub = null;
    const timeout = setTimeout(() => {
      if (unsub) unsub();
      reject(new Error('WebSocket connect timed out'));
    }, timeoutMs);
    unsub = socket.onStateChange((state) => {
      if (state === 'connected') {
        clearTimeout(timeout);
        unsub();
        resolve();
      }
    });
    socket.connect(wsUrl);
  });
}

// ─── Main component ─────────────────────────────────────────────

export default function Lobby() {
  const socket = useSocket();
  const setSelfId = useGameStore((s) => s.setSelfId);
  const setLobbyView = useGameStore((s) => s.setLobbyView);
  const lobbyView = useGameStore((s) => s.lobbyView);
  const selfId = useGameStore((s) => s.selfId);

  // 'auth' | 'title' | 'profile' | 'leaderboard' | 'create' | 'join' | 'room' | 'error'
  const [screen, setScreen] = useState('auth');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [profileDraftName, setProfileDraftName] = useState('');
  const [profileDraftAvatar, setProfileDraftAvatar] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // Inputs
  const [displayName, setDisplayName] = useState(randomDisplayName());
  const [joinCode, setJoinCode] = useState('');
  const accountId = currentUser?.id ?? undefined;

  useEffect(() => {
    let cancelled = false;
    const token = getAuthToken();
    if (!token) {
      setScreen('auth');
      return;
    }
    fetchMe(token)
      .then((data) => {
        if (cancelled) return;
        setCurrentUser(data.user);
        setDisplayName(data.user.displayName || randomDisplayName());
        setProfileDraftName(data.user.displayName || '');
        setProfileDraftAvatar(data.user.avatar || '');
        setScreen('title');
      })
      .catch(() => {
        setAuthToken('');
        if (!cancelled) setScreen('auth');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goTitle = () => {
    socket.clearCredentials();
    socket.close();
    setLobbyView(null);
    setSelfId('');
    setErrorMsg('');
    setBusy(false);
    setScreen('title');
  };

  const handleAuthSubmit = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const payload = authMode === 'register'
        ? await register({
            email: authEmail.trim(),
            password: authPassword,
            displayName: displayName.trim(),
          })
        : await login({
            email: authEmail.trim(),
            password: authPassword,
          });
      setAuthToken(payload.token);
      setCurrentUser(payload.user);
      setDisplayName(payload.user.displayName || randomDisplayName());
      setProfileDraftName(payload.user.displayName || '');
      setProfileDraftAvatar(payload.user.avatar || '');
      setBusy(false);
      setScreen('title');
    } catch (err) {
      fail(err?.message || 'Authentication failed');
    }
  };

  const handleSignOut = async () => {
    const token = getAuthToken();
    try {
      if (token) await logout(token);
    } catch {
      // best effort
    }
    setAuthToken('');
    setCurrentUser(null);
    socket.clearCredentials();
    socket.close();
    setLobbyView(null);
    setSelfId('');
    setScreen('auth');
  };

  const handleSaveProfile = async () => {
    const token = getAuthToken();
    if (!token) return setScreen('auth');
    setBusy(true);
    setErrorMsg('');
    try {
      const updated = await updateProfile(token, {
        displayName: profileDraftName.trim(),
        avatar: profileDraftAvatar.trim() ? profileDraftAvatar.trim() : null,
      });
      setCurrentUser(updated.user);
      setDisplayName(updated.user.displayName || displayName);
      setBusy(false);
      setScreen('title');
    } catch (err) {
      fail(err?.message || 'Failed to update profile');
    }
  };

  const fail = (msg) => {
    console.error('Lobby:', msg);
    setErrorMsg(msg);
    setScreen('error');
    setBusy(false);
  };

  // ─── Create flow ──────────────────────────────────────────────

  const handleCreate = async () => {
    const name = displayName.trim();
    if (name.length < 2 || name.length > 24) {
      setErrorMsg('Display name must be 2–24 characters.');
      return;
    }
    setBusy(true);
    setErrorMsg('');

    try {
      // 1. Create the lobby over HTTP. Creator is auto-added as host.
      const resp = await fetch(`${API_BASE}/api/lobby/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name,
          accountId,
          settings: { minPlayers: 1 },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const { playerId, reconnectToken, wsUrl } = data;

      // 2. Connect the socket to the lobby-specific URL. Don't set credentials
      //    yet so the socket's onopen auto-rejoin stays quiet; we rejoin
      //    manually so we can await the result.
      socket.clearCredentials();
      socket.close();
      await waitForConnected(socket, wsUrl);

      // 3. Authenticate this WS as the player we created over HTTP.
      const rejoinResp = await socket.send('rejoinLobby', {
        playerId,
        reconnectToken,
      });
      const rotated =
        rejoinResp?.payload?.data?.reconnectToken ?? reconnectToken;
      socket.setCredentials(playerId, rotated);
      setSelfId(playerId);

      // 4. Seed the waiting-room view from the rejoin ack (it includes the
      //    fresh LobbyView). Subsequent changes arrive via lobbyState pushes.
      const lobby = rejoinResp?.payload?.data?.lobby;
      if (lobby) setLobbyView(lobby);

      setBusy(false);
      setScreen('room');
    } catch (err) {
      fail(err?.message || 'Failed to create lobby');
    }
  };

  // ─── Join flow ────────────────────────────────────────────────

  const handleJoin = async () => {
    const name = displayName.trim();
    const code = joinCode.trim().toUpperCase();
    if (name.length < 2 || name.length > 24) {
      setErrorMsg('Display name must be 2–24 characters.');
      return;
    }
    if (code.length < 4) {
      setErrorMsg('Enter a valid lobby code.');
      return;
    }
    setBusy(true);
    setErrorMsg('');

    try {
      const wsUrl = `${WS_URL}/api/lobby/${code}/ws`;

      socket.clearCredentials();
      socket.close();
      await waitForConnected(socket, wsUrl);

      const joinResp = await socket.send('joinLobby', { displayName: name, accountId });
      const ack = joinResp?.payload?.data;
      if (!ack?.playerId || !ack?.reconnectToken) {
        throw new Error('joinLobby did not return credentials');
      }
      socket.setCredentials(ack.playerId, ack.reconnectToken);
      setSelfId(ack.playerId);

      if (ack.lobby) setLobbyView(ack.lobby);

      setBusy(false);
      setScreen('room');
    } catch (err) {
      fail(err?.message || 'Failed to join lobby');
    }
  };

  // ─── Start game (host only) ──────────────────────────────────

  const handleStartGame = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      // Server broadcasts sessionState to all clients; App.jsx sees
      // phase !== null in the store and flips to OS automatically.
      await socket.send('startGame', {});
    } catch (err) {
      fail(err?.message || 'Failed to start game');
    }
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <Shell>
      {screen === 'title' && (
        <TitleScreen
          onCreate={() => setScreen('create')}
          onJoin={() => setScreen('join')}
          onLeaderboard={() => setScreen('leaderboard')}
          onProfile={() => setScreen('profile')}
          onSignOut={handleSignOut}
          user={currentUser}
        />
      )}

      {screen === 'auth' && (
        <AuthScreen
          mode={authMode}
          setMode={setAuthMode}
          email={authEmail}
          setEmail={setAuthEmail}
          password={authPassword}
          setPassword={setAuthPassword}
          displayName={displayName}
          setDisplayName={setDisplayName}
          onSubmit={handleAuthSubmit}
          busy={busy}
          errorMsg={errorMsg}
        />
      )}

      {screen === 'profile' && (
        <ProfileScreen
          user={currentUser}
          displayName={profileDraftName}
          setDisplayName={setProfileDraftName}
          avatar={profileDraftAvatar}
          setAvatar={setProfileDraftAvatar}
          onSave={handleSaveProfile}
          onBack={goTitle}
          busy={busy}
          errorMsg={errorMsg}
        />
      )}

      {screen === 'leaderboard' && (
        <LeaderboardScreen accountId={accountId} onBack={goTitle} />
      )}

      {screen === 'create' && (
        <CreateScreen
          displayName={displayName}
          setDisplayName={setDisplayName}
          onSubmit={handleCreate}
          onBack={goTitle}
          busy={busy}
          errorMsg={errorMsg}
        />
      )}

      {screen === 'join' && (
        <JoinScreen
          displayName={displayName}
          setDisplayName={setDisplayName}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          onSubmit={handleJoin}
          onBack={goTitle}
          busy={busy}
          errorMsg={errorMsg}
        />
      )}

      {screen === 'room' && (
        <RoomScreen
          lobbyView={lobbyView}
          selfId={selfId}
          onStart={handleStartGame}
          onLeave={goTitle}
          busy={busy}
          errorMsg={errorMsg}
        />
      )}

      {screen === 'error' && (
        <ErrorScreen message={errorMsg} onBack={goTitle} />
      )}
    </Shell>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────

function Shell({ children }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background:
          'linear-gradient(135deg, #0a246a 0%, #245edb 40%, #3c82f7 70%, #0a246a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Tahoma, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          minWidth: 320,
        }}
      >
        <Logo />
        {children}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          TattleTale OS &middot; v1.0
        </span>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3c82f7, #0a246a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          border: '2px solid rgba(255,255,255,0.2)',
        }}
      >
        <span style={{ fontSize: 34 }}>🖥️</span>
      </div>
      <h1
        style={{
          fontSize: 30,
          fontWeight: 'bold',
          color: '#fff',
          margin: 0,
          textShadow: '2px 2px 6px rgba(0,0,0,0.4)',
          letterSpacing: 1,
        }}
      >
        TattleTale
      </h1>
    </>
  );
}

function PrimaryButton({ children, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 36px',
        fontSize: 15,
        fontFamily: 'Tahoma, "Segoe UI", sans-serif',
        fontWeight: 'bold',
        color: '#fff',
        background: disabled
          ? 'linear-gradient(to bottom, #7a8a7a, #5a6a5a)'
          : hover
          ? 'linear-gradient(to bottom, #4caf50, #2e7d32)'
          : 'linear-gradient(to bottom, #3c9a41, #358b3a)',
        border: '1px solid #2e7d32',
        borderRadius: 4,
        cursor: disabled ? 'wait' : 'pointer',
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        transition: 'all 0.15s ease',
        minWidth: 180,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 18px',
        fontSize: 12,
        fontFamily: 'Tahoma, sans-serif',
        color: '#fff',
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function TextInput({ value, onChange, placeholder, maxLength }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        width: 220,
        padding: '7px 10px',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 13,
        border: '1px solid #7f9db9',
        borderRadius: 2,
      }}
    />
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div
      style={{
        maxWidth: 280,
        padding: '6px 10px',
        background: 'rgba(139, 0, 0, 0.75)',
        border: '1px solid #c44',
        borderRadius: 3,
        color: '#fff',
        fontSize: 12,
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}

function TitleScreen({ onCreate, onJoin, onLeaderboard, onProfile, onSignOut, user }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ color: '#fff', fontSize: 12 }}>
        Signed in as <strong>{user?.displayName || user?.email || 'Unknown'}</strong>
      </div>
      <PrimaryButton onClick={onCreate}>Create Game</PrimaryButton>
      <PrimaryButton onClick={onJoin}>Join Game</PrimaryButton>
      <SecondaryButton onClick={onLeaderboard}>Leaderboard</SecondaryButton>
      <SecondaryButton onClick={onProfile}>Profile</SecondaryButton>
      <SecondaryButton onClick={onSignOut}>Sign Out</SecondaryButton>
    </div>
  );
}

function AuthScreen({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  displayName,
  setDisplayName,
  onSubmit,
  busy,
  errorMsg,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
        {mode === 'register' ? 'Create Account' : 'Sign In'}
      </div>
      <TextInput value={email} onChange={setEmail} placeholder="Email" maxLength={200} />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (8+ chars)"
        maxLength={200}
        style={{
          width: 220,
          padding: '7px 10px',
          fontFamily: 'Tahoma, sans-serif',
          fontSize: 13,
          border: '1px solid #7f9db9',
          borderRadius: 2,
        }}
      />
      {mode === 'register' && (
        <TextInput
          value={displayName}
          onChange={setDisplayName}
          placeholder="Display name"
          maxLength={24}
        />
      )}
      <ErrorBanner message={errorMsg} />
      <PrimaryButton onClick={onSubmit} disabled={busy}>
        {busy ? 'Please wait…' : mode === 'register' ? 'Register' : 'Login'}
      </PrimaryButton>
      <SecondaryButton onClick={() => setMode(mode === 'register' ? 'login' : 'register')} disabled={busy}>
        {mode === 'register' ? 'Have an account? Sign In' : 'Need an account? Register'}
      </SecondaryButton>
    </div>
  );
}

function LeaderboardScreen({ accountId, onBack }) {
  return (
    <div
      style={{
        width: 520,
        maxWidth: '90vw',
        height: 450,
        background: 'rgba(255,255,255,0.92)',
        borderRadius: 6,
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      <LeaderboardPanel accountId={accountId} pageSize={15} compact />
      <div style={{ marginTop: 10, textAlign: 'center' }}>
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
      </div>
    </div>
  );
}

function ProfileScreen({
  user,
  displayName,
  setDisplayName,
  avatar,
  setAvatar,
  onSave,
  onBack,
  busy,
  errorMsg,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', width: 320 }}>
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Profile</div>
      <div style={{ color: '#fff', fontSize: 11 }}>{user?.email}</div>
      <TextInput value={displayName} onChange={setDisplayName} placeholder="Display name" maxLength={24} />
      <TextInput value={avatar} onChange={setAvatar} placeholder="Avatar URL (optional)" maxLength={2000} />
      <div style={{ color: '#fff', fontSize: 11 }}>
        Points: {user?.totalPoints ?? 0} | Games: {user?.gamesPlayed ?? 0} | W/L: {user?.wins ?? 0}/{user?.losses ?? 0}
      </div>
      <ErrorBanner message={errorMsg} />
      <PrimaryButton onClick={onSave} disabled={busy}>
        {busy ? 'Saving…' : 'Save Profile'}
      </PrimaryButton>
      <SecondaryButton onClick={onBack} disabled={busy}>Back</SecondaryButton>
    </div>
  );
}

function CreateScreen({ displayName, setDisplayName, onSubmit, onBack, busy, errorMsg }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <label style={{ color: '#fff', fontSize: 12 }}>Your display name</label>
      <TextInput
        value={displayName}
        onChange={setDisplayName}
        placeholder="Display name"
        maxLength={24}
      />
      <ErrorBanner message={errorMsg} />
      <PrimaryButton onClick={onSubmit} disabled={busy}>
        {busy ? 'Creating…' : 'Create Lobby'}
      </PrimaryButton>
      <SecondaryButton onClick={onBack} disabled={busy}>
        Back
      </SecondaryButton>
    </div>
  );
}

function JoinScreen({
  displayName,
  setDisplayName,
  joinCode,
  setJoinCode,
  onSubmit,
  onBack,
  busy,
  errorMsg,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <label style={{ color: '#fff', fontSize: 12 }}>Lobby code</label>
      <TextInput
        value={joinCode}
        onChange={(v) => setJoinCode(v.toUpperCase())}
        placeholder="e.g. ABC123"
        maxLength={8}
      />
      <label style={{ color: '#fff', fontSize: 12 }}>Your display name</label>
      <TextInput
        value={displayName}
        onChange={setDisplayName}
        placeholder="Display name"
        maxLength={24}
      />
      <ErrorBanner message={errorMsg} />
      <PrimaryButton onClick={onSubmit} disabled={busy}>
        {busy ? 'Joining…' : 'Join Lobby'}
      </PrimaryButton>
      <SecondaryButton onClick={onBack} disabled={busy}>
        Back
      </SecondaryButton>
    </div>
  );
}

const ROLE_INFO = [
  { id: 'EXTROVERT', name: 'Extrovert', team: 'Friends', desc: 'Creates temporary group chats' },
  { id: 'WHITE_HAT_HACKER', name: 'White Hat Hacker', team: 'Friends', desc: 'Investigates player roles' },
  { id: 'SECURITY_SPECIALIST', name: 'Security Specialist', team: 'Friends', desc: 'Protects a player from hacking' },
  { id: 'THE_BOSS', name: 'The Boss', team: 'Hackers', desc: 'Makes the final elimination call' },
  { id: 'SIGNAL_JAMMER', name: 'Signal Jammer', team: 'Hackers', desc: 'Jams private messages' },
  { id: 'EAVESDROPPER', name: 'Eavesdropper', team: 'Hackers', desc: 'Monitors private messages' },
  { id: 'TROLLER', name: 'Troller', team: 'Hackers', desc: 'Alters messages' },
  { id: 'IMITATOR', name: 'Imitator', team: 'Hackers', desc: 'Impersonates a player' },
];

function RoomScreen({ lobbyView, selfId, onStart, onLeave, busy, errorMsg }) {
  const socket = useSocket();
  const players = lobbyView?.players ?? [];
  const code = lobbyView?.code ?? '—';
  const settings = lobbyView?.settings;
  const self = players.find((p) => p.playerId === selfId);
  const isHost = !!self?.isHost;
  const [showSettings, setShowSettings] = useState(false);

  const enabledRoles = new Set(settings?.enabledRoles ?? []);

  const handleToggleRole = async (roleId) => {
    if (!isHost) return;
    const updated = enabledRoles.has(roleId)
      ? [...enabledRoles].filter((r) => r !== roleId)
      : [...enabledRoles, roleId];
    try {
      await socket.send('updateSettings', { settings: { enabledRoles: updated } });
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  const handleTimerChange = async (field, value) => {
    if (!isHost) return;
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) return;
    try {
      await socket.send('updateSettings', { settings: { [field]: num } });
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        alignItems: 'center',
        background: 'rgba(0,0,0,0.25)',
        padding: '16px 24px',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.18)',
        minWidth: 340,
        maxWidth: 440,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
          Lobby code
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 'bold',
            color: '#fff',
            letterSpacing: 6,
            fontFamily: 'Consolas, "Courier New", monospace',
          }}
        >
          {code}
        </div>
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
          Players ({players.length})
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {players.map((p) => (
            <li
              key={p.playerId}
              style={{
                color: '#fff',
                fontSize: 13,
                padding: '4px 8px',
                background:
                  p.playerId === selfId
                    ? 'rgba(60,154,65,0.25)'
                    : 'rgba(255,255,255,0.05)',
                borderRadius: 3,
                marginBottom: 2,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                {p.isHost && <span title="Host">👑 </span>}
                {p.displayName}
                {p.playerId === selfId && (
                  <span style={{ color: 'rgba(255,255,255,0.45)' }}> (you)</span>
                )}
              </span>
              {!p.connected && (
                <span style={{ color: '#f99', fontSize: 11 }}>disconnected</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Settings toggle */}
      <button
        onClick={() => setShowSettings((v) => !v)}
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: 12,
          fontFamily: 'Tahoma, sans-serif',
          color: '#fff',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 3,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Game Settings</span>
        <span style={{ fontSize: 10 }}>{showSettings ? '▲' : '▼'}</span>
      </button>

      {showSettings && (
        <div
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: 12,
          }}
        >
          {/* Timers */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontWeight: 'bold' }}>
              Timers
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1, fontSize: 11, color: '#ccc' }}>
                Day (sec)
                <input
                  type="number"
                  min={30}
                  max={600}
                  value={settings?.dayDurationSeconds ?? 180}
                  disabled={!isHost}
                  onChange={(e) => handleTimerChange('dayDurationSeconds', e.target.value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 2,
                    padding: '4px 6px',
                    fontSize: 12,
                    fontFamily: 'Tahoma, sans-serif',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 2,
                    background: isHost ? '#fff' : 'rgba(255,255,255,0.1)',
                    color: isHost ? '#333' : '#aaa',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 11, color: '#ccc' }}>
                Night (sec)
                <input
                  type="number"
                  min={15}
                  max={300}
                  value={settings?.nightDurationSeconds ?? 60}
                  disabled={!isHost}
                  onChange={(e) => handleTimerChange('nightDurationSeconds', e.target.value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 2,
                    padding: '4px 6px',
                    fontSize: 12,
                    fontFamily: 'Tahoma, sans-serif',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 2,
                    background: isHost ? '#fff' : 'rgba(255,255,255,0.1)',
                    color: isHost ? '#333' : '#aaa',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>
          </div>

          {/* Roles */}
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontWeight: 'bold' }}>
              Roles
            </div>

            {['Friends', 'Hackers'].map((team) => (
              <div key={team} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: team === 'Friends' ? '#66bb6a' : '#ef5350',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {team}
                </div>
                {ROLE_INFO.filter((r) => r.team === team).map((role) => {
                  const enabled = enabledRoles.has(role.id);
                  return (
                    <label
                      key={role.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '3px 4px',
                        fontSize: 11,
                        color: enabled ? '#fff' : 'rgba(255,255,255,0.4)',
                        cursor: isHost ? 'pointer' : 'default',
                        borderRadius: 2,
                        marginBottom: 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={!isHost}
                        onChange={() => handleToggleRole(role.id)}
                        style={{ margin: 0, cursor: isHost ? 'pointer' : 'default' }}
                      />
                      <span>
                        <strong>{role.name}</strong>
                        <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
                          — {role.desc}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <ErrorBanner message={errorMsg} />

      {isHost ? (
        <PrimaryButton onClick={onStart} disabled={busy || players.length < 1}>
          {busy ? 'Starting…' : 'Start Game'}
        </PrimaryButton>
      ) : (
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontStyle: 'italic' }}>
          Waiting for host to start…
        </div>
      )}
      <SecondaryButton onClick={onLeave} disabled={busy}>
        Leave lobby
      </SecondaryButton>
    </div>
  );
}

function ErrorScreen({ message, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <ErrorBanner message={message || 'Something went wrong.'} />
      <PrimaryButton onClick={onBack}>Back to title</PrimaryButton>
    </div>
  );
}
