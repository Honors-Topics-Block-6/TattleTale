# Frontend Game UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-game frontend UI — chat, voting, phase displays, DM windows, elimination sequence, spectator mode, win screen — integrated into the existing retro XP desktop OS.

**Architecture:** Single Zustand+Immer game store drives all UI. WebSocket events from the server flow into the store via a listener hook. The OS itself reacts to game phase (wallpaper, taskbar tint). TattleStation is the main game window; DMs pop out as separate windows.

**Tech Stack:** React 19, Zustand 5 + Immer, Vite, CSS custom properties, existing XP theme system, existing `game-socket.js` WebSocket client.

**Spec:** `docs/superpowers/specs/2026-04-09-frontend-game-ui-design.md`

---

## Phase 1: Foundation (Tasks 1-4)

Everything else depends on these. Must be completed first.

---

### Task 1: Extend Shared Contracts

**Files:**
- Modify: `packages/shared/src/contracts/events.ts`
- Modify: `packages/shared/src/contracts/views.ts`
- Modify: `packages/shared/src/enums.ts` (no changes needed, but read for reference)

- [ ] **Step 1: Add new server push events and payload types to events.ts**

Open `packages/shared/src/contracts/events.ts`. Add the new event keys and payload types:

```typescript
// Add these imports at the top (alongside existing ones)
import type { Team } from '../enums.js';

// Add these new payload interfaces BEFORE the SOCKET_EVENTS constant:

export interface ChannelMessagePayload {
  channelId: string;
  message: {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: string;
  };
}

export interface PlayerEliminatedPayload {
  playerId: string;
  cause: 'VOTED_OUT' | 'NIGHT_KILL';
  cycle: number;
}
```

Then add the two new keys inside `SOCKET_EVENTS.server`:

```typescript
export const SOCKET_EVENTS = {
  client: {
    // ... existing keys unchanged ...
  },
  server: {
    ready: 'system:ready',
    lobbyState: 'lobby:state',
    sessionState: 'session:state',
    commandError: 'command:error',
    channelMessage: 'channel:message',       // NEW
    playerEliminated: 'player:eliminated',   // NEW
  },
} as const;
```

Then add the new payloads to `ServerPushPayloads`:

```typescript
export interface ServerPushPayloads {
  [SOCKET_EVENTS.server.ready]: SocketReadyPayload;
  [SOCKET_EVENTS.server.lobbyState]: LobbyView;
  [SOCKET_EVENTS.server.sessionState]: SessionView;
  [SOCKET_EVENTS.server.commandError]: CommandErrorPayload;
  [SOCKET_EVENTS.server.channelMessage]: ChannelMessagePayload;           // NEW
  [SOCKET_EVENTS.server.playerEliminated]: PlayerEliminatedPayload;       // NEW
}
```

- [ ] **Step 2: Extend views.ts with PlayerSessionView and related types**

Open `packages/shared/src/contracts/views.ts`. Add the new interfaces and extend the existing one:

```typescript
// Add after the existing SessionPlayerView interface:

export interface PlayerSessionPlayerView extends SessionPlayerView {
  role?: string;
  team?: Team;
}

// Add the new player-specific session view after SessionView:

export interface PlayerSessionView {
  gameId: string;
  lobbyCode: string;
  status: SessionStatus;
  phase: Phase;
  cycle: number;
  currentPhaseEndsAt: string | null;
  phaseDurationSeconds: number;
  players: PlayerSessionPlayerView[];
  channels: ChannelView[];
  myPendingIntentTypes: IntentType[];
  systemEvents: SystemEventView[];
  myRole: string;
  myTeam: Team;
  voteTally: Record<string, number> | null;
}
```

Note: The existing `PlayerSessionView` interface in views.ts (lines 92-105) already has most of these fields. Check whether it matches the above. If it does, just add `phaseDurationSeconds` and `voteTally` fields and change `players` to use `PlayerSessionPlayerView[]`. If it differs, update it to match. Also add the `PlayerSessionPlayerView` interface.

- [ ] **Step 3: Verify the shared package builds**

