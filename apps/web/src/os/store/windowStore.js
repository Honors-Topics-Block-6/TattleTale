import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';

const TASKBAR_HEIGHT = 40;

const useWindowStore = create(
  immer((set, get) => ({
    windows: {},
    activeWindowId: null,
    nextZIndex: 100,

    createWindow: (appId, appConfig) => {
      // Avoid duplicate windows for specific singleton apps.
      if (appId === 'ready-toggle') {
        const existing = Object.values(get().windows).find((w) => w.appId === appId);
        if (existing) {
          const { nextZIndex } = get();
          // Focus the existing window and return its id.
          set((state) => {
            if (state.windows[existing.id]) {
              state.windows[existing.id].zIndex = nextZIndex;
              state.windows[existing.id].minimized = false;
              state.activeWindowId = existing.id;
              state.nextZIndex = nextZIndex + 1;
            }
          });
          return existing.id;
        }
      }

      const id = uuidv4();
      const { nextZIndex } = get();

      const defaultConfig = appConfig.defaultWindow || {};
      const width = defaultConfig.width || 400;
      const height = defaultConfig.height || 300;

      // Center the window
      const x = Math.max(50, (window.innerWidth - width) / 2 + Math.random() * 50);
      const y = Math.max(50, (window.innerHeight - TASKBAR_HEIGHT - height) / 2 + Math.random() * 50);

      set((state) => {
        state.windows[id] = {
          id,
          appId,
          title: appConfig.name || 'Untitled',
          icon: appConfig.icon || null,
          x,
          y,
          width,
          height,
          minWidth: defaultConfig.minWidth || 200,
          minHeight: defaultConfig.minHeight || 150,
          resizable: defaultConfig.resizable !== false,
          minimized: false,
          maximized: false,
          zIndex: nextZIndex,
          prevState: null, // Store state before maximize
          menuBar: appConfig.menuBar || null,
        };
        state.activeWindowId = id;
        state.nextZIndex = nextZIndex + 1;
      });

      return id;
    },

    closeWindow: (id) => {
      set((state) => {
        delete state.windows[id];
        if (state.activeWindowId === id) {
          // Find the next highest z-index window
          const remaining = Object.values(state.windows);
          if (remaining.length > 0) {
            const topWindow = remaining.reduce((a, b) =>
              a.zIndex > b.zIndex ? a : b
            );
            state.activeWindowId = topWindow.id;
          } else {
            state.activeWindowId = null;
          }
        }
      });
    },

    focusWindow: (id) => {
      const { nextZIndex } = get();
      set((state) => {
        if (state.windows[id]) {
          state.windows[id].zIndex = nextZIndex;
          state.windows[id].minimized = false;
          state.activeWindowId = id;
          state.nextZIndex = nextZIndex + 1;
        }
      });
    },

    minimizeWindow: (id) => {
      set((state) => {
        if (state.windows[id]) {
          state.windows[id].minimized = true;
          if (state.activeWindowId === id) {
            // Find next window to focus
            const remaining = Object.values(state.windows)
              .filter(w => !w.minimized && w.id !== id);
            if (remaining.length > 0) {
              const topWindow = remaining.reduce((a, b) =>
                a.zIndex > b.zIndex ? a : b
              );
              state.activeWindowId = topWindow.id;
            } else {
              state.activeWindowId = null;
            }
          }
        }
      });
    },

    toggleMaximize: (id) => {
      set((state) => {
        const win = state.windows[id];
        if (!win) return;

        if (win.maximized) {
          // Restore
          if (win.prevState) {
            win.x = win.prevState.x;
            win.y = win.prevState.y;
            win.width = win.prevState.width;
            win.height = win.prevState.height;
          }
          win.maximized = false;
          win.prevState = null;
        } else {
          // Maximize
          win.prevState = { x: win.x, y: win.y, width: win.width, height: win.height };
          win.x = 0;
          win.y = 0;
          win.width = window.innerWidth;
          win.height = window.innerHeight - TASKBAR_HEIGHT;
          win.maximized = true;
        }
      });
    },

    moveWindow: (id, x, y) => {
      set((state) => {
        if (state.windows[id] && !state.windows[id].maximized) {
          state.windows[id].x = x;
          state.windows[id].y = y;
        }
      });
    },

    resizeWindow: (id, width, height, x, y) => {
      set((state) => {
        const win = state.windows[id];
        if (win && !win.maximized && win.resizable) {
          win.width = Math.max(win.minWidth, width);
          win.height = Math.max(win.minHeight, height);
          if (x !== undefined) win.x = x;
          if (y !== undefined) win.y = y;
        }
      });
    },

    getWindow: (id) => {
      return get().windows[id];
    },

    getAllWindows: () => {
      return Object.values(get().windows);
    },
  }))
);

export default useWindowStore;
