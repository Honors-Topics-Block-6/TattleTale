import { useState } from 'react';
import useWindowStore from '../../store/windowStore';
import { getAppConfig } from '../../config/apps.config';

export default function DesktopIcon({ appId, name, icon }) {
  const [selected, setSelected] = useState(false);
  const createWindow = useWindowStore((state) => state.createWindow);

  const handleClick = (e) => {
    e.stopPropagation();
    setSelected(true);
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
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