Run:
```bash
cd packages/shared && npm run build
```
Expected: Clean build with no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/contracts/events.ts packages/shared/src/contracts/views.ts
git commit -m "feat(shared): add channel:message, player:eliminated events and PlayerSessionView extensions"
```

---

### Task 2: Create the Game Store

**Files:**
- Create: `apps/web/src/stores/gameStore.js`
- Test: Manual — store can be imported and actions called

- [ ] **Step 1: Create the game store file**

Create `apps/web/src/stores/gameStore.js`:

```javascript
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

  // Vote slice
  pendingSelection: null,
  confirmedVote: null,
  voteTally: null,

  // Session slice
  gameId: '',
  lobbyCode: '',
  status: 'ACTIVE',
  systemEvents: [],
  pendingIntentTypes: [],
  eliminationCause: null,
  eliminationCycle: null,
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

    // --- Session actions ---

    setElimination: (cause, cycle) =>
      set((state) => {
        state.eliminationCause = cause;
        state.eliminationCycle = cycle;
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
```

- [ ] **Step 2: Verify the store imports cleanly**

Add a temporary import in `apps/web/src/App.jsx` to verify:

```javascript
import useGameStore from './stores/gameStore';
```

Run:
```bash
cd apps/web && npx vite build --mode development 2>&1 | head -20
```
Expected: No import errors. Then remove the temporary import.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/stores/gameStore.js
git commit -m "feat(web): add game store with Zustand+Immer (phase, players, channels, vote, session slices)"
```

---

### Task 3: Create the Phase Timer Hook

**Files:**
- Create: `apps/web/src/hooks/usePhaseTimer.js`

- [ ] **Step 1: Create the phase timer hook**

Create `apps/web/src/hooks/usePhaseTimer.js`:

```javascript
import { useEffect, useRef } from 'react';
import useGameStore from '../stores/gameStore';

export default function usePhaseTimer() {
  const phaseEndsAt = useGameStore((s) => s.phaseEndsAt);
  const setTimeRemaining = useGameStore((s) => s.setTimeRemaining);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!phaseEndsAt) {
      setTimeRemaining(0);
      return;
    }

    const endMs = Date.parse(phaseEndsAt);

    const tick = () => {
      const remaining = Math.max(0, (endMs - Date.now()) / 1000);
      setTimeRemaining(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [phaseEndsAt, setTimeRemaining]);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/usePhaseTimer.js
git commit -m "feat(web): add usePhaseTimer hook (requestAnimationFrame countdown)"
```

---

### Task 4: Create the Game Socket Hook & Wire to Store

**Files:**
- Create: `apps/web/src/hooks/useGameSocket.js`
- Modify: `apps/web/src/App.jsx`

- [ ] **Step 1: Create a SocketContext for threading the socket to app components**

The existing `Window.jsx` renders app components as `<AppComponent windowId={windowId} />` — it only passes `windowId`. TattleStation and DMWindow need the socket. Rather than modifying Window.jsx, create a React context.

Create `apps/web/src/lib/SocketContext.js`:

```javascript
import { createContext, useContext } from 'react';

export const SocketContext = createContext(null);

export function useSocket() {
  return useContext(SocketContext);
}
```

- [ ] **Step 2: Create the socket listener hook**

Create `apps/web/src/hooks/useGameSocket.js`:

```javascript
import { useEffect, useRef } from 'react';
import useGameStore from '../stores/gameStore';

export default function useGameSocket(socket) {
  const syncSessionState = useGameStore((s) => s.syncSessionState);
  const addMessage = useGameStore((s) => s.addMessage);
  const incrementUnread = useGameStore((s) => s.incrementUnread);
  const setElimination = useGameStore((s) => s.setElimination);
  const prepareForReconnect = useGameStore((s) => s.prepareForReconnect);

  // Use a ref so the handler always reads the latest store state
  // without re-registering listeners on every render
  const storeRef = useRef(useGameStore);

  useEffect(() => {
    if (!socket) return;

    const handleSessionState = (payload) => {
      syncSessionState(payload);
    };

    const handleChannelMessage = (payload) => {
      const { channelId, message } = payload;
      addMessage(channelId, message);

      // Check if this channel's window is focused — for now, always
      // increment unread. The UI components will call markRead when focused.
      const state = storeRef.current.getState();
      if (channelId !== findGlobalChannelId(state.channels)) {
        incrementUnread(channelId);
      }
    };

    const handlePlayerEliminated = (payload) => {
      const state = storeRef.current.getState();
      // Only trigger if this is a new elimination (not a replay)
      if (
        state.eliminationCycle === null ||
        payload.cycle > state.eliminationCycle
      ) {
        setElimination(payload.cause, payload.cycle);
      }
    };

    const handleReconnect = () => {
      prepareForReconnect();
    };

    socket.on('session:state', handleSessionState);
    socket.on('channel:message', handleChannelMessage);
    socket.on('player:eliminated', handlePlayerEliminated);
    socket.onStateChange((newState) => {
      if (newState === 'reconnecting') {
        handleReconnect();
      }
    });

    return () => {
      socket.off('session:state', handleSessionState);
      socket.off('channel:message', handleChannelMessage);
      socket.off('player:eliminated', handlePlayerEliminated);
    };
  }, [socket, syncSessionState, addMessage, incrementUnread, setElimination, prepareForReconnect]);
}

function findGlobalChannelId(channels) {
  for (const [id, ch] of Object.entries(channels)) {
    if (ch.type === 'GLOBAL') return id;
  }
  return null;
}
```

- [ ] **Step 3: Update App.jsx to wire the socket and manage game state transitions**

Replace the contents of `apps/web/src/App.jsx`:

```javascript
import { useState, useRef } from 'react';
import Lobby from './Lobby';
import OS from './os/OS';
import useGameStore from './stores/gameStore';
import useGameSocket from './hooks/useGameSocket';
import usePhaseTimer from './hooks/usePhaseTimer';
import { GameSocket } from './lib/game-socket';
import { SocketContext } from './lib/SocketContext';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8787';

function App() {
  const [inGame, setInGame] = useState(false);
  const socketRef = useRef(null);
  const resetGame = useGameStore((s) => s.resetGame);

  // Initialize socket once
  if (!socketRef.current) {
    socketRef.current = new GameSocket();
    socketRef.current.connect(SOCKET_URL);
  }

  // Wire socket events to game store
  useGameSocket(socketRef.current);

  // Run the phase timer
  usePhaseTimer();

  const handleGameStart = (playerSessionView) => {
    useGameStore.getState().selfId =
      socketRef.current.credentials?.playerId || '';
    useGameStore.getState().syncSessionState(playerSessionView);
    setInGame(true);
  };

  const handleReturnToLobby = () => {
    resetGame();
    setInGame(false);
  };

  if (!inGame) {
    return <Lobby socket={socketRef.current} onGameStart={handleGameStart} />;
  }

  return (
    <SocketContext.Provider value={socketRef.current}>
      <OS onReturnToLobby={handleReturnToLobby} />
    </SocketContext.Provider>
  );
}

export default App;
```

Note: The existing `Lobby` component only accepts `onStart`. This change passes `socket` and `onGameStart` props instead. The Lobby will need to be updated in a later task to actually use the socket for lobby management. For now, the important thing is that the App→OS transition is wired to game state.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/SocketContext.js apps/web/src/hooks/useGameSocket.js apps/web/src/App.jsx
git commit -m "feat(web): add SocketContext, useGameSocket hook, wire App.jsx to game store and socket"
```

---

## Phase 2: Core Gameplay UI (Tasks 5-10)

These build the visible game interface. Depends on Phase 1.

---

### Task 5: Create PhaseHeader Component

**Files:**
- Create: `apps/web/src/apps/TattleStation/PhaseHeader.jsx`

- [ ] **Step 1: Create PhaseHeader**

Create `apps/web/src/apps/TattleStation/PhaseHeader.jsx`:

```javascript
import useGameStore from '../../stores/gameStore';

const PHASE_LABELS = {
  DAY_OPEN: 'Open Discussion',
  DAY_VOTE: 'Vote',
  DAY_RESOLVE: 'Day Results',
  NIGHT_ACTIONS: 'Night',
  NIGHT_RESOLVE: 'Night Results',
  NIGHT_REVEAL: 'Dawn',
};

export default function PhaseHeader() {
  const phase = useGameStore((s) => s.phase);
  const cycle = useGameStore((s) => s.cycle);
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const phaseDurationSeconds = useGameStore((s) => s.phaseDurationSeconds);

  const label = PHASE_LABELS[phase] || phase || 'Waiting';
  const isDay = phase?.startsWith('DAY');
  const cycleLabel = isDay ? `Day ${cycle}` : `Night ${cycle}`;

  const fraction =
    phaseDurationSeconds > 0 ? timeRemaining / phaseDurationSeconds : 1;
  const percent = Math.max(0, Math.min(100, fraction * 100));

  let barColor = '#4caf50'; // green
  if (fraction < 0.15) barColor = '#f44336'; // red
  else if (fraction < 0.5) barColor = '#ff9800'; // yellow

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div
      style={{
        padding: '4px 8px',
        background: '#ece9d8',
        borderBottom: '1px solid #aca899',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 3,
        }}
      >
        <span style={{ fontWeight: 'bold' }}>
          {cycleLabel} — {label}
        </span>
        <span style={{ color: fraction < 0.15 ? '#f44336' : '#555' }}>
          {timeDisplay}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: '#d4d0c8',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: barColor,
            transition: 'width 0.3s linear, background-color 0.5s ease',
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/apps/TattleStation/PhaseHeader.jsx
git commit -m "feat(web): add PhaseHeader component with timer progress bar"
```

---

### Task 6: Create PlayerList Component

**Files:**
- Create: `apps/web/src/apps/TattleStation/PlayerList.jsx`

- [ ] **Step 1: Create PlayerList**

Create `apps/web/src/apps/TattleStation/PlayerList.jsx`:

```javascript
import useGameStore from '../../stores/gameStore';

export default function PlayerList() {
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);

  const playerEntries = Object.entries(players);

  return (
    <div
      style={{
        width: 160,
        minWidth: 160,
        borderRight: '1px solid #aca899',
        background: '#f5f3ee',
        overflowY: 'auto',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
        padding: 4,
      }}
    >
      <div
        style={{
          fontWeight: 'bold',
          padding: '4px 6px',
          borderBottom: '1px solid #d4d0c8',
          marginBottom: 4,
          color: '#0054e3',
        }}
      >
        Players ({playerEntries.length})
      </div>
      {playerEntries.map(([id, player]) => {
        const isSelf = id === selfId;
        const isDead = !player.alive;
        const isDisconnected = !player.connected;

        let nameStyle = { padding: '3px 6px', display: 'block' };
        if (isSelf) {
          nameStyle.background = 'rgba(49, 106, 197, 0.1)';
          nameStyle.borderRadius = 2;
        }
        if (isDead) {
          nameStyle.textDecoration = 'line-through';
          nameStyle.color = '#999';
        } else if (isDisconnected) {
          nameStyle.fontStyle = 'italic';
          nameStyle.color = '#aaa';
        }

        return (
          <div key={id} style={nameStyle}>
            {player.displayName}
            {isSelf && ' (you)'}
            {isDead && ' [dead]'}
            {!isDead && isDisconnected && ' [offline]'}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/apps/TattleStation/PlayerList.jsx
git commit -m "feat(web): add PlayerList sidebar component"
```

---

### Task 7: Create ChatPanel Component

**Files:**
- Create: `apps/web/src/apps/TattleStation/ChatPanel.jsx`

- [ ] **Step 1: Create ChatPanel**

Create `apps/web/src/apps/TattleStation/ChatPanel.jsx`:

```javascript
import { useState, useRef, useEffect } from 'react';
import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function ChatPanel({ channelId }) {
  const socket = useSocket();
  const channel = useGameStore((s) => s.channels[channelId]);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const selfId = useGameStore((s) => s.selfId);
  const lobbyCode = useGameStore((s) => s.lobbyCode);
  const gameId = useGameStore((s) => s.gameId);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const messages = channel?.messages || [];
  const isLocked = channel?.locked ?? false;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const content = inputValue.trim();
    if (!content || isLocked || !selfAlive) return;

    socket.send('game:submit-intent', {
      lobbyCode,
      gameId,
      playerId: selfId,
      reconnectToken: socket.credentials?.reconnectToken || '',
      intent: {
        type: 'SEND_MESSAGE',
        payload: { channelId, content },
        clientTimestamp: new Date().toISOString(),
      },
    });

    setInputValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
      }}
    >
      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 6,
          background: '#fff',
          border: '1px inset #aca899',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#999', fontStyle: 'italic', padding: 8 }}>
            No messages yet.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 4 }}>
            <span
              style={{
                fontWeight: 'bold',
                color: msg.senderId === selfId ? '#0054e3' : '#333',
              }}
            >
              {msg.senderName}
            </span>
            <span style={{ color: '#999', marginLeft: 6, fontSize: 10 }}>
              {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
            <div style={{ marginLeft: 2 }}>{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {selfAlive && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: '#ece9d8',
            borderTop: '1px solid #aca899',
          }}
        >
          {isLocked ? (
            <div
              style={{
                flex: 1,
                padding: '4px 8px',
                color: '#999',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>🔒</span> Channel locked
            </div>
          ) : (
            <>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: '3px 6px',
                  fontFamily: 'Tahoma, sans-serif',
                  fontSize: 11,
                  border: '1px solid #7f9db9',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                style={{
                  padding: '2px 10px',
                  fontFamily: 'Tahoma, sans-serif',
                  fontSize: 11,
                  border: '1px solid #7f9db9',
                  background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                  cursor: 'pointer',
                }}
              >
                Send
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/apps/TattleStation/ChatPanel.jsx
git commit -m "feat(web): add ChatPanel component with message list, input, and lock state"
```

---

### Task 8: Create VotePanel Component

**Files:**
- Create: `apps/web/src/apps/TattleStation/VotePanel.jsx`

- [ ] **Step 1: Create VotePanel**

Create `apps/web/src/apps/TattleStation/VotePanel.jsx`:

```javascript
import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function VotePanel() {
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const pendingSelection = useGameStore((s) => s.pendingSelection);
  const confirmedVote = useGameStore((s) => s.confirmedVote);
  const voteTally = useGameStore((s) => s.voteTally);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const confirmVote = useGameStore((s) => s.confirmVote);
  const lobbyCode = useGameStore((s) => s.lobbyCode);
  const gameId = useGameStore((s) => s.gameId);

  const voteableEntries = Object.entries(players).filter(
    ([id, p]) => id !== selfId && p.alive
  );

  const handleConfirm = () => {
    if (!pendingSelection || confirmedVote !== null) return;
    confirmVote();

    socket.send('game:submit-intent', {
      lobbyCode,
      gameId,
      playerId: selfId,
      reconnectToken: socket.credentials?.reconnectToken || '',
      intent: {
        type: 'SUBMIT_VOTE',
        payload: { targetPlayerId: pendingSelection },
        clientTimestamp: new Date().toISOString(),
      },
    });
  };

  const confirmedTargetInvalid =
    confirmedVote !== null &&
    (!players[confirmedVote]?.connected || !players[confirmedVote]?.alive);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
        padding: 8,
        background: '#fff',
        overflowY: 'auto',
      }}
    >
      {/* Tally display */}
      {voteTally && (
        <div
          style={{
            marginBottom: 8,
            padding: 6,
            background: '#f5f3ee',
            border: '1px solid #d4d0c8',
            borderRadius: 2,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Vote Tally</div>
          {Object.entries(voteTally).map(([playerId, count]) => (
            <div key={playerId} style={{ display: 'flex', gap: 6 }}>
              <span>{players[playerId]?.displayName || playerId}:</span>
              <span style={{ fontWeight: 'bold' }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Invalidation notice */}
      {confirmedTargetInvalid && (
        <div
          style={{
            padding: 6,
            marginBottom: 8,
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 2,
            color: '#856404',
          }}
        >
          Your vote target disconnected. The server will resolve this.
        </div>
      )}

      {/* Player grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {voteableEntries.map(([id, player]) => {
          const isPending = pendingSelection === id && confirmedVote === null;
          const isConfirmed = confirmedVote === id;
          const isDisconnected = !player.connected;

          let borderColor = '#d4d0c8';
          let bgColor = '#fff';
          if (isConfirmed) {
            borderColor = '#4caf50';
            bgColor = '#e8f5e9';
          } else if (isPending) {
            borderColor = '#ff9800';
            bgColor = '#fff8e1';
          }

          return (
            <button
              key={id}
              onClick={() => !confirmedVote && selectPlayer(id)}
              disabled={!!confirmedVote || isDisconnected}
              style={{
                padding: '8px 12px',
                border: `2px solid ${borderColor}`,
                borderRadius: 3,
                background: bgColor,
                cursor: confirmedVote ? 'default' : 'pointer',
                fontFamily: 'Tahoma, sans-serif',
                fontSize: 11,
                opacity: isDisconnected ? 0.5 : 1,
                textDecoration: isDisconnected ? 'line-through' : 'none',
              }}
            >
              {player.displayName}
              {isDisconnected && ' (disconnected)'}
              {isConfirmed && ' ✓'}
            </button>
          );
        })}
      </div>

      {/* Confirm button */}
      {confirmedVote === null && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button
            onClick={handleConfirm}
            disabled={!pendingSelection}
            style={{
              padding: '6px 24px',
              fontFamily: 'Tahoma, sans-serif',
              fontSize: 12,
              fontWeight: 'bold',
              border: '1px solid #7f9db9',
              background: pendingSelection
                ? 'linear-gradient(to bottom, #ffffff, #d9e4f6)'
                : '#ece9d8',
              cursor: pendingSelection ? 'pointer' : 'default',
              borderRadius: 2,
            }}
          >
            Confirm Vote
          </button>
          {pendingSelection && (
            <div style={{ marginTop: 4, color: '#555' }}>
              Voting for: {players[pendingSelection]?.displayName}
            </div>
          )}
        </div>
      )}

      {confirmedVote !== null && !confirmedTargetInvalid && (
        <div
          style={{ marginTop: 12, textAlign: 'center', color: '#4caf50' }}
        >
          Vote locked in for {players[confirmedVote]?.displayName}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/apps/TattleStation/VotePanel.jsx
git commit -m "feat(web): add VotePanel with select-confirm interaction and tally display"
```

---

### Task 9: Create TattleStation App

**Files:**
- Create: `apps/web/src/apps/TattleStation/index.jsx`
- Modify: `apps/web/src/os/config/apps.config.js`

- [ ] **Step 1: Create the TattleStation component**

Create `apps/web/src/apps/TattleStation/index.jsx`:

```javascript
import useGameStore from '../../stores/gameStore';
import PhaseHeader from './PhaseHeader';
import PlayerList from './PlayerList';
import ChatPanel from './ChatPanel';
import VotePanel from './VotePanel';

function TattleStationComponent({ windowId }) {
  const phase = useGameStore((s) => s.phase);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const channels = useGameStore((s) => s.channels);
  const systemEvents = useGameStore((s) => s.systemEvents);

  // Find the GLOBAL channel id
  const globalChannelId = Object.keys(channels).find(
    (id) => channels[id].type === 'GLOBAL'
  );

  const showVotePanel = phase === 'DAY_VOTE' && selfAlive;
  const showSystemEvents =
    phase === 'DAY_RESOLVE' ||
    phase === 'NIGHT_RESOLVE' ||
    phase === 'NIGHT_REVEAL';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'Tahoma, sans-serif',
      }}
    >
      <PhaseHeader />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <PlayerList />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {showVotePanel ? (
            <VotePanel />
          ) : showSystemEvents ? (
            <SystemEventFeed events={systemEvents} />
          ) : globalChannelId ? (
            <ChatPanel channelId={globalChannelId} />
          ) : (
            <div style={{ padding: 12, color: '#999' }}>
              Waiting for game to start...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemEventFeed({ events }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 8,
        background: '#fff',
        border: '1px inset #aca899',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
      }}
    >
      {events.length === 0 && (
        <div style={{ color: '#999', fontStyle: 'italic' }}>
          Waiting for results...
        </div>
      )}
      {events.map((event) => (
        <div
          key={event.id}
          style={{
            padding: '4px 0',
            borderBottom: '1px solid #f0f0f0',
            color: '#555',
          }}
        >
          <span style={{ color: '#999', marginRight: 6, fontSize: 10 }}>
            {new Date(event.createdAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          {event.type.replace(/_/g, ' ').toLowerCase()}
        </div>
      ))}
    </div>
  );
}

const tattleStationIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="2" width="28" height="24" rx="2" fill="#0054e3" stroke="#003d99" stroke-width="1"/>
    <rect x="4" y="4" width="24" height="18" fill="#fff"/>
    <rect x="6" y="6" width="8" height="14" fill="#e8f0fe"/>
    <rect x="16" y="6" width="10" height="6" fill="#f5f5f5" stroke="#ccc" stroke-width="0.5"/>
    <rect x="16" y="14" width="10" height="6" fill="#f5f5f5" stroke="#ccc" stroke-width="0.5"/>
    <rect x="10" y="26" width="12" height="4" fill="#c0c0c0"/>
    <rect x="8" y="30" width="16" height="1" fill="#999"/>
  </svg>
`);

const TattleStation = {
  id: 'tattle-station',
  name: 'TattleStation',
  icon: tattleStationIcon,
  component: TattleStationComponent,
  defaultWindow: {
    width: 700,
    height: 500,
    resizable: true,
    minWidth: 500,
    minHeight: 400,
  },
  desktopIcon: { show: false },
  startMenu: { show: false },
};

export default TattleStation;
```

- [ ] **Step 2: Register TattleStation in apps.config.js**

Open `apps/web/src/os/config/apps.config.js`. Add the import at the top with the other app imports:

```javascript
import TattleStation from '../../apps/TattleStation/index';
```

Then add to the `appRegistry` object:

```javascript
[TattleStation.id]: TattleStation,
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/apps/TattleStation/index.jsx apps/web/src/os/config/apps.config.js
git commit -m "feat(web): add TattleStation main game window with chat, vote, and system event views"
```

---

### Task 10: Create DMWindow App

**Files:**
- Create: `apps/web/src/apps/DMWindow/index.jsx`
- Modify: `apps/web/src/os/config/apps.config.js`

- [ ] **Step 1: Create DMWindow component**

Create `apps/web/src/apps/DMWindow/index.jsx`:

```javascript
import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';
import ChatPanel from '../TattleStation/ChatPanel';

function DMWindowComponent({ windowId, channelId }) {
  const channel = useGameStore((s) => s.channels[channelId]);

  if (!channel) {
    // Channel was removed from server state
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: 'Tahoma, sans-serif',
          fontSize: 11,
          color: '#999',
          padding: 24,
          textAlign: 'center',
        }}
      >
        This channel is no longer available.
      </div>
    );
  }

  return <ChatPanel channelId={channelId} socket={socket} />;
}

const dmIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="4" width="28" height="20" rx="3" fill="#fff" stroke="#8b5cf6" stroke-width="2"/>
    <path d="M6 28 L16 24 L10 24 Z" fill="#8b5cf6"/>
    <rect x="6" y="10" width="12" height="2" rx="1" fill="#ddd"/>
    <rect x="6" y="14" width="18" height="2" rx="1" fill="#ddd"/>
    <rect x="6" y="18" width="8" height="2" rx="1" fill="#ddd"/>
  </svg>
`);

const DMWindow = {
  id: 'dm-window',
  name: 'Direct Message',
  icon: dmIcon,
  component: DMWindowComponent,
  defaultWindow: {
    width: 350,
    height: 400,
    resizable: true,
    minWidth: 280,
    minHeight: 300,
  },
  desktopIcon: { show: false },
  startMenu: { show: false },
};

export default DMWindow;
```

- [ ] **Step 2: Register DMWindow in apps.config.js**

Add import and registration in `apps/web/src/os/config/apps.config.js`:

```javascript
import DMWindow from '../../apps/DMWindow/index';

// In appRegistry:
[DMWindow.id]: DMWindow,
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/apps/DMWindow/index.jsx apps/web/src/os/config/apps.config.js
git commit -m "feat(web): add DMWindow app for pop-out channel chats"
```

---

## Phase 3: Theming, Effects & Polish (Tasks 11-15)

Dramatic effects, OS theming, and game lifecycle. Depends on Phase 1, mostly independent of Phase 2.

---

### Task 11: Create Phase Theme CSS and useThemeEffect Hook

**Files:**
- Create: `apps/web/src/themes/xp/game-phases.css`
- Create: `apps/web/src/hooks/useThemeEffect.js`
- Modify: `apps/web/src/themes/xp/index.css`
- Modify: `apps/web/src/os/OS.jsx`

- [ ] **Step 1: Create game-phases.css**

Create `apps/web/src/themes/xp/game-phases.css`:

```css
/* Phase-specific theme overrides */

.xp-os {
  --os-wallpaper-transition: background 1.5s ease;
  --taskbar-transition: background 1.5s ease;
}

/* Day Open — default bright theme */
.xp-os.phase-day-open {
  /* Uses default wallpaper and taskbar — no overrides needed */
}

/* Day Vote — tension, amber tint */
.xp-os.phase-day-vote .xp-desktop {
  background-blend-mode: overlay;
  box-shadow: inset 0 0 200px rgba(255, 152, 0, 0.15);
}
.xp-os.phase-day-vote .xp-taskbar {
  background: linear-gradient(to bottom, #d5a831, #eb9b4a) !important;
}

/* Day Resolve — brief desaturation */
.xp-os.phase-day-resolve .xp-desktop {
  filter: saturate(0.6);
  transition: filter 0.5s ease;
}

/* Night Actions — dark mode */
.xp-os.phase-night-actions .xp-desktop {
  background: linear-gradient(to bottom, #0a0e27 0%, #1a1a3e 40%, #0d1b2a 100%) !important;
  background-size: cover !important;
}
.xp-os.phase-night-actions .xp-taskbar {
  background: linear-gradient(to bottom, #1a1a4e, #2d2d6e) !important;
}

/* Night Resolve — same dark, subtle flicker */
.xp-os.phase-night-resolve .xp-desktop {
  background: linear-gradient(to bottom, #0a0e27 0%, #1a1a3e 40%, #0d1b2a 100%) !important;
}
.xp-os.phase-night-resolve .xp-taskbar {
  background: linear-gradient(to bottom, #1a1a4e, #2d2d6e) !important;
}

/* Night Reveal — dawn transition */
.xp-os.phase-night-reveal .xp-desktop {
  background: linear-gradient(to bottom, #1a1a3e 0%, #3a6ea5 50%, #87ceeb 100%) !important;
  transition: background 2s ease;
}
.xp-os.phase-night-reveal .xp-taskbar {
  background: linear-gradient(to bottom, #2d4a8e, #4992eb) !important;
  transition: background 2s ease;
}

/* Spectator mode — desaturated safe mode */
.xp-os.spectator-mode {
  filter: saturate(0.4);
}
.xp-os.spectator-mode .xp-desktop {
  background: #1a1a2e !important;
}
.xp-os.spectator-mode .xp-taskbar {
  background: linear-gradient(to bottom, #555, #777) !important;
}

/* Safe Mode watermark */
.xp-os.spectator-mode::before,
.xp-os.spectator-mode::after {
  content: 'Safe Mode';
  position: fixed;
  color: rgba(255, 255, 255, 0.2);
  font-family: Tahoma, sans-serif;
  font-size: 18px;
  font-weight: bold;
  pointer-events: none;
  z-index: 99999;
}
.xp-os.spectator-mode::before {
  top: 10px;
  left: 10px;
}
.xp-os.spectator-mode::after {
  bottom: 50px;
  right: 10px;
}

/* Game frozen — win screen moment */
.xp-os.game-frozen .xp-window {
  pointer-events: none;
}
```

- [ ] **Step 2: Import game-phases.css in index.css**

Open `apps/web/src/themes/xp/index.css`. Add at the top, after the existing `@import './variables.css';`:

```css
@import './game-phases.css';
```

- [ ] **Step 3: Create useThemeEffect hook**

Create `apps/web/src/hooks/useThemeEffect.js`:

```javascript
import { useEffect } from 'react';
import useGameStore from '../stores/gameStore';

const PHASE_CLASSES = [
  'phase-day-open',
  'phase-day-vote',
  'phase-day-resolve',
  'phase-night-actions',
  'phase-night-resolve',
  'phase-night-reveal',
];

const PHASE_TO_CLASS = {
  DAY_OPEN: 'phase-day-open',
  DAY_VOTE: 'phase-day-vote',
  DAY_RESOLVE: 'phase-day-resolve',
  NIGHT_ACTIONS: 'phase-night-actions',
  NIGHT_RESOLVE: 'phase-night-resolve',
  NIGHT_REVEAL: 'phase-night-reveal',
};

export default function useThemeEffect() {
  const phase = useGameStore((s) => s.phase);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const status = useGameStore((s) => s.status);

  useEffect(() => {
    const osEl = document.querySelector('.xp-os');
    if (!osEl) return;

    // Remove all phase classes
    PHASE_CLASSES.forEach((cls) => osEl.classList.remove(cls));

    // Apply current phase class
    const cls = PHASE_TO_CLASS[phase];
    if (cls) osEl.classList.add(cls);

    return () => {
      PHASE_CLASSES.forEach((c) => osEl.classList.remove(c));
    };
  }, [phase]);

  // Spectator mode
  useEffect(() => {
    const osEl = document.querySelector('.xp-os');
    if (!osEl) return;

    if (!selfAlive && status === 'ACTIVE') {
      osEl.classList.add('spectator-mode');
    } else {
      osEl.classList.remove('spectator-mode');
    }

    return () => osEl.classList.remove('spectator-mode');
  }, [selfAlive, status]);

  // Game frozen (win screen)
  useEffect(() => {
    const osEl = document.querySelector('.xp-os');
    if (!osEl) return;

    if (status === 'FRIENDS_WIN' || status === 'HACKERS_WIN') {
      osEl.classList.add('game-frozen');
    } else {
      osEl.classList.remove('game-frozen');
    }

    return () => osEl.classList.remove('game-frozen');
  }, [status]);
}
```

- [ ] **Step 4: Wire useThemeEffect into OS.jsx**

Open `apps/web/src/os/OS.jsx`. Add the import:

```javascript
import useThemeEffect from '../hooks/useThemeEffect';
```

Then add the hook call at the top of the `OS` function body, right after the existing `useWindowStore` calls:

```javascript
useThemeEffect();
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/themes/xp/game-phases.css apps/web/src/themes/xp/index.css apps/web/src/hooks/useThemeEffect.js apps/web/src/os/OS.jsx
git commit -m "feat(web): add phase theming system with day/night wallpapers, spectator mode, and game-frozen states"
```

---

### Task 12: Update Clock for Phase Timer

**Files:**
- Modify: `apps/web/src/os/components/Taskbar/Clock.jsx`

- [ ] **Step 1: Update Clock to show phase countdown**

Replace `apps/web/src/os/components/Taskbar/Clock.jsx`:

```javascript
import { useState, useEffect, useRef } from 'react';
import useGameStore from '../../../stores/gameStore';

export default function Clock() {
  const [time, setTime] = useState(new Date());
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const isUrgent = useGameStore((s) => s.isUrgent);
  const phase = useGameStore((s) => s.phase);

  // Urgency pulse animation state
  const [pulseCount, setPulseCount] = useState(0);
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Urgency pulse: 2 pulses, 5s pause, max 3 cycles
  useEffect(() => {
    if (!isUrgent) {
      setPulseCount(0);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      return;
    }

    if (pulseCount >= 6) return; // 3 cycles of 2 pulses = 6 total

    const doPulse = () => {
      setPulseCount((c) => c + 1);
    };

    // 2 pulses (0.5s on, 0.5s off each = 2s), then 5s pause
    const inCycle = pulseCount % 2;
    const delay = inCycle === 1 ? 5000 : 1000; // After 2nd pulse, 5s pause

    pulseTimerRef.current = setTimeout(doPulse, delay);
    return () => clearTimeout(pulseTimerRef.current);
  }, [isUrgent, pulseCount]);

  // Format phase timer
  const inGame = phase !== null;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  const phaseTimer = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const isPulsing = isUrgent && pulseCount < 6 && pulseCount % 2 === 0;

  return (
    <div className="xp-clock" style={{
      color: isUrgent ? '#f44336' : undefined,
      opacity: isPulsing ? 0.5 : 1,
      transition: 'opacity 0.5s ease, color 0.3s ease',
    }}>
      {inGame ? phaseTimer : formattedTime}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/os/components/Taskbar/Clock.jsx
git commit -m "feat(web): update Clock to show phase countdown timer with urgency pulses"
```

---

### Task 13: Create EliminationSequence Components

**Files:**
- Create: `apps/web/src/components/EliminationSequence/BSODScreen.jsx`
- Create: `apps/web/src/components/EliminationSequence/index.jsx`

- [ ] **Step 1: Create BSODScreen**

Create `apps/web/src/components/EliminationSequence/BSODScreen.jsx`:

```javascript
const BSOD_VARIANTS = {
  VOTED_OUT: [
    { name: 'TRUST_VIOLATION_FATAL', stop: '0x000000FE', sys: 'socialnet.sys', desc: 'Session terminated by network vote', weight: 3 },
    { name: 'SOCIAL_ENGINEERING_SUCCESS', stop: '0x00000C04', sys: 'consensus.sys', desc: 'Majority override engaged', weight: 3 },
    { name: 'CONNECTION_TERMINATED_BY_HOST', stop: '0x0000DEAD', sys: 'groupchat.sys', desc: 'User removed by collective decision', weight: 2 },
    { name: 'HACKER_INTRUSION_DETECTED', stop: '0x00BADFED', sys: 'firewall.sys', desc: 'Unauthorized access detected', weight: 1 },
    { name: 'FIREWALL_BREACH', stop: '0x000000BE', sys: 'defense.sys', desc: 'Perimeter compromised', weight: 1 },
    { name: 'ROOTKIT_INSTALLED', stop: '0x00C0FFEE', sys: 'kernel.sys', desc: 'System integrity violation', weight: 1 },
  ],
  NIGHT_KILL: [
    { name: 'TRUST_VIOLATION_FATAL', stop: '0x000000FE', sys: 'socialnet.sys', desc: 'Session terminated by network vote', weight: 1 },
    { name: 'SOCIAL_ENGINEERING_SUCCESS', stop: '0x00000C04', sys: 'consensus.sys', desc: 'Majority override engaged', weight: 1 },
    { name: 'CONNECTION_TERMINATED_BY_HOST', stop: '0x0000DEAD', sys: 'groupchat.sys', desc: 'User removed by collective decision', weight: 1 },
    { name: 'HACKER_INTRUSION_DETECTED', stop: '0x00BADFED', sys: 'firewall.sys', desc: 'Unauthorized access detected', weight: 3 },
    { name: 'FIREWALL_BREACH', stop: '0x000000BE', sys: 'defense.sys', desc: 'Perimeter compromised', weight: 3 },
    { name: 'ROOTKIT_INSTALLED', stop: '0x00C0FFEE', sys: 'kernel.sys', desc: 'System integrity violation', weight: 3 },
  ],
};

function pickWeighted(variants) {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const v of variants) {
    roll -= v.weight;
    if (roll <= 0) return v;
  }
  return variants[variants.length - 1];
}

export default function BSODScreen({ cause }) {
  const variants = BSOD_VARIANTS[cause] || BSOD_VARIANTS.NIGHT_KILL;
  const variant = pickWeighted(variants);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0000AA',
        color: '#fff',
        fontFamily: '"Lucida Console", "Courier New", monospace',
        fontSize: 14,
        padding: '10% 15%',
        zIndex: 200000,
        whiteSpace: 'pre-wrap',
        lineHeight: 1.6,
      }}
    >
      {`A problem has been detected and TattleTale has been shut down to protect your network.

${variant.name}

*** STOP: ${variant.stop} (0xDEADBEEF, 0x00000001, 0x00000000)

Technical Information:
*** ${variant.sys} — ${variant.desc}

Beginning memory dump... Complete.
Contact your system administrator for help.`}
    </div>
  );
}
```

- [ ] **Step 2: Create EliminationSequence orchestrator**

Create `apps/web/src/components/EliminationSequence/index.jsx`:

```javascript
import { useState, useEffect } from 'react';
import BSODScreen from './BSODScreen';

const GLITCH_DURATION = 2000;
const BSOD_DURATION = 3000;
const REBOOT_DURATION = 2000;

export default function EliminationSequence({ cause, onComplete }) {
  const [stage, setStage] = useState('glitch'); // glitch → bsod → reboot → done

  useEffect(() => {
    const timers = [];

    timers.push(
      setTimeout(() => setStage('bsod'), GLITCH_DURATION)
    );
    timers.push(
      setTimeout(() => setStage('reboot'), GLITCH_DURATION + BSOD_DURATION)
    );
    timers.push(
      setTimeout(() => {
        setStage('done');
        onComplete();
      }, GLITCH_DURATION + BSOD_DURATION + REBOOT_DURATION)
    );

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (stage === 'done') return null;

  if (stage === 'glitch') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200000,
          background: 'transparent',
          pointerEvents: 'none',
          animation: 'glitch-flicker 0.1s infinite',
        }}
      >
        <style>{`
          @keyframes glitch-flicker {
            0% { opacity: 1; }
            20% { opacity: 0.4; filter: hue-rotate(90deg); }
            40% { opacity: 1; transform: translateX(3px); }
            60% { opacity: 0.6; transform: translateX(-5px); }
            80% { opacity: 1; filter: saturate(2); }
            100% { opacity: 0.8; }
          }
        `}</style>
        {/* Static noise overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E")`,
            opacity: 0.5,
            mixBlendMode: 'overlay',
          }}
        />
      </div>
    );
  }

  if (stage === 'bsod') {
    return <BSODScreen cause={cause} />;
  }

  if (stage === 'reboot') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          color: '#ccc',
          fontFamily: '"Lucida Console", "Courier New", monospace',
          fontSize: 13,
          padding: '5% 10%',
          zIndex: 200000,
          whiteSpace: 'pre-wrap',
        }}
      >
        <RebootText />
      </div>
    );
  }

  return null;
}

function RebootText() {
  const [lines, setLines] = useState([]);
  const bootLines = [
    'TattleTale BIOS v2.1',
    'Checking system integrity...',
    'Memory test: 640K OK',
    'Attempting network recovery... FAILED',
    '',
    'Loading Safe Mode...',
  ];

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < bootLines.length) {
        setLines((prev) => [...prev, bootLines[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return lines.map((line, i) => <div key={i}>{line}</div>);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/EliminationSequence/
git commit -m "feat(web): add EliminationSequence with BSOD variants, glitch, and reboot stages"
```

---

### Task 14: Create WinScreen Component

**Files:**
- Create: `apps/web/src/components/WinScreen/index.jsx`

- [ ] **Step 1: Create WinScreen**

Create `apps/web/src/components/WinScreen/index.jsx`:

```javascript
import useGameStore from '../../stores/gameStore';

export default function WinScreen({ onReturnToLobby }) {
  const status = useGameStore((s) => s.status);
  const players = useGameStore((s) => s.players);
  const selfTeam = useGameStore((s) => s.selfTeam);
  const cycle = useGameStore((s) => s.cycle);

  if (status !== 'FRIENDS_WIN' && status !== 'HACKERS_WIN') return null;

  const winningTeam = status === 'FRIENDS_WIN' ? 'Friends' : 'Hackers';
  const playerWon =
    (status === 'FRIENDS_WIN' && selfTeam === 'FRIENDS') ||
    (status === 'HACKERS_WIN' && selfTeam === 'HACKERS');

  const eliminatedCount = Object.values(players).filter(
    (p) => !p.alive
  ).length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150000,
        background: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          background: '#ece9d8',
          border: '3px solid #0054e3',
          borderRadius: '8px 8px 0 0',
          width: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Tahoma, sans-serif',
          boxShadow: '2px 2px 10px rgba(0,0,0,0.5)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: 'linear-gradient(to bottom, #0058e6, #3c82f7, #0058e6)',
            padding: '4px 8px',
            borderRadius: '6px 6px 0 0',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: 13,
            textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          }}
        >
          Game Over
        </div>

        {/* Content */}
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div
            style={{
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: playerWon ? '#4caf50' : '#f44336',
                marginBottom: 4,
              }}
            >
              {playerWon ? 'Victory!' : 'Defeat'}
            </div>
            <div style={{ fontSize: 14, color: '#555' }}>
              The {winningTeam} win!
            </div>
          </div>

          {/* Role reveal */}
          <div
            style={{
              border: '1px solid #d4d0c8',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                background: '#f5f3ee',
                padding: '4px 8px',
                fontWeight: 'bold',
                borderBottom: '1px solid #d4d0c8',
                fontSize: 11,
              }}
            >
              Role Reveal
            </div>
            <div style={{ padding: 8 }}>
              {Object.entries(players).map(([id, player]) => (
                <div
                  key={id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '3px 4px',
                    fontSize: 11,
                    borderBottom: '1px solid #f0f0f0',
                    color: player.alive ? '#333' : '#999',
                    textDecoration: player.alive ? 'none' : 'line-through',
                  }}
                >
                  <span>{player.displayName}</span>
                  <span
                    style={{
                      color:
                        player.team === 'HACKERS' ? '#f44336' : '#4caf50',
                      fontWeight: 'bold',
                    }}
                  >
                    {player.role || '?'} ({player.team === 'HACKERS' ? 'Hacker' : 'Friend'})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div
            style={{
              fontSize: 11,
              color: '#555',
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            Game lasted {cycle} cycles — {eliminatedCount} players eliminated
          </div>

          {/* Return button */}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={onReturnToLobby}
              style={{
                padding: '6px 24px',
                fontFamily: 'Tahoma, sans-serif',
                fontSize: 12,
                fontWeight: 'bold',
                border: '1px solid #7f9db9',
                background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/WinScreen/index.jsx
git commit -m "feat(web): add WinScreen with role reveal, stats, and return-to-lobby"
```

---

### Task 15: Wire EliminationSequence and WinScreen into OS.jsx

**Files:**
- Modify: `apps/web/src/os/OS.jsx`

- [ ] **Step 1: Add EliminationSequence and WinScreen to OS rendering**

Open `apps/web/src/os/OS.jsx`. Add imports at the top:

```javascript
import useGameStore from '../stores/gameStore';
import EliminationSequence from '../components/EliminationSequence/index';
import WinScreen from '../components/WinScreen/index';
```

Inside the `OS` function, add after the existing state hooks:

```javascript
const eliminationCause = useGameStore((s) => s.eliminationCause);
const eliminationCycle = useGameStore((s) => s.eliminationCycle);
const selfAlive = useGameStore((s) => s.selfAlive);
const status = useGameStore((s) => s.status);
const [eliminationPlayed, setEliminationPlayed] = useState(null); // cycle number or null

const showElimination =
  eliminationCause !== null &&
  !selfAlive &&
  eliminationCycle !== null &&
  eliminationPlayed !== eliminationCycle;

const handleEliminationComplete = () => {
  setEliminationPlayed(eliminationCycle);
};
```

Then in the JSX return, add after the `SideTaskModal` section (right before the closing `</div>`):

```jsx
{showElimination && (
  <EliminationSequence
    cause={eliminationCause}
    onComplete={handleEliminationComplete}
  />
)}

{(status === 'FRIENDS_WIN' || status === 'HACKERS_WIN') && (
  <WinScreen onReturnToLobby={onReturnToLobby} />
)}
```

Also update the `OS` function signature to accept the new prop:

```javascript
export default function OS({ wallpaper = defaultWallpaper, onReturnToLobby }) {
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/os/OS.jsx
git commit -m "feat(web): wire EliminationSequence and WinScreen into OS rendering"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Foundation | 1-4 | Shared contracts, game store, timer hook, socket→store wiring |
| 2: Core UI | 5-10 | PhaseHeader, PlayerList, ChatPanel, VotePanel, TattleStation, DMWindow |
| 3: Effects | 11-15 | Phase theming CSS, Clock timer, EliminationSequence, WinScreen, OS wiring |

**After Phase 3 completion:** The game has a playable frontend — players can see phase changes (with OS-wide theming), chat in global/DM channels, vote during DAY_VOTE, see elimination sequences with BSOD, spectate in Safe Mode, and see the win screen with role reveal.

**Not included (future work):**
- Role-specific night action windows (HackerConsole, SecurityScanner, etc.) — these follow the same app registration pattern and share a `useNightAction` hook. Add them incrementally per role.
- System tray notification bubbles on phase change
- DM auto-pop/blink logic in TaskbarApps (requires extending TaskbarApps to check unread counts and popHistory)
- Lobby screen integration with actual socket lobby management
