import { useMemo, useState } from 'react';
import useWindowStore from '../../os/store/windowStore';
import useInstallStore from '../../os/store/installStore';
import { sfxClick } from '../../os/utils/sfx';
import gameRegistry from '../../os/config/games.config';

function GameStoreComponent() {
  const createWindow = useWindowStore((state) => state.createWindow);
  const installedAppIds = useInstallStore((state) => state.installedAppIds);
  const isInstalled = useMemo(() => new Set(installedAppIds), [installedAppIds]);
  const [selectedId, setSelectedId] = useState(gameRegistry[0]?.id ?? null);

  const selected = gameRegistry.find((i) => i.id === selectedId) ?? gameRegistry[0];

  const handleBuy = (item) => {
    sfxClick();
    if (item.challengeFunction) item.challengeFunction(createWindow);
  };

  const handlePlay = (item) => {
    sfxClick();
    if (item.launchFunction) item.launchFunction(createWindow);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#ece9d8',
        padding: 10,
        display: 'flex',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 210,
          background: '#fff',
          border: '1px solid #aca899',
          boxShadow: 'inset 1px 1px 0 #fff, inset -1px -1px 0 #716f64',
          padding: 6,
        }}
      >
        <div style={{ marginBottom: 6, fontWeight: 'bold' }}>Available Games</div>

        {gameRegistry.map((item) => {
          const active = item.id === selectedId;
          const installed = isInstalled.has(item.app?.id);
          const icon = item.app?.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 6,
                marginBottom: 4,
                background: active ? '#316ac5' : '#fff',
                color: active ? '#fff' : '#000',
                border: '1px solid #aca899',
                cursor: 'pointer',
              }}
            >
              <img
                src={icon}
                alt=""
                style={{ width: 32, height: 32, imageRendering: 'pixelated' }}
              />
              <span style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>{item.name}</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>
                  {installed ? 'Installed' : 'Locked'}
                </div>
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          background: '#fff',
          border: '1px solid #aca899',
          boxShadow: 'inset 1px 1px 0 #fff, inset -1px -1px 0 #716f64',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={selected?.app?.icon}
            alt=""
            style={{ width: 48, height: 48, imageRendering: 'pixelated' }}
          />
          <div>
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>{selected?.name}</div>
            <div style={{ fontSize: 11, color: '#333' }}>{selected?.description}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#000' }}>
          <div style={{ marginBottom: 6, fontWeight: 'bold' }}>How it works</div>
          <div>
            There’s no money here—win a quick challenge to unlock the game and install it
            to your desktop.
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {selected && !isInstalled.has(selected.app?.id) ? (
            <button type="button" onClick={() => handleBuy(selected)} style={btnStyle}>
              Buy
            </button>
          ) : (
            <>
              {selected?.allowPlayFromStore !== false ? (
                <button type="button" onClick={() => handlePlay(selected)} style={btnStyle}>
                  Play
                </button>
              ) : null}
              <button type="button" disabled style={{ ...btnStyle, opacity: 0.7, cursor: 'default' }}>
                Installed
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  minWidth: 90,
  padding: '3px 12px',
  border: '1px solid #7f9db9',
  background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
  cursor: 'pointer',
  fontFamily: 'Tahoma, sans-serif',
  fontSize: 11,
};

const storeIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="4" y="9" width="24" height="19" rx="2" fill="#f3e2b3" stroke="#8b6f1b" stroke-width="1"/>
    <rect x="6" y="11" width="20" height="15" fill="#fff" opacity="0.6"/>
    <rect x="6" y="6" width="20" height="6" rx="1" fill="#d0d0d0" stroke="#888" stroke-width="1"/>
    <circle cx="11" cy="9" r="1" fill="#888"/>
    <circle cx="21" cy="9" r="1" fill="#888"/>
    <text x="16" y="23" text-anchor="middle" font-size="7" font-family="Tahoma" fill="#0a246a" font-weight="bold">STORE</text>
  </svg>
`);

const GameStore = {
  id: 'game-store',
  name: 'Game Store',
  icon: storeIcon,
  component: GameStoreComponent,
  defaultWindow: {
    width: 620,
    height: 380,
    resizable: true,
    minWidth: 520,
    minHeight: 320,
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Install mini-games by winning challenges',
  },
};

export default GameStore;

