import { useEffect, useMemo, useRef, useState } from 'react';
import useMenuStore from '../../store/menuStore';
import StartMenuItem from './StartMenuItem';
import { getStartMenuApps } from '../../config/apps.config';
import useInstallStore from '../../store/installStore';
import { fetchAccount } from '../../../lib/account-api';

export default function StartMenu() {
  const [account, setAccount] = useState(null);
  const startMenuOpen = useMenuStore((state) => state.startMenuOpen);
  const closeStartMenu = useMenuStore((state) => state.closeStartMenu);
  const menuRef = useRef(null);

  const installedAppIds = useInstallStore((state) => state.installedAppIds);
  const { programs, places } = getStartMenuApps();
  const visiblePrograms = useMemo(() => {
    return programs.filter((app) => {
      if (app.install?.requiresUnlock) {
        return installedAppIds.includes(app.id);
      }
      return true;
    });
  }, [programs, installedAppIds]);

  const userAvatar = 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <rect width="48" height="48" fill="#4b7fc2"/>
      <text x="24" y="31" text-anchor="middle" font-size="24">${account?.avatar || '🙂'}</text>
    </svg>
  `);

  useEffect(() => {
    if (!startMenuOpen) return;
    fetchAccount()
      .then((data) => setAccount(data.user))
      .catch(() => setAccount(null));
  }, [startMenuOpen]);

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
        <span>{account?.displayName || 'User'} ({account?.totalPoints ?? 0} pts)</span>
      </div>

      <div className="xp-startmenu-content">
        <div className="xp-startmenu-left">
          {visiblePrograms.map((app) => (
            <StartMenuItem
              key={app.id}
              appId={app.id}
              name={app.name}
              icon={app.icon}
              description={app.startMenu?.description}
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
        <button>
          <span>Log Off</span>
        </button>
        <button>
          <span>Shut Down</span>
        </button>
      </div>
    </div>
  );
}
