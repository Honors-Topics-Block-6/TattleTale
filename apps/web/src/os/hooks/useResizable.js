import { useCallback, useRef } from 'react';
import useWindowStore from '../store/windowStore';

export default function useResizable(windowId) {
  const resizeWindow = useWindowStore((state) => state.resizeWindow);
  const getWindow = useWindowStore((state) => state.getWindow);

  const resizeState = useRef({
    isResizing: false,
    direction: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialWidth: 0,
    initialHeight: 0,
  });

  const createResizeHandler = useCallback((direction) => {
    return (e) => {
      // Only resize on left click
      if (e.button !== 0) return;
      e.stopPropagation();

      const win = getWindow(windowId);
      if (!win || win.maximized || !win.resizable) return;

      resizeState.current = {
        isResizing: true,
        direction,
        startX: e.clientX,
        startY: e.clientY,
        initialX: win.x,
        initialY: win.y,
        initialWidth: win.width,
        initialHeight: win.height,
      };

      document.body.classList.add('xp-dragging');

      const handleMouseMove = (e) => {
        if (!resizeState.current.isResizing) return;

        const { direction, startX, startY, initialX, initialY, initialWidth, initialHeight } = resizeState.current;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        let newWidth = initialWidth;
        let newHeight = initialHeight;
        let newX = initialX;
        let newY = initialY;

        // Handle horizontal resize
        if (direction.includes('e')) {
          newWidth = initialWidth + deltaX;
        } else if (direction.includes('w')) {
          newWidth = initialWidth - deltaX;
          newX = initialX + deltaX;
        }

        // Handle vertical resize
        if (direction.includes('s')) {
          newHeight = initialHeight + deltaY;
        } else if (direction.includes('n')) {
          newHeight = initialHeight - deltaY;
          newY = initialY + deltaY;
        }

        // Apply minimum constraints
        const win = getWindow(windowId);
        if (newWidth < win.minWidth) {
          if (direction.includes('w')) {
            newX = initialX + initialWidth - win.minWidth;
          }
          newWidth = win.minWidth;
        }
        if (newHeight < win.minHeight) {
          if (direction.includes('n')) {
            newY = initialY + initialHeight - win.minHeight;
          }
          newHeight = win.minHeight;
        }

        // Keep window at least partially visible
        newY = Math.max(0, newY);

        resizeWindow(windowId, newWidth, newHeight, newX, newY);
      };

      const handleMouseUp = () => {
        resizeState.current.isResizing = false;
        document.body.classList.remove('xp-dragging');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };
  }, [windowId, resizeWindow, getWindow]);

  return {
    n: { onMouseDown: createResizeHandler('n') },
    s: { onMouseDown: createResizeHandler('s') },
    e: { onMouseDown: createResizeHandler('e') },
    w: { onMouseDown: createResizeHandler('w') },
    ne: { onMouseDown: createResizeHandler('ne') },
    nw: { onMouseDown: createResizeHandler('nw') },
    se: { onMouseDown: createResizeHandler('se') },
    sw: { onMouseDown: createResizeHandler('sw') },
  };
}
