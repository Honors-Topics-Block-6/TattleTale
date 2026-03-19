import { useState } from 'react';

export default function Lobby({ onStart }) {
  const [hovered, setHovered] = useState(false);

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

        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: 36,
            fontWeight: 'bold',
            color: '#fff',
            margin: '0 0 10px',
            textShadow: '2px 2px 6px rgba(0,0,0,0.4)',
            letterSpacing: 1,
          }}>
            TattleTale
          </h1>
        </div>

        <button
          onClick={onStart}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            marginTop: -14,
            padding: '10px 48px',
            fontSize: 16,
            fontFamily: 'Tahoma, "Segoe UI", sans-serif',
            fontWeight: 'bold',
            color: '#fff',
            background: hovered
              ? 'linear-gradient(to bottom, #4caf50, #2e7d32)'
              : 'linear-gradient(to bottom, #3c9a41, #358b3a)',
            border: '1px solid #2e7d32',
            borderRadius: 4,
            cursor: 'pointer',
            boxShadow: hovered
              ? '0 2px 12px rgba(60,154,65,0.5)'
              : '0 2px 6px rgba(0,0,0,0.3)',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            transition: 'all 0.15s ease',
          }}
        >
          Start Game
        </button>

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
