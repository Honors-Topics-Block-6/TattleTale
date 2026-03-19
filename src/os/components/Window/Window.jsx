import { useMemo } from 'react';
import useWindowStore from '../../store/windowStore';
import useDraggable from '../../hooks/useDraggable';
import useResizable from '../../hooks/useResizable';
import TitleBar from './TitleBar';
import MenuBar from './MenuBar';
import ResizeHandles from './ResizeHandles';

export default function Window({ windowId, appConfig }) {
  const win = useWindowStore((state) => state.windows[windowId]);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const focusWindow = useWindowStore((state) => state.focusWindow);

  const dragHandlers = useDraggable(windowId);
  const resizeHandlers = useResizable(windowId);

  const isActive = activeWindowId === windowId;

  const style = useMemo(() => ({
    left: win.x,
    top: win.y,
    width: win.width,
    height: win.height,
    zIndex: win.zIndex,
  }), [win.x, win.y, win.width, win.height, win.zIndex]);

  if (!win) return null;

  const AppComponent = appConfig.component;

  return (
    <div
      className={`xp-window ${isActive ? 'active' : ''} ${win.minimized ? 'minimized' : ''} ${win.maximized ? 'maximized' : ''}`}
      style={style}
      onMouseDown={() => focusWindow(windowId)}
    >
      <TitleBar
        windowId={windowId}
        title={win.title}
        icon={win.icon}
        dragHandlers={dragHandlers}
      />

      {win.menuBar && (
        <MenuBar
          windowId={windowId}
          menuBar={win.menuBar}
        />
      )}

      <div className="xp-window-content">
        {AppComponent && <AppComponent windowId={windowId} />}
      </div>

      {win.resizable && !win.maximized && (
        <ResizeHandles handlers={resizeHandlers} />
      )}
    </div>
  );
}
