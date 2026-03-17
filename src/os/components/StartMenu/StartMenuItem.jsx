import useWindowStore from '../../store/windowStore';
import useMenuStore from '../../store/menuStore';
import { getAppConfig } from '../../config/apps.config';

export default function StartMenuItem({ appId, name, icon, description }) {
  const createWindow = useWindowStore((state) => state.createWindow);
  const closeStartMenu = useMenuStore((state) => state.closeStartMenu);

  const handleClick = () => {
    const appConfig = getAppConfig(appId);
    if (appConfig) {
      createWindow(appId, appConfig);
      closeStartMenu();
    }
  };

  // Default icon
  const iconSrc = icon || 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="4" y="2" width="24" height="28" fill="#f8f8f8" stroke="#888" stroke-width="1"/>
      <rect x="6" y="4" width="20" height="3" fill="#0058e6"/>
    </svg>
  `);

  return (
    <div className="xp-startmenu-item" onClick={handleClick}>
      <img src={iconSrc} alt={name} />
      <span className="xp-startmenu-item-text">
        <span className="xp-startmenu-item-name">{name}</span>
        {description && (
          <span className="xp-startmenu-item-desc">{description}</span>
        )}
      </span>
    </div>
  );
}
