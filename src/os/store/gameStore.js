import { create } from 'zustand';

// Simple global game state. Your game/lobby can toggle this.
const useGameStore = create((set) => ({
  isInGame: false,

  setInGame: (value) => set({ isInGame: !!value }),
}));

export default useGameStore;

