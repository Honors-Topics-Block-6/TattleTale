import { create } from 'zustand';

const useDialogStore = create((set) => ({
  dialogs: {}, // windowId -> dialog payload

  setDialog: (windowId, payload) => {
    set((state) => ({
      dialogs: {
        ...state.dialogs,
        [windowId]: payload,
      },
    }));
  },

  clearDialog: (windowId) => {
    set((state) => {
      if (!state.dialogs[windowId]) return state;
      const next = { ...state.dialogs };
      delete next[windowId];
      return { dialogs: next };
    });
  },
}));

export default useDialogStore;

