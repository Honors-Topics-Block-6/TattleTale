import { useEffect, useRef } from 'react';
import useMenuStore from '../../store/menuStore';

export default function ContextMenu() {
  const contextMenu = useMenuStore((state) => state.contextMenu);
  const closeContextMenu = useMenuStore((state) => state.closeContextMenu);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = () => {
      closeContextMenu();
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    // Small delay to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const { x, y, items } = contextMenu;

  // Adjust position to keep menu on screen
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 300);

  const handleItemClick = (item) => {
    if (item.disabled) return;
    if (item.action) {
      item.action();
    }
    closeContextMenu();
  };

  const renderItems = (items) => {
    return items.map((item, index) => {
      if (item.separator) {
        return <div key={index} className="xp-contextmenu-separator" />;
      }

      return (
        <div
          key={item.id || index}
          className={`xp-contextmenu-item ${item.disabled ? 'disabled' : ''}`}
          onClick={() => handleItemClick(item)}
        >
          <span>{item.label}</span>
          {item.items && <span>▶</span>}
        </div>
      );
    });
  };

  return (
    <div
      className="xp-contextmenu"
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
    >
      {renderItems(items)}
    </div>
  );
}
