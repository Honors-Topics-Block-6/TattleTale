import { useState } from 'react';
import useAppMenu from '../../os/hooks/useAppMenu';

// Notepad Component
function NotepadComponent({ windowId }) {
  const [content, setContent] = useState('');

  // Register menu action handlers
  useAppMenu(windowId, {
    'file.new': () => setContent(''),
    'file.save': () => {
      console.log('Saving:', content);
      alert('File saved! (simulated)');
    },
    'edit.selectall': () => {
      const textarea = document.querySelector(`[data-window-id="${windowId}"] textarea`);
      if (textarea) textarea.select();
    },
  });

  return (
    <div
      data-window-id={windowId}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          outline: 'none',
          resize: 'none',
          padding: '4px',
          fontFamily: 'Lucida Console, Consolas, monospace',
          fontSize: '12px',
          lineHeight: '1.4',
        }}
        placeholder="Type something..."
      />
    </div>
  );
}

// Notepad icon
const notepadIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="4" y="2" width="24" height="28" fill="#fff" stroke="#0000aa" stroke-width="1"/>
    <rect x="4" y="2" width="24" height="4" fill="#0000aa"/>
    <line x1="6" y1="10" x2="26" y2="10" stroke="#ccc" stroke-width="1"/>
    <line x1="6" y1="14" x2="26" y2="14" stroke="#ccc" stroke-width="1"/>
    <line x1="6" y1="18" x2="26" y2="18" stroke="#ccc" stroke-width="1"/>
    <line x1="6" y1="22" x2="26" y2="22" stroke="#ccc" stroke-width="1"/>
    <line x1="6" y1="26" x2="26" y2="26" stroke="#ccc" stroke-width="1"/>
  </svg>
`);

// App Configuration
const Notepad = {
  id: 'notepad',
  name: 'Notepad',
  icon: notepadIcon,
  component: NotepadComponent,
  defaultWindow: {
    width: 600,
    height: 400,
    resizable: true,
    minWidth: 300,
    minHeight: 200,
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
          { id: 'saveas', label: 'Save As...', action: 'file.saveas' },
          { separator: true },
          { id: 'pagesetup', label: 'Page Setup...', action: 'file.pagesetup' },
          { id: 'print', label: 'Print...', shortcut: 'Ctrl+P', action: 'file.print' },
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
          { id: 'delete', label: 'Delete', shortcut: 'Del', action: 'edit.delete' },
          { separator: true },
          { id: 'find', label: 'Find...', shortcut: 'Ctrl+F', action: 'edit.find' },
          { id: 'findnext', label: 'Find Next', shortcut: 'F3', action: 'edit.findnext' },
          { id: 'replace', label: 'Replace...', shortcut: 'Ctrl+H', action: 'edit.replace' },
          { separator: true },
          { id: 'selectall', label: 'Select All', shortcut: 'Ctrl+A', action: 'edit.selectall' },
          { id: 'timedate', label: 'Time/Date', shortcut: 'F5', action: 'edit.timedate' },
        ],
      },
      {
        id: 'format',
        label: 'Format',
        items: [
          { id: 'wordwrap', label: 'Word Wrap', action: 'format.wordwrap' },
          { id: 'font', label: 'Font...', action: 'format.font' },
        ],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { id: 'statusbar', label: 'Status Bar', action: 'view.statusbar' },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          { id: 'helptopics', label: 'Help Topics', action: 'help.topics' },
          { separator: true },
          { id: 'about', label: 'About Notepad', action: 'help.about' },
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
    description: 'A simple text editor',
  },
};

export default Notepad;
