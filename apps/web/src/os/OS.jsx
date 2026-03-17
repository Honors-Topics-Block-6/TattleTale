import { useEffect } from 'react';
import useWindowStore from './store/windowStore';
import useMenuStore from './store/menuStore';
import { getAppConfig } from './config/apps.config';
import Desktop from './components/Desktop/Desktop';
import Taskbar from './components/Taskbar/Taskbar';
import StartMenu from './components/StartMenu/StartMenu';
import ContextMenu from './components/ContextMenu/ContextMenu';
import Window from './components/Window/Window';
import PowerDialog from './components/PowerDialog/PowerDialog';

import '../themes/xp/index.css';

// Default XP wallpaper (bliss-like gradient)
const defaultWallpaper = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#4ca6ff"/>
        <stop offset="50%" style="stop-color:#87ceeb"/>
        <stop offset="100%" style="stop-color:#b8e0f7"/>
      </linearGradient>
      <linearGradient id="grass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#4caf50"/>
        <stop offset="100%" style="stop-color:#2e7d32"/>
      </linearGradient>
    </defs>
    <rect width="1920" height="540" fill="url(#sky)"/>
    <ellipse cx="960" cy="800" rx="1400" ry="500" fill="url(#grass)"/>
    <circle cx="200" cy="150" r="60" fill="#fff" opacity="0.8"/>
    <circle cx="160" cy="140" r="50" fill="#fff" opacity="0.8"/>
    <circle cx="240" cy="140" r="50" fill="#fff" opacity="0.8"/>
    <circle cx="1700" cy="200" r="70" fill="#fff" opacity="0.7"/>
    <circle cx="1650" cy="180" r="55" fill="#fff" opacity="0.7"/>
    <circle cx="1750" cy="190" r="55" fill="#fff" opacity="0.7"/>
  </svg>
`);

const osScreenStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 999999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Tahoma, sans-serif',
  },
  shuttingdown: {
    background: '#000',
    color: '#fff',
  },
  restarting: {
    background: '#000',
    color: '#fff',
  },
  standby: {
    background: '#000',
    cursor: 'pointer',
  },
  logoff: {
    background: 'linear-gradient(180deg, #1a3a8f 0%, #0a1a5f 100%)',
    color: '#fff',
  },
  welcome: {
    background: 'linear-gradient(180deg, #1a3a8f 0%, #0a1a5f 100%)',
    color: '#fff',
  },
};

function OsScreen({ screen, onDismissStandby, onDismissWelcome }) {
  if (screen === 'desktop') return null;

  if (screen === 'standby') {
    return (
      <div
        style={{ ...osScreenStyles.overlay, ...osScreenStyles.standby }}
        onClick={onDismissStandby}
        title="Click to wake"
      />
    );
  }

  if (screen === 'shuttingdown') {
    return (
      <div style={{ ...osScreenStyles.overlay, ...osScreenStyles.shuttingdown }}>
        <div style={{ marginBottom: '32px', fontSize: '28px' }}>💻</div>
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>Windows is shutting down...</div>
        <div style={{ fontSize: '11px', color: '#aaa' }}>Please wait</div>
      </div>
    );
  }

  if (screen === 'restarting') {
    return (
      <div style={{ ...osScreenStyles.overlay, ...osScreenStyles.restarting }}>
        <div style={{ marginBottom: '32px', fontSize: '28px' }}>🔄</div>
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>Windows is restarting...</div>
        <div style={{ fontSize: '11px', color: '#aaa' }}>Please wait</div>
      </div>
    );
  }

  if (screen === 'logoff') {
    return (
      <div style={{ ...osScreenStyles.overlay, ...osScreenStyles.logoff }}>
        <div style={{ marginBottom: '16px', fontSize: '48px' }}>👤</div>
        <div style={{ fontSize: '14px', marginBottom: '4px' }}>Saving your settings...</div>
        <div style={{ fontSize: '11px', color: '#aab' }}>Logging off User</div>
      </div>
    );
  }

  if (screen === 'welcome') {
    return (
      <div style={{ ...osScreenStyles.overlay, ...osScreenStyles.welcome }} onClick={onDismissWelcome}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '13px', letterSpacing: '2px', color: '#aac', marginBottom: '4px' }}>Microsoft</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', letterSpacing: '1px' }}>Windows</div>
          <div style={{ fontSize: '14px', color: '#7af', marginTop: '2px' }}>XP</div>
        </div>
        <div style={{ marginBottom: '32px', fontSize: '56px' }}>👤</div>
        <div style={{ fontSize: '14px', marginBottom: '6px' }}>User</div>
        <div style={{ fontSize: '11px', color: '#aab', marginTop: '24px' }}>Click to log on</div>
      </div>
    );
  }

  return null;
}

export default function OS({ wallpaper = defaultWallpaper }) {
  const windows = useWindowStore((state) => state.windows);
  const osScreen = useMenuStore((s) => s.osScreen);
  const setOsScreen = useMenuStore((s) => s.setOsScreen);

  const windowList = Object.values(windows);

  return (
    <div className="xp-os">
      <Desktop wallpaper={wallpaper} />

      {windowList.map((win) => {
        const appConfig = getAppConfig(win.appId);
        if (!appConfig) return null;

        return (
          <Window
            key={win.id}
            windowId={win.id}
            appConfig={appConfig}
          />
        );
      })}

      <Taskbar />
      <StartMenu />
      <ContextMenu />
      <PowerDialog />
      <OsScreen
        screen={osScreen}
        onDismissStandby={() => setOsScreen('desktop')}
        onDismissWelcome={() => setOsScreen('desktop')}
      />
    </div>
  );
}
