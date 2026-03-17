import useWindowStore from '../../store/windowStore';

export default function TitleBar({ windowId, title, icon, dragHandlers }) {
  const minimizeWindow = useWindowStore((state) => state.minimizeWindow);
  const toggleMaximize = useWindowStore((state) => state.toggleMaximize);
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const win = useWindowStore((state) => state.windows[windowId]);

  const handleMinimize = (e) => {
    e.stopPropagation();
    minimizeWindow(windowId);
  };

  const handleMaximize = (e) => {
    e.stopPropagation();
    toggleMaximize(windowId);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    closeWindow(windowId);
  };

  const handleDoubleClick = () => {
    toggleMaximize(windowId);
  };

  return (
    <div
      className="xp-titlebar"
      onDoubleClick={handleDoubleClick}
      {...dragHandlers}
    >
      {icon && <img src={icon} alt="" className="xp-titlebar-icon" />}
      <span className="xp-titlebar-title">{title}</span>
      <div className="xp-titlebar-buttons">
        <button
          className="xp-titlebar-button minimize"
          onClick={handleMinimize}
          title="Minimize"
        >
          _
        </button>
        <button
          className="xp-titlebar-button maximize"
          onClick={handleMaximize}
          title={win?.maximized ? 'Restore' : 'Maximize'}
        >
          {win?.maximized ? '❐' : '□'}
        </button>
        <button
          className="xp-titlebar-button close"
          onClick={handleClose}
          title="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
