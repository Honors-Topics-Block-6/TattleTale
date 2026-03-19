import { useRef, useState } from 'react';
import { SOCKET_EVENTS } from '@tattletale/shared';
import { lobbySocketRef } from '../../../lib/lobbySocketRef';
import useWindowStore from '../../store/windowStore';
import { getAppConfig } from '../../config/apps.config';

export default function DesktopIcon({ appId, name, icon }) {
  const [selected, setSelected] = useState(false);
  const createWindow = useWindowStore((state) => state.createWindow);
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const getAllWindows = useWindowStore((state) => state.getAllWindows);
  const readyClickTimerRef = useRef(null);

  const toggleReady = () => {
    const identityRaw = localStorage.getItem('tattletale-chat-identity');
    if (!identityRaw) return;
    let parsed = null;
    try {
      parsed = JSON.parse(identityRaw);
    } catch {
      return;
    }

    const lobbyCode = parsed?.sessionId;
    const username = parsed?.username;
    if (!lobbyCode || !username) return;

    const usernameKey = String(username).trim().toLowerCase();
    const readyKey = `tattletale-ready:${lobbyCode}:${usernameKey}`;
    const current = localStorage.getItem(readyKey) === 'true';
    const next = !current;

    localStorage.setItem(readyKey, next ? 'true' : 'false');

    const playerId = parsed?.playerId;
    const reconnectToken = parsed?.reconnectToken;
    const socket = lobbySocketRef.current;
    if (socket?.connected && playerId && reconnectToken) {
      socket.emit(SOCKET_EVENTS.client.setLobbyReady, {
        lobbyCode,
        playerId,
        reconnectToken,
        ready: next,
      });
    }

    // Notify the currently open lobby UI (same tab) to sync display.
    window.dispatchEvent(
      new CustomEvent('tattletale:ready-changed', {
        detail: { lobbyCode, usernameKey, value: next },
      }),
    );
  };

  const handleClick = (e) => {
    e.stopPropagation();

    if (appId === 'ready-toggle') {
      // If the user double-clicks, we don't want to toggle twice
      // (once per click). Delay the toggle briefly and cancel on double-click.
      if (readyClickTimerRef.current) clearTimeout(readyClickTimerRef.current);
      readyClickTimerRef.current = setTimeout(() => {
        readyClickTimerRef.current = null;
        toggleReady();
      }, 450);
      setSelected(true);
      return;
    }

    setSelected(true);
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();

    if (appId === 'ready-toggle') {
      if (readyClickTimerRef.current) {
        clearTimeout(readyClickTimerRef.current);
        readyClickTimerRef.current = null;
      }

      // Prevent opening multiple Ready Toggle windows.
      const existing = getAllWindows().find((w) => w.appId === appId);
      if (existing) {
        focusWindow(existing.id);
        return;
      }
    }

    const appConfig = getAppConfig(appId);
    if (appConfig) {
      createWindow(appId, appConfig);
    }
  };

  const handleBlur = () => {
    setSelected(false);
  };

  // Default icon if none provided
  const iconSrc = icon || 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="4" y="2" width="24" height="28" fill="#f8f8f8" stroke="#888" stroke-width="1"/>
      <rect x="6" y="4" width="20" height="3" fill="#0058e6"/>
      <rect x="6" y="9" width="16" height="1" fill="#ccc"/>
      <rect x="6" y="12" width="18" height="1" fill="#ccc"/>
      <rect x="6" y="15" width="12" height="1" fill="#ccc"/>
      <rect x="6" y="18" width="17" height="1" fill="#ccc"/>
    </svg>
  `);

  return (
    <div
      className={`xp-desktop-icon ${selected ? 'selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      tabIndex={0}
    >
      <img src={iconSrc} alt={name} draggable={false} />
      <span>{name}</span>
    </div>
  );
}
