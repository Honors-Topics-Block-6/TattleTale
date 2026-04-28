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
  pendingInvestigateSelection: null,
  // Cycle number in which the viewer last submitted an INVESTIGATE intent.
  // Scoped per-cycle because `pendingIntentTypes` is coarse (it only tracks
  // IntentType, not actionType) and would false-positive if any other
  // SUBMIT_NIGHT_ACTION is pending (e.g. after a Jealous SWAP_ROLE).
  investigateSubmittedCycle: null,

  // Protect slice (Security-Specialist-scoped)
  protectNightView: null,
  pendingProtectSelection: null,

  // Firewall slice
  firewallNightView: null,
  pendingFirewallSelection: null,

  // Vengeful slice
  vengefulNightView: null,
  pendingVengefulSelection: null,

  // Extrovert slice
  extrovertNightView: null,
  pendingExtrovertSelections: [],

  // Session slice
  gameId: '',
  lobbyCode: '',
  status: 'ACTIVE',
  systemEvents: [],
  pendingIntentTypes: [],
  eliminationCause: null,
  eliminationCycle: null,

  // Active communication restrictions affecting the viewer (#76).
  // Shape: Array<{ type, expiresAt, channelId?, channelTypes? }> — mirrors
  // ViewerRestriction from packages/shared/src/contracts/views.ts.
  myRestrictions: [],

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

    selectInvestigateTarget: (id) =>
      set((state) => {
        state.pendingInvestigateSelection = id;
      }),

    clearInvestigateSelection: () =>
      set((state) => {
        state.pendingInvestigateSelection = null;
      }),

    markInvestigateSubmitted: (cycle) =>
      set((state) => {
        state.investigateSubmittedCycle = cycle;
      }),

    // --- Protect actions ---

    selectProtectTarget: (id) =>
      set((state) => {
        if (state.protectNightView?.confirmedTarget !== null && state.protectNightView?.confirmedTarget !== undefined) return;
        state.pendingProtectSelection = id;
      }),

    clearProtectSelection: () =>
      set((state) => {
        state.pendingProtectSelection = null;
      }),

    // --- Firewall actions ---

    selectFirewallTarget: (channelId) =>
      set((state) => {
        if (state.firewallNightView?.confirmedTargetChannelId) return;
        if (state.firewallNightView?.used) return;
        state.pendingFirewallSelection = channelId;
      }),

    clearFirewallSelection: () =>
      set((state) => {
        state.pendingFirewallSelection = null;
      }),

    // --- Vengeful actions ---

    selectVengefulTarget: (id) =>
      set((state) => {
        if (state.vengefulNightView?.confirmedTarget) return;
        state.pendingVengefulSelection = id;
      }),

    clearVengefulSelection: () =>
      set((state) => {
        state.pendingVengefulSelection = null;
      }),

    // --- Extrovert actions ---

    toggleExtrovertTarget: (id) =>
      set((state) => {
        if (state.extrovertNightView?.confirmedTargetIds) return;
        const list = state.pendingExtrovertSelections ?? [];
        const idx = list.indexOf(id);
        if (idx === -1) list.push(id);
        else list.splice(idx, 1);
        state.pendingExtrovertSelections = list;
      }),

    clearExtrovertSelections: () =>
      set((state) => {
        state.pendingExtrovertSelections = [];
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
        const previousSelfRole = state.selfRole;

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
            state.channels[ch.id].label = ch.label ?? null;
          } else {
            // New channel
            state.channels[ch.id] = {
              id: ch.id,
              type: ch.type,
              members: ch.members,
              locked: ch.locked,
              expiresAt: ch.expiresAt,
              label: ch.label ?? null,
              messages: [],
            };
          }
        }

        // Auto-select when no active channel (initial load, or active was removed above).
        // Prefer SYSTEM, then GLOBAL, then the first available channel.
        if (state.activeChannelId === null) {
          const system = view.channels.find((c) => c.type === 'SYSTEM');
          const global = view.channels.find((c) => c.type === 'GLOBAL');
          const firstNonPrivate = view.channels.find((c) => c.type !== 'PRIVATE');
          state.activeChannelId = system?.id ?? global?.id ?? firstNonPrivate?.id ?? view.channels[0]?.id ?? null;
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
        state.protectNightView = view.protectNightView ?? null;
        state.firewallNightView = view.firewallNightView ?? null;
        state.vengefulNightView = view.vengefulNightView ?? null;
        state.extrovertNightView = view.extrovertNightView ?? null;
        // Clear pending selections once the server has acknowledged each
        // submission, so panels read exclusively from confirmed* fields and
        // don't show pending + confirmed indicators simultaneously.
        if (view.firewallNightView?.confirmedTargetChannelId != null) {
          state.pendingFirewallSelection = null;
        }
        if (view.vengefulNightView?.confirmedTarget != null) {
          state.pendingVengefulSelection = null;
        }
        if (view.extrovertNightView?.confirmedTargetIds != null) {
          state.pendingExtrovertSelections = [];
        }
        // Clear pending night selection on phase change
        if (previousPhase === 'NIGHT_ACTIONS' && view.phase !== 'NIGHT_ACTIONS') {
          state.pendingNightKillSelection = null;
          state.pendingInvestigateSelection = null;
          state.investigateSubmittedCycle = null;
          state.pendingProtectSelection = null;
          state.pendingFirewallSelection = null;
          state.pendingVengefulSelection = null;
          state.pendingExtrovertSelections = [];
        }
        // Defense-in-depth: if the viewer's role was swapped away from
        // WHITE_HAT_HACKER mid-game (e.g. Jealous SWAP_ROLE), drop any stale
        // investigate selection so it can't leak into a later cycle.
        if (
          previousSelfRole === 'WHITE_HAT_HACKER' &&
          view.myRole !== 'WHITE_HAT_HACKER'
        ) {
          state.pendingInvestigateSelection = null;
          state.investigateSubmittedCycle = null;
        }
        // Same defense-in-depth for SECURITY_SPECIALIST role swaps.
        if (
          previousSelfRole === 'SECURITY_SPECIALIST' &&
          view.myRole !== 'SECURITY_SPECIALIST'
        ) {
          state.pendingProtectSelection = null;
        }
        if (previousSelfRole === 'FIREWALL' && view.myRole !== 'FIREWALL') {
          state.pendingFirewallSelection = null;
        }
        if (previousSelfRole === 'VENGEFUL' && view.myRole !== 'VENGEFUL') {
          state.pendingVengefulSelection = null;
        }
        if (
          previousSelfRole === 'EXTROVERT' &&
          view.myRole !== 'EXTROVERT'
        ) {
          state.pendingExtrovertSelections = [];
        }

        // Session slice
        state.gameId = view.gameId;
        state.lobbyCode = view.lobbyCode;
        state.status = view.status;
        state.systemEvents = view.systemEvents;
        state.pendingIntentTypes = view.myPendingIntentTypes;
        state.myRestrictions = view.myRestrictions ?? [];
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

export function selectIsWhiteHatHacker(state) {
  if (state.selfRole !== 'WHITE_HAT_HACKER') return false;
  const self = state.selfId ? state.players?.[state.selfId] : null;
  return Boolean(self?.alive);
}

export function selectIsSecuritySpecialist(state) {
  if (state.selfRole !== 'SECURITY_SPECIALIST') return false;
  const self = state.selfId ? state.players?.[state.selfId] : null;
  return Boolean(self?.alive);
}

export function selectIsFirewall(state) {
  if (state.selfRole !== 'FIREWALL') return false;
  const self = state.selfId ? state.players?.[state.selfId] : null;
  return Boolean(self?.alive);
}

export function selectIsVengeful(state) {
  if (state.selfRole !== 'VENGEFUL') return false;
  const self = state.selfId ? state.players?.[state.selfId] : null;
  return Boolean(self?.alive);
}

export function selectIsExtrovert(state) {
  if (state.selfRole !== 'EXTROVERT') return false;
  const self = state.selfId ? state.players?.[state.selfId] : null;
  return Boolean(self?.alive);
}

export function selectInvestigateCandidates(state) {
  if (!state.players) return [];
  return Object.values(state.players)
    .filter((p) => p.alive && p.playerId !== state.selfId)
    .sort((a, b) => {
      const nameCmp = (a.displayName ?? '').localeCompare(b.displayName ?? '');
      return nameCmp !== 0 ? nameCmp : a.playerId.localeCompare(b.playerId);
    });
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

