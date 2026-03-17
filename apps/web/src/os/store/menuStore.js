import { create } from 'zustand';

const useMenuStore = create((set, get) => ({
  startMenuOpen: false,
  contextMenu: null, // { x, y, items }
  activeMenuBar: null, // { windowId, menuId }
  powerDialog: null, // 'shutdown' | 'logoff' | null
  osScreen: 'desktop', // 'desktop' | 'shuttingdown' | 'restarting' | 'standby' | 'logoff'

  toggleStartMenu: () => {
    set((state) => ({
      startMenuOpen: !state.startMenuOpen,
      contextMenu: null,
      activeMenuBar: null,
    }));
  },

  closeStartMenu: () => {
    set({ startMenuOpen: false });
  },

  openContextMenu: (x, y, items) => {
    set({
      contextMenu: { x, y, items },
      startMenuOpen: false,
      activeMenuBar: null,
    });
  },

  closeContextMenu: () => {
    set({ contextMenu: null });
  },

  openMenuBar: (windowId, menuId) => {
    set({
      activeMenuBar: { windowId, menuId },
      startMenuOpen: false,
      contextMenu: null,
    });
  },

  closeMenuBar: () => {
    set({ activeMenuBar: null });
  },

  closeAllMenus: () => {
    set({
      startMenuOpen: false,
      contextMenu: null,
      activeMenuBar: null,
    });
  },

  openPowerDialog: (type) => {
    set({ powerDialog: type, startMenuOpen: false, contextMenu: null, activeMenuBar: null });
  },

  closePowerDialog: () => {
    set({ powerDialog: null });
  },

  setOsScreen: (screen) => {
    set({ osScreen: screen });
  },
}));

export default useMenuStore;
