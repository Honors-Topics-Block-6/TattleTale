import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const MAX_MESSAGES_PER_CHANNEL = 200;

const initialState = {
  // Phase slice
  phase: null,
  cycle: 0,
  phaseEndsAt: null,
  phaseDurationSeconds: 0,
  timeRemaining: 0,
  isUrgent: false,

  // Players slice
  players: {},
  selfId: '',
  selfRole: '',
  selfTeam: '',
  selfAlive: true,

  // Channels slice
  channels: {},
  unreadCounts: {},
  popHistory: {},
  removedChannelIds: [],
  activeChannelId: null,

  // Vote slice
  pendingSelection: null,
  confirmedVote: null,
  voteTally: null,

  // Night-kill slice (Hacker-scoped)
  myTeam: null,
  myTeammates: [],
  hackerNightView: null,
  pendingNightKillSelection: null,

  // Session slice
  gameId: '',
  lobbyCode: '',
  status: 'ACTIVE',
  systemEvents: [],
  pendingIntentTypes: [],
  eliminationCause: null,
  eliminationCycle: null,

  // Lobby slice (pre-game waiting room)
  lobbyView: null,
};

const useGameStore = create(
  immer((set, get) => ({
    ...initialState,

    // --- Phase actions ---

    setTimeRemaining: (seconds) =>
      set((state) => {
        state.timeRemaining = seconds;
        state.isUrgent =
          state.phaseDurationSeconds > 0 &&
          seconds / state.phaseDurationSeconds < 0.15;
      }),

    // --- Player actions ---

    setSelfId: (id) =>
      set((state) => {
        state.selfId = id;
      }),

    // --- Channel actions ---

    addMessage: (channelId, msg) =>
      set((state) => {
        const channel = state.channels[channelId];
        if (!channel) return;
        // Deduplicate by message id
        if (channel.messages.some((m) => m.id === msg.id)) return;
        channel.messages.push(msg);
        // Cap at MAX_MESSAGES_PER_CHANNEL
        if (channel.messages.length > MAX_MESSAGES_PER_CHANNEL) {
          channel.messages = channel.messages.slice(
            channel.messages.length - MAX_MESSAGES_PER_CHANNEL
          );
        }
      }),

    incrementUnread: (channelId) =>
      set((state) => {
        state.unreadCounts[channelId] =
          (state.unreadCounts[channelId] || 0) + 1;
      }),

    markRead: (channelId) =>
      set((state) => {
        state.unreadCounts[channelId] = 0;
      }),

    markPopped: (channelId) =>
      set((state) => {
        state.popHistory[channelId] = true;
      }),

    setActiveChannel: (channelId) =>
      set((state) => {
        if (!state.channels[channelId]) {
          if (typeof window !== 'undefined' && import.meta.env?.DEV) {
            console.warn(
              `setActiveChannel: unknown channelId "${channelId}" — ignored`
            );
          }
          return;
        }
        state.activeChannelId = channelId;
        state.unreadCounts[channelId] = 0;
      }),

    prepareForReconnect: () =>
      set((state) => {
        // Clear message arrays only — preserve unreadCounts and popHistory
        for (const channelId of Object.keys(state.channels)) {
          state.channels[channelId].messages = [];
        }
      }),

    // --- Vote actions ---

    selectPlayer: (id) =>
      set((state) => {
        if (state.confirmedVote !== null) return; // Already confirmed
        state.pendingSelection = id;
      }),

    confirmVote: () =>
      set((state) => {
        if (state.pendingSelection === null) return;
        state.confirmedVote = state.pendingSelection;
      }),

    clearVote: () =>
      set((state) => {
        state.pendingSelection = null;
        state.confirmedVote = null;
      }),

    invalidatePending: (validPlayerIds) =>
      set((state) => {
        if (
          state.pendingSelection !== null &&
          !validPlayerIds.includes(state.pendingSelection)
        ) {
          state.pendingSelection = null;
        }
      }),

    // --- Night-kill actions ---

    selectNightKillTarget: (id) =>
      set((state) => {
        if (state.hackerNightView?.confirmedTarget !== null && state.hackerNightView?.confirmedTarget !== undefined) return;
        state.pendingNightKillSelection = id;
      }),

    clearNightKillSelection: () =>
      set((state) => {
        state.pendingNightKillSelection = null;
      }),

    // --- Session actions ---

    setElimination: (cause, cycle) =>
      set((state) => {
        state.eliminationCause = cause;
        state.eliminationCycle = cycle;
      }),

    // --- Lobby actions ---

    setLobbyView: (view) =>
      set((state) => {
        state.lobbyView = view;
      }),

    // --- Root sync action ---

    syncSessionState: (view) =>
      set((state) => {
        const previousPhase = state.phase;

        // Phase slice
        state.phase = view.phase;
        state.cycle = view.cycle;
        state.phaseEndsAt = view.currentPhaseEndsAt;
        state.phaseDurationSeconds = view.phaseDurationSeconds;
        if (view.currentPhaseEndsAt) {
          state.timeRemaining = Math.max(
            0,
            (Date.parse(view.currentPhaseEndsAt) - Date.now()) / 1000
          );
        } else {
          state.timeRemaining = 0;
        }
        state.isUrgent =
          state.phaseDurationSeconds > 0 &&
          state.timeRemaining / state.phaseDurationSeconds < 0.15;

        // Players slice
        const newPlayers = {};
        for (const p of view.players) {
          newPlayers[p.playerId] = {
            playerId: p.playerId,
            displayName: p.displayName,
            alive: p.alive,
            connected: p.connected,
            role: p.role,
            team: p.team,
          };
        }
        state.players = newPlayers;
        state.selfRole = view.myRole;
        state.selfTeam = view.myTeam;
        state.selfAlive = newPlayers[state.selfId]?.alive ?? true;

        // Channels slice — merge
        const serverChannelIds = new Set(view.channels.map((c) => c.id));
        // Remove channels no longer present
        const removed = [];
        for (const channelId of Object.keys(state.channels)) {
          if (!serverChannelIds.has(channelId)) {
            removed.push(channelId);
            delete state.channels[channelId];
            delete state.unreadCounts[channelId];
            delete state.popHistory[channelId];
          }
        }
        state.removedChannelIds = removed;

        // Reset active channel to null if it was removed; the null-check below
        // then handles both this case and initial load with a single fallback.
        if (removed.includes(state.activeChannelId)) {
          state.activeChannelId = null;
        }

        // Add/update channels from server
        for (const ch of view.channels) {
          if (state.channels[ch.id]) {
            // Update metadata, preserve messages
            state.channels[ch.id].type = ch.type;
            state.channels[ch.id].members = ch.members;
            state.channels[ch.id].locked = ch.locked;
            state.channels[ch.id].expiresAt = ch.expiresAt;
          } else {
            // New channel
            state.channels[ch.id] = {
              id: ch.id,
              type: ch.type,
              members: ch.members,
              locked: ch.locked,
              expiresAt: ch.expiresAt,
              messages: [],
            };
          }
        }

        // Auto-select when no active channel (initial load, or active was removed above).
        // Prefer SYSTEM, then GLOBAL, then the first available channel.
        if (state.activeChannelId === null) {
          const system = view.channels.find((c) => c.type === 'SYSTEM');
          const global = view.channels.find((c) => c.type === 'GLOBAL');
          state.activeChannelId = system?.id ?? global?.id ?? view.channels[0]?.id ?? null;
        }

        // Vote slice
        state.voteTally = view.voteTally ?? null;
        if (previousPhase === 'DAY_VOTE' && view.phase !== 'DAY_VOTE') {
          state.pendingSelection = null;
          state.confirmedVote = null;
        }
        if (view.phase === 'DAY_VOTE') {
          const validIds = view.players
            .filter((p) => p.alive && p.connected)
            .map((p) => p.playerId);
          if (
            state.pendingSelection !== null &&
            !validIds.includes(state.pendingSelection)
          ) {
            state.pendingSelection = null;
          }
        }

        // Night-kill slice
        state.myTeam = view.myTeam;
        state.myTeammates = view.myTeammates ?? [];
        state.hackerNightView = view.hackerNightView ?? null;
        // Clear pending night selection on phase change
        if (previousPhase === 'NIGHT_ACTIONS' && view.phase !== 'NIGHT_ACTIONS') {
          state.pendingNightKillSelection = null;
        }

        // Session slice
        state.gameId = view.gameId;
        state.lobbyCode = view.lobbyCode;
        state.status = view.status;
        state.systemEvents = view.systemEvents;
        state.pendingIntentTypes = view.myPendingIntentTypes;
      }),

    // --- Reset ---

    resetGame: () => set(() => ({ ...initialState })),
  }))
);

export default useGameStore;

export function selectIsHacker(state) {
  if (state.myTeam !== 'HACKERS') return false;
  const self = state.selfId ? state.players?.[state.selfId] : null;
  return Boolean(self?.alive);
}

export function selectIsHackerNight(state) {
  return state.hackerNightView !== null;
}

export function selectNightKillTally(state) {
  return state.hackerNightView?.tally ?? {};
}

export function selectConfirmedNightKill(state) {
  return state.hackerNightView?.confirmedTarget ?? null;
}

export function selectNightKillCandidates(state) {
  if (!state.players) return [];
  const hackerSet = new Set([state.selfId, ...(state.myTeammates ?? [])]);
  return Object.values(state.players).filter(
    (p) => p.alive && !hackerSet.has(p.playerId),
  );
}

