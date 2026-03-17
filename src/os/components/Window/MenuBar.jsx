import { useState, useRef, useEffect } from 'react';
import useMenuStore from '../../store/menuStore';
import { executeMenuAction } from '../../hooks/useAppMenu';

export default function MenuBar({ windowId, menuBar }) {
  const activeMenuBar = useMenuStore((state) => state.activeMenuBar);
  const openMenuBar = useMenuStore((state) => state.openMenuBar);
  const closeMenuBar = useMenuStore((state) => state.closeMenuBar);

  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  const isOurMenu = activeMenuBar?.windowId === windowId;

  useEffect(() => {
    if (!isOurMenu) {
      setOpenMenuId(null);
    }
  }, [isOurMenu]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
        closeMenuBar();
      }
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuId, closeMenuBar]);

  const handleMenuClick = (menuId) => {
    if (openMenuId === menuId) {
      setOpenMenuId(null);
      closeMenuBar();
    } else {
      setOpenMenuId(menuId);
      openMenuBar(windowId, menuId);
    }
  };

  const handleMenuItemClick = (item) => {
    if (item.disabled) return;

    if (item.action) {
      executeMenuAction(windowId, item.action);
    }

    setOpenMenuId(null);
    closeMenuBar();
  };

  if (!menuBar?.items?.length) return null;

  return (
    <div className="xp-menubar" ref={menuRef}>
      {menuBar.items.map((menu) => (
        <div
          key={menu.id}
          className={`xp-menubar-item ${openMenuId === menu.id ? 'active' : ''}`}
          onClick={() => handleMenuClick(menu.id)}
        >
          {menu.label}

          {openMenuId === menu.id && menu.items && (
            <div className="xp-menubar-dropdown">
              {menu.items.map((item, index) => (
                item.separator ? (
                  <div key={index} className="xp-menubar-separator" />
                ) : (
                  <div
                    key={item.id || index}
                    className={`xp-menubar-dropdown-item ${item.disabled ? 'disabled' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMenuItemClick(item);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="xp-menubar-shortcut">{item.shortcut}</span>
                    )}
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
