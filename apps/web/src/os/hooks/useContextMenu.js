import { useCallback, useEffect } from 'react';
import useMenuStore from '../store/menuStore';

export default function useContextMenu(items) {
  const openContextMenu = useMenuStore((state) => state.openContextMenu);
  const closeContextMenu = useMenuStore((state) => state.closeContextMenu);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, items);
  }, [items, openContextMenu]);

  // Close context menu on click anywhere
  useEffect(() => {
    const handleClick = () => {
      closeContextMenu();
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [closeContextMenu]);

  return { onContextMenu: handleContextMenu };
}
