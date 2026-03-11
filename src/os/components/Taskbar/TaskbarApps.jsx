import useWindowStore from '../../store/windowStore';
import { getAppConfig } from '../../config/apps.config';

export default function TaskbarApps() {
  const windows = useWindowStore((state) => state.windows);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const minimizeWindow = useWindowStore((state) => state.minimizeWindow);

  const windowList = Object.values(windows);

  const handleClick = (windowId) => {
    const win = windows[windowId];
    if (win.minimized) {
      focusWindow(windowId);
    } else if (activeWindowId === windowId) {
      minimizeWindow(windowId);
    } else {
      focusWindow(windowId);
    }
  };

  // Default icon for apps without one
  const defaultIcon = 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect x="2" y="1" width="12" height="14" fill="#f8f8f8" stroke="#888" stroke-width="1"/>
      <rect x="3" y="2" width="10" height="2" fill="#0058e6"/>
    </svg>
  `);

  return (
    <div className="xp-taskbar-apps">
      {windowList.map((win) => {
        const appConfig = getAppConfig(win.appId);
        const isActive = activeWindowId === win.id && !win.minimized;

        return (
          <button
            key={win.id}
            className={`xp-taskbar-app ${isActive ? 'active' : ''}`}
            onClick={() => handleClick(win.id)}
          >
            <img
              src={appConfig?.icon || win.icon || defaultIcon}
              alt=""
            />
            <span>{win.title}</span>
          </button>
        );
      })}
    </div>
  );
}
