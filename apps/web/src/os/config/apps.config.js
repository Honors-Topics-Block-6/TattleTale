// App Registry
// Import all apps here and register them in the registry

import EmptyApp from '../../apps/EmptyApp';
import Notepad from '../../apps/Notepad';
import Calculator from '../../apps/Calculator';
import Pacman from '../../apps/Pacman';

// Registry of all available apps
const appRegistry = {
  [EmptyApp.id]: EmptyApp,
  [Notepad.id]: Notepad,
  [Calculator.id]: Calculator,
  [Pacman.id]: Pacman,
};

// Default folder icon
const folderIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <path d="M2 8 L2 26 L30 26 L30 10 L14 10 L12 8 Z" fill="#f7d774" stroke="#c4a000" stroke-width="1"/>
    <path d="M2 10 L30 10 L30 26 L2 26 Z" fill="#fce94f"/>
  </svg>
`);

// Default computer icon
const computerIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="2" width="28" height="20" rx="2" fill="#d0d0d0" stroke="#888" stroke-width="1"/>
    <rect x="4" y="4" width="24" height="16" fill="#000080"/>
    <rect x="10" y="24" width="12" height="6" fill="#d0d0d0" stroke="#888" stroke-width="1"/>
    <rect x="6" y="28" width="20" height="2" fill="#d0d0d0" stroke="#888" stroke-width="1"/>
  </svg>
`);

// Default document icon
const documentIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <path d="M6 2 L6 30 L26 30 L26 10 L18 2 Z" fill="#fff" stroke="#888" stroke-width="1"/>
    <path d="M18 2 L18 10 L26 10 Z" fill="#f0f0f0" stroke="#888" stroke-width="1"/>
    <rect x="8" y="14" width="16" height="1" fill="#ccc"/>
    <rect x="8" y="17" width="14" height="1" fill="#ccc"/>
    <rect x="8" y="20" width="16" height="1" fill="#ccc"/>
    <rect x="8" y="23" width="10" height="1" fill="#ccc"/>
  </svg>
`);

// Get app config by ID
export function getAppConfig(appId) {
  return appRegistry[appId] || null;
}

// Get all apps that should appear on desktop
export function getDesktopApps() {
  return Object.values(appRegistry).filter(
    (app) => app.desktopIcon?.show
  );
}

// Get apps for start menu, organized by section
export function getStartMenuApps() {
  const programs = Object.values(appRegistry).filter(
    (app) => app.startMenu?.show && app.startMenu.section === 'programs'
  );

  // System places for the right panel
  const places = [
    { id: 'my-documents', name: 'My Documents', icon: folderIcon },
    { id: 'my-pictures', name: 'My Pictures', icon: folderIcon },
    { id: 'my-music', name: 'My Music', icon: folderIcon },
    { id: 'my-computer', name: 'My Computer', icon: computerIcon },
    { separator: true },
    { id: 'control-panel', name: 'Control Panel', icon: null },
    { id: 'printers', name: 'Printers and Faxes', icon: null },
    { separator: true },
    { id: 'help', name: 'Help and Support', icon: null },
    { id: 'search', name: 'Search', icon: null },
    { id: 'run', name: 'Run...', icon: null },
  ];

  return { programs, places };
}

// Register a new app dynamically
export function registerApp(appConfig) {
  if (appConfig.id) {
    appRegistry[appConfig.id] = appConfig;
  }
}

// Unregister an app
export function unregisterApp(appId) {
  delete appRegistry[appId];
}

// Get all registered apps
export function getAllApps() {
  return Object.values(appRegistry);
}

export default appRegistry;
