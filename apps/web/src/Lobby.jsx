import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';
const SOCKET_NAMESPACE = '/session';

const BG = 'linear-gradient(135deg, #0a246a 0%, #245edb 40%, #3c82f7 70%, #0a246a 100%)';
const FONT = 'Tahoma, "Segoe UI", sans-serif';

const PANEL = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8,
  padding: '28px 32px',
  backdropFilter: 'blur(6px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  width: 380,
  boxSizing: 'border-box',
};

function Btn({ children, onClick, disabled, variant = 'primary', style = {} }) {
  const [hov, setHov] = useState(false);
  const base =
    variant === 'primary'
      ? { bg: '#3c9a41', bgH: '#4caf50', border: '#2e7d32' }
      : variant === 'danger'
      ? { bg: '#b71c1c', bgH: '#d32f2f', border: '#7f0000' }
      : { bg: 'rgba(255,255,255,0.12)', bgH: 'rgba(255,255,255,0.2)', border: 'rgba(255,255,255,0.25)' };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '9px 20px',
        fontSize: 14,
        fontFamily: FONT,
        fontWeight: 'bold',
        color: '#fff',
        background: hov && !disabled
          ? `linear-gradient(to bottom, ${base.bgH}, ${base.bg})`
          : `linear-gradient(to bottom, ${base.bg}, ${base.bg})`,
        border: `1px solid ${base.border}`,
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        transition: 'all 0.12s ease',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder, onKeyDown, maxLength, style = {} }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      maxLength={maxLength}
      style={{
        width: '100%',
        padding: '9px 12px',
        fontSize: 15,
        fontFamily: FONT,
        color: '#fff',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 4,
        outline: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

function Label({ children }) {
  return (
    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: FONT, fontWeight: 'bold', letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {children}
    </span>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{
      background: 'rgba(183,28,28,0.55)',
      border: '1px solid rgba(239,83,80,0.6)',
      borderRadius: 4,
      padding: '8px 12px',
      fontSize: 13,
      color: '#ffcdd2',
      fontFamily: FONT,
      marginTop: 8,
    }}>
      {message}
    </div>
  );
}

function Logo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 20 }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        background: 'linear-gradient(135deg, #3c82f7, #0a246a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        border: '2px solid rgba(255,255,255,0.2)',
        margin: '0 auto 10px',
      }}>
        <span style={{ fontSize: 28 }}>🖥️</span>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 'bold', color: '#fff', margin: 0, textShadow: '2px 2px 6px rgba(0,0,0,0.4)', letterSpacing: 1, fontFamily: FONT }}>
        TattleTale
      </h1>
    </div>
  );
}

