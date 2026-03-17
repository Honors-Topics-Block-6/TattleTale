import { create } from 'zustand';

// Simple global game state. Your game/lobby can toggle this.
const useGameStore = create((set) => ({
  isInGame: false,
  samplePromptRequestId: 0,

  setInGame: (value) => set({ isInGame: !!value }),

  requestSamplePrompt: () =>
    set((state) => ({
      samplePromptRequestId: state.samplePromptRequestId + 1,
    })),
}));

export default useGameStore;

