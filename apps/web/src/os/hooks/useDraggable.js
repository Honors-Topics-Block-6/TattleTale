import { useCallback, useRef } from 'react';
import useWindowStore from '../store/windowStore';

export default function useDraggable(windowId) {
  const moveWindow = useWindowStore((state) => state.moveWindow);
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const getWindow = useWindowStore((state) => state.getWindow);

  const dragState = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  const handleMouseDown = useCallback((e) => {
    // Only drag on left click
    if (e.button !== 0) return;

    // Focus the window
    focusWindow(windowId);

    const win = getWindow(windowId);
    if (!win || win.maximized) return;

    dragState.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialX: win.x,
      initialY: win.y,
    };

    // Add dragging class to body
    document.body.classList.add('xp-dragging');

    const handleMouseMove = (e) => {
      if (!dragState.current.isDragging) return;

      const deltaX = e.clientX - dragState.current.startX;
      const deltaY = e.clientY - dragState.current.startY;

      const newX = dragState.current.initialX + deltaX;
      const newY = Math.max(0, dragState.current.initialY + deltaY);

      moveWindow(windowId, newX, newY);
    };

    const handleMouseUp = () => {
      dragState.current.isDragging = false;
      document.body.classList.remove('xp-dragging');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [windowId, moveWindow, focusWindow, getWindow]);

  return { onMouseDown: handleMouseDown };
}
