import { create } from 'zustand';

const useMenuStore = create((set, get) => ({
  startMenuOpen: false,
  contextMenu: null, // { x, y, items }
  activeMenuBar: null, // { windowId, menuId }

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
}));

export default useMenuStore;
