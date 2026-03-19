import { useState } from 'react';
import PacmanMiniGame from '../PacmanMiniGame/PacmanMiniGame';

export default function HomeSidebar() {
  const [isPacmanOpen, setIsPacmanOpen] = useState(false);

  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: 6,
          top: 175,
          bottom: 'auto',
          width: 34,
          zIndex: 8500,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            height: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            aria-label="Open Pac-Man mini-game"
            onClick={() => setIsPacmanOpen((v) => !v)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: '1px solid #0c59cb',
              cursor: 'pointer',
              background:
                'linear-gradient(180deg, #5c9cf4 0%, #3c7eeb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Pac-Man body (right-facing) with mouth cut-out */}
              <path
                d="M12 4a8 8 0 1 1-7.2 4.6H20A8 8 0 0 0 12 4Z"
                fill="#FFD34D"
                opacity="0.98"
              />
              <path
                d="M4.8 8.6C4.2 10.0 4.0 11.4 4.2 12.8L11.7 12.0L12.0 4.5C10.2 4.6 8.4 5.2 6.9 6.2"
                fill="#000814"
              />
              {/* mouth wedge highlight */}
              <path
                d="M12.0 12.0L16.8 8.4"
                stroke="#000814"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#fff',
              textShadow: '1px 1px 1px rgba(0,0,0,0.45)',
              lineHeight: 1.1,
              width: 34,
              textAlign: 'center',
              marginTop: 2,
            }}
          >
            Pacman
          </div>
        </div>
      </div>

      {isPacmanOpen && (
        <PacmanMiniGame
          open={isPacmanOpen}
          onClose={() => setIsPacmanOpen(false)}
          position="left"
        />
      )}
    </>
  );
}

