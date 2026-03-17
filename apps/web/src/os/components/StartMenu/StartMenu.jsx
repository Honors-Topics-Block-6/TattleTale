import { useEffect, useRef } from 'react';
import useMenuStore from '../../store/menuStore';
import StartMenuItem from './StartMenuItem';
import { getStartMenuApps } from '../../config/apps.config';


export default function StartMenu() {
  const startMenuOpen = useMenuStore((state) => state.startMenuOpen);
  const closeStartMenu = useMenuStore((state) => state.closeStartMenu);
  const openPowerDialog = useMenuStore((state) => state.openPowerDialog);
  const menuRef = useRef(null);

  const { programs, places } = getStartMenuApps();

  // User avatar placeholder
  const userAvatar = 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <rect width="48" height="48" fill="#4b7fc2"/>
      <circle cx="24" cy="18" r="10" fill="#fff"/>
      <ellipse cx="24" cy="42" rx="16" ry="12" fill="#fff"/>
    </svg>
  `);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        // Check if click was on start button
        if (!e.target.closest('.xp-start-button')) {
          closeStartMenu();
        }
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeStartMenu();
      }
    };

    if (startMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [startMenuOpen, closeStartMenu]);

  if (!startMenuOpen) return null;

  return (
    <div className="xp-startmenu" ref={menuRef}>
      <div className="xp-startmenu-header">
        <img src={userAvatar} alt="User" />
        <span>User</span>
      </div>

      <div className="xp-startmenu-content">
        <div className="xp-startmenu-left">
          {programs.map((app) => (
            <StartMenuItem
              key={app.id}
              appId={app.id}
              name={app.name}
              icon={app.icon}
              description={app.description}
            />
          ))}
          <div className="xp-startmenu-separator" />
          <div
            className="xp-startmenu-item"
            style={{ opacity: 0.7 }}
          >
            <span className="xp-startmenu-item-text">
              <span className="xp-startmenu-item-name">All Programs</span>
            </span>
            <span style={{ marginLeft: 'auto' }}>▶</span>
          </div>
        </div>

        <div className="xp-startmenu-right">
          {places.map((place, index) => (
            <div key={place.id || index} className="xp-startmenu-item">
              {place.icon && <img src={place.icon} alt="" />}
              <span className="xp-startmenu-item-text">
                <span className="xp-startmenu-item-name">{place.name}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="xp-startmenu-footer">
        <button onClick={() => openPowerDialog('logoff')}>
          <span>Log Off</span>
        </button>
        <button onClick={() => openPowerDialog('shutdown')}>
          <span>Shut Down</span>
        </button>
      </div>
    </div>
  );
}
