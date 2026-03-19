import { useMemo, useState } from 'react';
import DesktopIcon from './DesktopIcon';
import useContextMenu from '../../hooks/useContextMenu';
import useMenuStore from '../../store/menuStore';
import { getDesktopApps } from '../../config/apps.config';

export default function Desktop({ wallpaper }) {
  const [selectedAppId, setSelectedAppId] = useState(null);
  const closeAllMenus = useMenuStore((state) => state.closeAllMenus);
  const desktopApps = useMemo(() => getDesktopApps(), []);

  const contextMenuItems = [
    { id: 'refresh', label: 'Refresh', action: () => window.location.reload() },
    { separator: true },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'large-icons', label: 'Large Icons' },
        { id: 'small-icons', label: 'Small Icons' },
        { id: 'list', label: 'List' },
      ],
    },
    { separator: true },
    { id: 'new', label: 'New', items: [
      { id: 'folder', label: 'Folder' },
      { id: 'shortcut', label: 'Shortcut' },
      { id: 'text', label: 'Text Document' },
    ]},
    { separator: true },
    { id: 'properties', label: 'Properties' },
  ];

  const contextMenu = useContextMenu(contextMenuItems);

  const style = useMemo(() => {
    if (wallpaper) {
      return {
        backgroundImage: `url(${wallpaper})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    return {};
  }, [wallpaper]);

  const handleClick = () => {
    closeAllMenus();
    setSelectedAppId(null);
  };

  return (
    <div
      className="xp-desktop"
      style={style}
      onClick={handleClick}
      {...contextMenu}
    >
      <div className="xp-desktop-icons">
        {desktopApps.map((app) => (
          <DesktopIcon
            key={app.id}
            appId={app.id}
            name={app.name}
            icon={app.icon}
            selected={selectedAppId === app.id}
            onSelect={setSelectedAppId}
          />
        ))}
      </div>
    </div>
  );
}
