import { useState } from 'react';

const btnBase = {
  width: '100%',
  padding: '10px 0',
  fontSize: 15,
  fontFamily: 'Tahoma, "Segoe UI", sans-serif',
  fontWeight: 'bold',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  transition: 'all 0.15s ease',
};

function LobbyButton({ label, bg, bgHover, shadow, shadowHover, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...btnBase,
        background: hovered ? bgHover : bg,
        boxShadow: hovered ? shadowHover : shadow,
      }}
    >
      {label}
    </button>
  );
}

function PlayerList({ players, isHost }) {
  return (
    <div style={{
      width: '100%',
      backgroundColor: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 12px',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        fontSize: 12,
        fontWeight: 'bold',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 0.5,
      }}>
        Players ({players.length})
      </div>
      {players.map((player, i) => (
        <div
          key={i}
          style={{
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: i < players.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
          }}
        >
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: player.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: '#fff',
            fontWeight: 'bold',
            flexShrink: 0,
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}>
            {player.name.charAt(0).toUpperCase()}
          </div>
          <span style={{ color: '#fff', fontSize: 14 }}>
            {player.name}
          </span>
          {player.isHost && (
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: '#ffd740',
              fontWeight: 'bold',
              backgroundColor: 'rgba(255,215,64,0.15)',
              padding: '2px 6px',
              borderRadius: 3,
            }}>
              HOST
            </span>
          )}
          {player.isYou && !player.isHost && (
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
            }}>
              (You)
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const AVATAR_COLORS = [
  'linear-gradient(135deg, #3c9a41, #2e7d32)',
  'linear-gradient(135deg, #f57c00, #e65100)',
  'linear-gradient(135deg, #e53935, #b71c1c)',
  'linear-gradient(135deg, #8e24aa, #6a1b9a)',
  'linear-gradient(135deg, #0288d1, #01579b)',
];

export default function Lobby({ onStart }) {
  const [view, setView] = useState('menu');
  const [gameCode, setGameCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState([]);

  const handleHost = () => {
    const code = generateCode();
    setGameCode(code);
    setPlayers([
      { name: 'You', isHost: true, isYou: true, color: AVATAR_COLORS[0] },
    ]);
    setView('host');
  };

  const handleJoinView = () => {
    setJoinCode('');
    setView('join');
  };

  const handleJoinSubmit = (e) => {
    e?.preventDefault?.();
    if (joinCode.trim().length === 0) return;
    setGameCode(joinCode.trim());
    setPlayers([
      { name: 'Host', isHost: true, isYou: false, color: AVATAR_COLORS[1] },
      { name: 'You', isHost: false, isYou: true, color: AVATAR_COLORS[0] },
    ]);
    setView('waiting');
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #0a246a 0%, #245edb 40%, #3c82f7 70%, #0a246a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Tahoma, "Segoe UI", sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        width: 300,
      }}>
        <div style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3c82f7, #0a246a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          border: '2px solid rgba(255,255,255,0.2)',
        }}>
          <span style={{ fontSize: 40 }}>🖥️</span>
        </div>

        <h1 style={{
          fontSize: 36,
          fontWeight: 'bold',
          color: '#fff',
          margin: 0,
          textShadow: '2px 2px 6px rgba(0,0,0,0.4)',
          letterSpacing: 1,
          textAlign: 'center',
        }}>
          TattleTale
        </h1>

        {/* Main menu */}
        {view === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: -8 }}>
            <LobbyButton
              label="Join Lobby"
              bg="linear-gradient(to bottom, #f57c00, #e65100)"
              bgHover="linear-gradient(to bottom, #ff9800, #f57c00)"
              shadow="0 2px 6px rgba(0,0,0,0.3)"
              shadowHover="0 2px 12px rgba(245,124,0,0.5)"
              onClick={handleJoinView}
            />
            <LobbyButton
              label="Host Private Lobby"
              bg="linear-gradient(to bottom, #0058e6, #0a246a)"
              bgHover="linear-gradient(to bottom, #3c82f7, #245edb)"
              shadow="0 2px 6px rgba(0,0,0,0.3)"
              shadowHover="0 2px 12px rgba(60,130,247,0.5)"
              onClick={handleHost}
            />
          </div>
        )}

        {/* Host lobby */}
        {view === 'host' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            width: '100%',
            marginTop: -8,
          }}>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: 0, textAlign: 'center' }}>
              Share this code with other players:
            </p>
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: 6,
              padding: '12px 24px',
              letterSpacing: 6,
              fontSize: 32,
              fontWeight: 'bold',
              color: '#fff',
              textAlign: 'center',
              fontFamily: 'Consolas, "Lucida Console", monospace',
              textShadow: '0 1px 4px rgba(0,0,0,0.3)',
              userSelect: 'all',
            }}>
              {gameCode}
            </div>
            <PlayerList players={players} isHost />
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <LobbyButton
                label="Start"
                bg="linear-gradient(to bottom, #3c9a41, #358b3a)"
                bgHover="linear-gradient(to bottom, #4caf50, #2e7d32)"
                shadow="0 2px 6px rgba(0,0,0,0.3)"
                shadowHover="0 2px 12px rgba(60,154,65,0.5)"
                onClick={onStart}
              />
              <LobbyButton
                label="Back"
                bg="linear-gradient(to bottom, #666, #444)"
                bgHover="linear-gradient(to bottom, #888, #555)"
                shadow="0 2px 6px rgba(0,0,0,0.3)"
                shadowHover="0 2px 8px rgba(0,0,0,0.4)"
                onClick={() => setView('menu')}
              />
            </div>
          </div>
        )}

        {/* Enter join code */}
        {view === 'join' && (
          <form
            onSubmit={handleJoinSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              width: '100%',
              marginTop: -8,
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: 0, textAlign: 'center' }}>
              Enter the game code:
            </p>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder="XXXXXX"
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 28,
                fontFamily: 'Consolas, "Lucida Console", monospace',
                fontWeight: 'bold',
                textAlign: 'center',
                letterSpacing: 6,
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: 6,
                backgroundColor: 'rgba(255,255,255,0.12)',
                color: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <LobbyButton
                label="Join"
                bg="linear-gradient(to bottom, #f57c00, #e65100)"
                bgHover="linear-gradient(to bottom, #ff9800, #f57c00)"
                shadow="0 2px 6px rgba(0,0,0,0.3)"
                shadowHover="0 2px 12px rgba(245,124,0,0.5)"
                onClick={() => handleJoinSubmit()}
              />
              <LobbyButton
                label="Back"
                bg="linear-gradient(to bottom, #666, #444)"
                bgHover="linear-gradient(to bottom, #888, #555)"
                shadow="0 2px 6px rgba(0,0,0,0.3)"
                shadowHover="0 2px 8px rgba(0,0,0,0.4)"
                onClick={() => setView('menu')}
              />
            </div>
          </form>
        )}

        {/* Waiting in lobby after joining */}
        {view === 'waiting' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            width: '100%',
            marginTop: -8,
          }}>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: 0, textAlign: 'center' }}>
              Lobby: <span style={{ fontFamily: 'Consolas, monospace', letterSpacing: 3 }}>{gameCode}</span>
            </p>
            <PlayerList players={players} />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>
              Waiting for host to start the game...
            </p>
            <LobbyButton
              label="Leave Lobby"
              bg="linear-gradient(to bottom, #666, #444)"
              bgHover="linear-gradient(to bottom, #888, #555)"
              shadow="0 2px 6px rgba(0,0,0,0.3)"
              shadowHover="0 2px 8px rgba(0,0,0,0.4)"
              onClick={() => setView('menu')}
            />
          </div>
        )}

        <span style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.35)',
          marginTop: 12,
        }}>
          TattleTale OS &middot; v1.0
        </span>
      </div>
    </div>
  );
}