export default function Lobby({ onStart }) {
  const [view, setView] = useState('entry');
  const [displayName, setDisplayName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [codeChars, setCodeChars] = useState(['', '', '', '', '', '']);
  const [lobby, setLobby] = useState(null);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [myReconnectToken, setMyReconnectToken] = useState(null);
  const [publicLobbies, setPublicLobbies] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const socketRef = useRef(null);
  const codeInputRefs = useRef([]);

  const clearError = () => setError(null);

  function emitWithTimeout(socket, event, payload, cb, onTimeout, timeoutMs = 8000) {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      if (onTimeout) {
        onTimeout();
      } else {
        setLoading(false);
        setError('Request timed out. Is the server running?');
      }
    }, timeoutMs);

    socket.emit(event, payload, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cb(res);
    });
  }

  const getSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const s = io(SERVER_URL + SOCKET_NAMESPACE, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 8000,
    });

    s.on('lobby:state', (lobbyView) => {
      setLobby(lobbyView);
      if (lobbyView.status === 'IN_GAME') {
        onStart({ socket: s, lobby: lobbyView });
      }
    });

    s.on('command:error', (err) => {
      setError(err.message ?? 'Something went wrong.');
      setLoading(false);
    });

    s.on('connect_error', () => {
      setError('Cannot reach the server. Make sure the server is running.');
      setLoading(false);
      socketRef.current = null;
      s.disconnect();
    });

    s.on('disconnect', () => {
      setLoading(false);
    });

    socketRef.current = s;
    return s;
  }, [onStart]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // ── Entry view ──────────────────────────────────────────────────────────────

  function handleContinue() {
    const name = displayName.trim();
    if (name.length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (name.length > 24) { setError('Name must be 24 characters or fewer.'); return; }
    clearError();
    getSocket();
    setView('menu');
  }

  // ── Create view ─────────────────────────────────────────────────────────────

  function handleCreate() {
    clearError();
    setLoading(true);
    const socket = getSocket();
    emitWithTimeout(socket, 'lobby:create', { displayName: displayName.trim(), isPublic }, (res) => {
      setLoading(false);
      if (res.ok) {
        setLobby(res.data.lobby);
        setMyPlayerId(res.data.playerId);
        setMyReconnectToken(res.data.reconnectToken);
        setView('waiting');
      } else {
        setError(res.error?.message ?? 'Failed to create lobby.');
      }
    });
  }

  // ── Join by code ─────────────────────────────────────────────────────────────

  function handleJoinByCode() {
    const code = codeChars.join('').trim().toUpperCase();
    if (code.length < 6) { setError('Please enter the full 6-character code.'); return; }
    clearError();
    setLoading(true);
    const socket = getSocket();
    emitWithTimeout(socket, 'lobby:join', { lobbyCode: code, displayName: displayName.trim() }, (res) => {
      setLoading(false);
      if (res.ok) {
        setLobby(res.data.lobby);
        setMyPlayerId(res.data.playerId);
        setMyReconnectToken(res.data.reconnectToken);
        setView('waiting');
      } else {
        setError(res.error?.message ?? 'Failed to join lobby.');
      }
    });
  }

  // ── Browse public lobbies ────────────────────────────────────────────────────

  function loadPublicLobbies() {
    setBrowsing(true);
    const socket = getSocket();
    emitWithTimeout(socket, 'lobby:list-public', {}, (res) => {
      setBrowsing(false);
      if (res.ok) {
        setPublicLobbies(res.data.lobbies);
      } else {
        setError(res.error?.message ?? 'Failed to load public lobbies.');
      }
    }, () => {
      setBrowsing(false);
      setError('Request timed out. Is the server running?');
    });
  }

  function handleBrowse() {
    clearError();
    setPublicLobbies([]);
    setView('browse');
    loadPublicLobbies();
  }

  function handleJoinPublic(code) {
    clearError();
    setLoading(true);
    const socket = getSocket();
    emitWithTimeout(socket, 'lobby:join', { lobbyCode: code, displayName: displayName.trim() }, (res) => {
      setLoading(false);
      if (res.ok) {
        setLobby(res.data.lobby);
        setMyPlayerId(res.data.playerId);
        setMyReconnectToken(res.data.reconnectToken);
        setView('waiting');
      } else {
        setError(res.error?.message ?? 'Failed to join lobby.');
      }
    });
  }

  // ── Start game ───────────────────────────────────────────────────────────────

  function handleStartGame() {
    if (!lobby || !myPlayerId || !myReconnectToken) return;
    clearError();
    setLoading(true);
    const socket = getSocket();
    emitWithTimeout(socket, 'game:start', { lobbyCode: lobby.code, actorPlayerId: myPlayerId, reconnectToken: myReconnectToken }, (res) => {
      setLoading(false);
      if (!res.ok) {
        setError(res.error?.message ?? 'Failed to start game.');
      }
    });
  }

  // ── Leave lobby ──────────────────────────────────────────────────────────────

  function handleLeave() {
    if (!lobby || !myPlayerId || !myReconnectToken) { setView('menu'); return; }
    clearError();
    const socket = getSocket();
    socket.emit('lobby:leave', { lobbyCode: lobby.code, playerId: myPlayerId, reconnectToken: myReconnectToken }, () => {
      setLobby(null);
      setMyPlayerId(null);
      setMyReconnectToken(null);
      setView('menu');
    });
  }

  // ── Copy code ────────────────────────────────────────────────────────────────

  function handleCopyCode() {
    if (!lobby) return;
    navigator.clipboard.writeText(lobby.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Code input boxes ─────────────────────────────────────────────────────────

  function handleCodeChar(idx, val) {
    const ch = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-1);
    const next = [...codeChars];
    next[idx] = ch;
    setCodeChars(next);
    if (ch && idx < 5) codeInputRefs.current[idx + 1]?.focus();
  }

  function handleCodeKeyDown(idx, e) {
    if (e.key === 'Backspace' && !codeChars[idx] && idx > 0) {
      codeInputRefs.current[idx - 1]?.focus();
    }
    if (e.key === 'Enter') handleJoinByCode();
  }

  function handleCodePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setCodeChars(next);
    const focusIdx = Math.min(text.length, 5);
    codeInputRefs.current[focusIdx]?.focus();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const wrapStyle = {
    width: '100%', height: '100%',
    background: BG,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: FONT,
  };

  if (view === 'entry') {
    return (
      <div style={wrapStyle}>
        <div style={PANEL}>
          <Logo />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Your Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); clearError(); }}
              placeholder="e.g. Detective Fox"
              maxLength={24}
              onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
            />
            <ErrorBanner message={error} />
            <Btn onClick={handleContinue} style={{ marginTop: 8, width: '100%' }}>
              Continue →
            </Btn>
          </div>
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            TattleTale OS · v1.0
          </div>
        </div>
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div style={wrapStyle}>
        <div style={PANEL}>
          <Logo />
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.75)', margin: '0 0 20px', fontSize: 14 }}>
            Welcome, <strong style={{ color: '#fff' }}>{displayName}</strong>!
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MenuButton icon="🎮" label="Create Game" sub="Host a new lobby" onClick={() => { clearError(); setView('create'); }} />
            <MenuButton icon="🔑" label="Join by Code" sub="Enter a 6-character code" onClick={() => { clearError(); setCodeChars(['', '', '', '', '', '']); setView('joinCode'); }} />
            <MenuButton icon="🌐" label="Browse Public Games" sub="See open lobbies" onClick={handleBrowse} />
          </div>
          <ErrorBanner message={error} />
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div style={wrapStyle}>
        <div style={PANEL}>
          <SectionHeader onBack={() => { clearError(); setView('menu'); }}>Create New Game</SectionHeader>

          <div style={{ marginTop: 16 }}>
            <Label>Visibility</Label>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <ToggleBtn active={isPublic} onClick={() => setIsPublic(true)}>
                🌐 Public
              </ToggleBtn>
              <ToggleBtn active={!isPublic} onClick={() => setIsPublic(false)}>
                🔒 Private
              </ToggleBtn>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '10px 0 0', fontFamily: FONT }}>
              {isPublic
                ? 'Anyone can find and join this lobby in the public browser.'
                : 'Only players with the code can join this lobby.'}
            </p>
          </div>

          <ErrorBanner message={error} />

          <Btn onClick={handleCreate} disabled={loading} style={{ marginTop: 20, width: '100%' }}>
            {loading ? 'Creating…' : 'Create Lobby'}
          </Btn>
        </div>
      </div>
    );
  }

  if (view === 'joinCode') {
    return (
      <div style={wrapStyle}>
        <div style={PANEL}>
          <SectionHeader onBack={() => { clearError(); setView('menu'); }}>Enter Game Code</SectionHeader>

          <div style={{ marginTop: 20 }}>
            <Label>6-Character Code</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
              {codeChars.map((ch, idx) => (
                <input
                  key={idx}
                  ref={(el) => (codeInputRefs.current[idx] = el)}
                  value={ch}
                  maxLength={1}
                  onChange={(e) => handleCodeChar(idx, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                  onPaste={idx === 0 ? handleCodePaste : undefined}
                  style={{
                    width: 42, height: 50,
                    textAlign: 'center',
                    fontSize: 22, fontWeight: 'bold',
                    fontFamily: 'monospace',
                    color: '#fff',
                    background: ch ? 'rgba(60,130,247,0.35)' : 'rgba(0,0,0,0.3)',
                    border: `1px solid ${ch ? 'rgba(120,180,255,0.6)' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: 6,
                    outline: 'none',
                    transition: 'all 0.12s',
                    caretColor: 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          <ErrorBanner message={error} />

          <Btn
            onClick={handleJoinByCode}
            disabled={loading || codeChars.join('').length < 6}
            style={{ marginTop: 20, width: '100%' }}
          >
            {loading ? 'Joining…' : 'Join Lobby'}
          </Btn>
        </div>
      </div>
    );
  }

  if (view === 'browse') {
    return (
      <div style={wrapStyle}>
        <div style={{ ...PANEL, width: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionHeader onBack={() => { clearError(); setView('menu'); }} inline>
              Public Lobbies
            </SectionHeader>
            <button
              onClick={loadPublicLobbies}
              disabled={browsing}
              title="Refresh"
              style={{
                background: 'none', border: 'none', cursor: browsing ? 'default' : 'pointer',
                fontSize: 18, color: browsing ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
                padding: 4,
              }}
            >
              {browsing ? '⏳' : '↻'}
            </button>
          </div>

          <ErrorBanner message={error} />

          {browsing && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: FONT }}>
              Loading…
            </p>
          )}

          {!browsing && publicLobbies.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '24px 0',
              color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: FONT,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏜️</div>
              No public lobbies right now.
              <br />Be the first to create one!
            </div>
          )}

          {publicLobbies.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {publicLobbies.map((item) => (
                <PublicLobbyRow
                  key={item.code}
                  item={item}
                  onJoin={() => handleJoinPublic(item.code)}
                  loading={loading}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'waiting') {
    if (!lobby) return null;

    const amHost = lobby.hostPlayerId === myPlayerId;
    const alivePlayers = lobby.players.filter((p) => p.alive);
    const minPlayers = lobby.settings?.minPlayers ?? 7;
    const canStart = amHost && alivePlayers.length >= minPlayers;

    return (
      <div style={wrapStyle}>
        <div style={{ ...PANEL, width: 420 }}>
          {/* Code display */}
          <div style={{
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Game Code
              </div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', fontFamily: 'monospace', letterSpacing: 6, marginTop: 2 }}>
                {lobby.code}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <button
                onClick={handleCopyCode}
                style={{
                  background: copied ? 'rgba(76,175,80,0.4)' : 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4, padding: '4px 10px',
                  color: '#fff', fontSize: 12, fontFamily: FONT,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <span style={{
                fontSize: 11, fontFamily: FONT,
                color: lobby.isPublic ? 'rgba(100,200,255,0.8)' : 'rgba(255,255,255,0.4)',
              }}>
                {lobby.isPublic ? '🌐 Public' : '🔒 Private'}
              </span>
            </div>
          </div>

          {/* Player list */}
          <div style={{ marginBottom: 14 }}>
            <Label>Players — {alivePlayers.length} / {lobby.settings?.maxPlayers ?? 20}</Label>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {alivePlayers.map((p) => (
                <PlayerRow
                  key={p.playerId}
                  player={p}
                  isMe={p.playerId === myPlayerId}
                />
              ))}
            </div>
          </div>

          {/* Status message */}
          {alivePlayers.length < minPlayers && (
            <p style={{ fontSize: 12, color: 'rgba(255,220,100,0.85)', fontFamily: FONT, margin: '0 0 12px', textAlign: 'center' }}>
              Need {minPlayers - alivePlayers.length} more player{minPlayers - alivePlayers.length !== 1 ? 's' : ''} to start
            </p>
          )}
          {!amHost && alivePlayers.length >= minPlayers && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: FONT, margin: '0 0 12px', textAlign: 'center' }}>
              Waiting for host to start…
            </p>
          )}

          <ErrorBanner message={error} />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {amHost && (
              <Btn onClick={handleStartGame} disabled={!canStart || loading} style={{ flex: 1 }}>
                {loading ? 'Starting…' : '▶ Start Game'}
              </Btn>
            )}
            <Btn variant="danger" onClick={handleLeave} style={{ flex: amHost ? 0 : 1 }}>
              Leave
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MenuButton({ icon, label, sub, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: hov ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6, padding: '12px 16px',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.12s',
        width: '100%',
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 'bold', color: '#fff', fontFamily: FONT }}>{label}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: FONT, marginTop: 2 }}>{sub}</div>
      </div>
    </button>
  );
}

function SectionHeader({ children, onBack, inline = false }) {
  if (inline) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackBtn onClick={onBack} />
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 'bold', color: '#fff', fontFamily: FONT }}>{children}</h2>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
      <BackBtn onClick={onBack} />
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 'bold', color: '#fff', fontFamily: FONT }}>{children}</h2>
    </div>
  );
}

function BackBtn({ onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Back"
      style={{
        background: hov ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 4, padding: '4px 10px',
        color: '#fff', fontSize: 14, fontFamily: FONT,
        cursor: 'pointer', transition: 'all 0.12s',
        flexShrink: 0,
      }}
    >
      ← Back
    </button>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 0',
        fontSize: 14, fontFamily: FONT, fontWeight: 'bold',
        color: '#fff',
        background: active ? 'rgba(60,130,247,0.45)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${active ? 'rgba(120,180,255,0.7)' : 'rgba(255,255,255,0.18)'}`,
        borderRadius: 5, cursor: 'pointer',
        transition: 'all 0.12s',
        boxShadow: active ? '0 0 12px rgba(60,130,247,0.35)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

function PlayerRow({ player, isMe }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: isMe ? 'rgba(60,130,247,0.18)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${isMe ? 'rgba(120,180,255,0.35)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 5, padding: '7px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, opacity: player.connected ? 1 : 0.4 }}>
          {player.isHost ? '👑' : '👤'}
        </span>
        <span style={{
          fontSize: 14, color: player.connected ? '#fff' : 'rgba(255,255,255,0.45)',
          fontFamily: FONT, fontWeight: isMe ? 'bold' : 'normal',
        }}>
          {player.displayName}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isMe && <span style={{ fontSize: 11, color: 'rgba(100,200,255,0.8)', fontFamily: FONT }}>(you)</span>}
        {player.isHost && <span style={{ fontSize: 11, color: 'rgba(255,220,50,0.8)', fontFamily: FONT }}>HOST</span>}
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: player.connected ? '#4caf50' : '#666',
          display: 'inline-block',
        }} />
      </div>
    </div>
  );
}

function PublicLobbyRow({ item, onJoin, loading }) {
  const [hov, setHov] = useState(false);
  const pct = item.playerCount / item.maxPlayers;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6, padding: '10px 14px',
        transition: 'all 0.12s',
      }}
    >
      <div>
        <div style={{ fontSize: 14, color: '#fff', fontFamily: FONT, fontWeight: 'bold' }}>
          {item.hostDisplayName}'s Lobby
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
          <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
            <div style={{
              width: `${pct * 100}%`, height: '100%',
              background: pct > 0.8 ? '#f44336' : pct > 0.5 ? '#ff9800' : '#4caf50',
              borderRadius: 2, transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: FONT }}>
            {item.playerCount}/{item.maxPlayers}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', letterSpacing: 1 }}>
            {item.code}
          </span>
        </div>
      </div>
      <Btn onClick={onJoin} disabled={loading} style={{ fontSize: 13, padding: '6px 14px' }}>
        Join
      </Btn>
    </div>
  );
}
