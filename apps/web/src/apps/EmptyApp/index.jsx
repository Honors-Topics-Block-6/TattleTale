// Empty App Component
function EmptyAppComponent({ windowId }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '20px',
      color: '#666',
      fontFamily: 'Tahoma, sans-serif',
      fontSize: '12px',
      textAlign: 'center',
    }}>
      <div>
        <p>This is an empty application window.</p>
        <p style={{ marginTop: '10px', fontSize: '10px', color: '#999' }}>
          Window ID: {windowId}
        </p>
      </div>
    </div>
  );
}

// App Configuration
const EmptyApp = {
  id: 'empty-app',
  name: 'Empty App',
  icon: null, // Will use default icon
  component: EmptyAppComponent,
  defaultWindow: {
    width: 400,
    height: 300,
    resizable: true,
    minWidth: 200,
    minHeight: 150,
  },
  menuBar: {
    items: [
      {
        id: 'file',
        label: 'File',
        items: [
          { id: 'new', label: 'New', shortcut: 'Ctrl+N', action: 'file.new' },
          { id: 'open', label: 'Open...', shortcut: 'Ctrl+O', action: 'file.open' },
          { id: 'save', label: 'Save', shortcut: 'Ctrl+S', action: 'file.save' },
          { separator: true },
          { id: 'exit', label: 'Exit', action: 'file.exit' },
        ],
      },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', action: 'edit.undo', disabled: true },
          { separator: true },
          { id: 'cut', label: 'Cut', shortcut: 'Ctrl+X', action: 'edit.cut' },
          { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', action: 'edit.copy' },
          { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', action: 'edit.paste' },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          { id: 'about', label: 'About Empty App', action: 'help.about' },
        ],
      },
    ],
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'An empty application window',
  },
};

export default EmptyApp;
