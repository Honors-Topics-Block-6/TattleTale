# Frontend Game UI — Design Spec

**Date:** 2026-04-09
**Scope:** Build the in-game frontend UI for TattleTale — chat interface, voting screen, phase displays, role action windows, elimination sequence, spectator mode, and win screen — all integrated into the existing retro XP desktop OS.

---

## 1. Overview & Approach

The game session UI lives *inside* the existing retro XP desktop OS. Instead of replacing the OS, the game extends it — the OS becomes the game world.

**Hybrid window model:** One main game window (TattleStation) handles global chat, voting, and phase info. Private messages and role channels pop out as separate windows (DMWindow). Role-specific night action apps open as uniquely themed windows. The desktop itself reacts to game state — wallpaper and taskbar shift with day/night phases.

**Architecture:** Single Zustand store with Immer slices. Frontend is a dumb terminal — it renders server state and submits intents. No client-side game logic.

---

## 2. Component Architecture

### 2.1 New Apps (registered in `apps.config.js`)

#### TattleStation
The main game window. Opens automatically when the game starts.

- **Layout:** Sidebar on the left (PlayerList + phase info), main area on the right (ChatPanel for global chat)
- **During DAY_VOTE:** The ChatPanel is replaced by VotePanel
- **During DAY_RESOLVE / NIGHT_RESOLVE / NIGHT_REVEAL:** Main area shows system event feed (who was eliminated, what happened)
- **Registration:** `desktopIcon: { show: false }` — opened programmatically, not from desktop
- **Default window size:** ~700x500, resizable, minWidth 500, minHeight 400

#### DMWindow
Lightweight chat window template for non-global channels. Multiple instances can coexist.

- **Styling varies by channel type:**
  - PRIVATE: Purple title bar, titled "DM — {PlayerName}"
  - ROLE: Red title bar for Hackers ("🔒 Hacker Channel"), green for Friends ("🛡 Friend Channel")
  - TEMP: Amber title bar, shows expiry countdown in title, titled "Temp — {GroupName}"
- **Registration:** `desktopIcon: { show: false }` — opened by game events
- **Default window size:** ~350x400, resizable, minWidth 280, minHeight 300

#### Role Night Action Apps
Each role gets a uniquely themed window for night actions. Opened automatically during NIGHT_ACTIONS for players with night abilities.

| Role | App ID | Window Title | Visual Theme |
|------|--------|-------------|--------------|
| Hacker | `hacker-console` | H4CK3R C0NSOLE | Black bg, green monospace text, scanline overlay |
| The Boss | `boss-command` | COMMAND CHANNEL | Black bg, gold text, shows hacker team choices |
| White Hat | `security-scanner` | Security Scanner | White/blue diagnostic UI, progress bars, shield icons |
| Psychic | `spirit-channel` | Spirit Channel | Dark purple bg, ethereal font, slow fade-in text |
| Signal Jammer | `freq-disruptor` | Freq Disruptor | Oscilloscope waveform bg, static noise aesthetic |
| Eavesdropper | `wire-tap` | Wire Tap | Dark UI, audio waveform visualizer, headphone icon |
| Security Specialist | `firewall-config` | Firewall Config | Corporate IT utility look, gray panels, dropdowns |

- **Registration:** All registered with `install: { requiresUnlock: true }`. Unlocked programmatically when role is assigned. `desktopIcon: { show: false }`.
- **Shared interaction pattern:** Player list of valid targets → click to select → confirm button → intent submitted → "Processing..." state → auto-close on phase exit

### 2.2 New Reusable Components

#### ChatPanel
Shared message list + input. Used inside TattleStation (global channel) and DMWindow (other channels).

- Message list: scrollable, auto-scrolls to bottom on new messages, shows sender name + timestamp
- Input: text field + send button at the bottom
- When channel is locked: input disabled, shows lock icon with "Channel locked" text
- Props: `channelId` — reads messages from the channels slice

#### PlayerList
Sidebar component showing all players and their status.

- Each entry shows: display name, alive/dead indicator, connected/disconnected indicator
- Alive players: normal text
- Dead players: strikethrough text, grayed out
- Disconnected players: italic, dimmed
- Current player highlighted subtly
- During DAY_VOTE: clicking a player name in the list is NOT how voting works (that's VotePanel) — the list is read-only context

#### VotePanel
Replaces ChatPanel in TattleStation during DAY_VOTE phase.

- **Player grid:** Grid of player entries (name + alive status), one per voteable player
- **Two-step interaction:**
  1. Click a player → highlighted as "pending selection" (yellow/amber border)
  2. Click "Confirm Vote" button → locks in the vote, sends `submitIntent` with `IntentType.SUBMIT_VOTE`
  3. Can change pending selection before confirming. Cannot change after confirming.
- **Tally display:** Bar at the top showing confirmed vote counts per player. Only confirmed votes are visible — no pending selections shown to anyone.
- **Submit payload:**
  ```typescript
  {
    type: IntentType.SUBMIT_VOTE,
    payload: { targetPlayerId: string | null }
  }
  ```

#### PhaseHeader
Thin bar at the top of TattleStation's main content area.

- Shows current phase name in readable form: "Open Discussion", "Vote", "Night", etc.
- Shows cycle number: "Day 3"
- Thin progress bar underneath that drains left-to-right, green → yellow → red as time runs low

#### EliminationSequence
Fullscreen overlay component. Triggered when `selfAlive` flips from true to false.

- z-index above everything (above SideTaskModal's 100000)
- Runs a timed sequence, then unmounts and applies `.spectator-mode` CSS class
- Only plays once per game. Reconnecting after death skips straight to Safe Mode.
- See Section 6 for full detail.

#### PhaseTransition (useThemeEffect hook)
Not a visible component — a hook running in OS.jsx that subscribes to game phase and applies OS-level theme changes.

- See Section 5 for full detail.

---

## 3. State Management — Game Store

Single Zustand store (`useGameStore`) using Immer middleware, organized into five logical slices.

### 3.1 Phase Slice

```typescript
{
  phase: Phase,              // Current phase enum
  cycle: number,             // Current game cycle
  phaseEndsAt: string | null, // ISO timestamp from server
  timeRemaining: number,     // Seconds, derived via requestAnimationFrame
  isUrgent: boolean,         // true when <15% time remains
}
```

- `timeRemaining` is computed client-side from `phaseEndsAt` using a `requestAnimationFrame` tick loop (not server-polled)
- `isUrgent` flips at 15% remaining based on the phase's total duration

### 3.2 Players Slice

```typescript
{
  players: Map<string, {     // playerId → player info
    displayName: string,
    alive: boolean,
    connected: boolean,
  }>,
  selfId: string,            // Local player's ID
  selfRole: string,          // Local player's assigned role
  selfTeam: Team,            // FRIENDS or HACKERS
  selfAlive: boolean,        // Quick accessor
}
```

- `selfRole` and `selfTeam` come from `PlayerSessionView.myRole` and `PlayerSessionView.myTeam`

### 3.3 Channels Slice

```typescript
{
  channels: Map<string, {
    id: string,
    type: ChannelType,
    members: string[],
    locked: boolean,
    expiresAt: Phase | null,
    messages: Array<{
      id: string,
      senderId: string,
      senderName: string,
      content: string,
      timestamp: string,
    }>,
  }>,
  activeChannelId: string,   // Currently displayed in TattleStation (defaults to GLOBAL)
  unreadCounts: Map<string, number>,
  popHistory: Set<string>,   // channelIds that have already auto-popped a window
}
```

**Actions:**
- `addMessage(channelId, msg)` — appends message, increments unread if window not focused
- `markRead(channelId)` — resets unread count to 0
- `setActiveChannel(channelId)` — switches TattleStation's displayed channel

### 3.4 Vote Slice

```typescript
{
  pendingSelection: string | null,  // playerId clicked but not confirmed
  confirmedVote: string | null,     // playerId locked in
  confirmedTally: Map<string, number>, // playerId → vote count (server-provided)
}
```

**Actions:**
- `selectPlayer(id)` — sets pending selection (only if not yet confirmed)
- `confirmVote()` — locks in pending selection, triggers `submitIntent`
- `clearVote()` — resets both (called on phase change away from DAY_VOTE)

### 3.5 Session Slice

```typescript
{
  gameId: string,
  lobbyCode: string,
  status: SessionStatus,        // ACTIVE, FRIENDS_WIN, HACKERS_WIN
  systemEvents: SystemEventView[],
  pendingIntentTypes: IntentType[],
}
```

### 3.6 Root Action: syncSessionState

```typescript
syncSessionState(view: PlayerSessionView) => {
  // Distributes incoming server state across all slices:
  // view.phase, view.cycle, view.currentPhaseEndsAt → phase slice
  // view.players → players slice
  // view.myRole, view.myTeam → players slice (selfRole, selfTeam)
  // view.channels → channels slice (merge, preserve local unread/popHistory)
  // view.myPendingIntentTypes → session slice
  // view.systemEvents → session slice
  // view.status → session slice (triggers win screen if FRIENDS_WIN or HACKERS_WIN)
  // view.gameId, view.lobbyCode → session slice
}
```

### 3.7 Selectors

Components use narrow selectors to minimize re-renders:
- `useGameStore(s => s.phase)` — PhaseHeader, useThemeEffect
- `useGameStore(s => s.players)` — PlayerList
- `useGameStore(s => s.channels.get(channelId)?.messages)` — ChatPanel (per channel)
- `useGameStore(s => s.confirmedTally)` — VotePanel tally display
- `useGameStore(s => s.selfAlive)` — EliminationSequence trigger
- `useGameStore(s => s.status)` — Win screen trigger
- `useGameStore(s => s.isUrgent)` — Timer urgency styling

---

## 4. WebSocket Integration

### 4.1 Connection Lifecycle

1. Player is in Lobby → clicks "Start Game" → server responds with `StartGameSuccess` containing initial `SessionView`
2. `App.jsx` detects lobby status is `IN_GAME` → transitions to OS → OS auto-opens TattleStation
3. `syncSessionState()` hydrates all store slices
4. Ongoing: server pushes `sessionState` on phase changes and state updates

### 4.2 Inbound Events (server → client)

| Event | Socket Key | Handler |
|-------|-----------|---------|
| Session state update | `session:state` | `syncSessionState(view)` — updates all slices. Detects phase changes (triggers theme transition), eliminations (triggers EliminationSequence), game end (triggers win screen). |
| Command error | `command:error` | Display error in retro error dialog via `dialogStore`. |

**Note:** The server pushes `PlayerSessionView` (the player-specific projection including `myRole`, `myTeam`, `myPendingIntentTypes`) to each individual player — not the raw `SessionView`. This is important: players only see what the server reveals to them.

**Note on messages:** The current `PlayerSessionView` does not include message content — only channel metadata. Message delivery likely needs a new server event (`channel:message` or similar) or messages need to be added to `PlayerSessionView`. The spec assumes messages will arrive via a mechanism that provides `{ channelId, senderId, senderName, content, timestamp }`. This is an integration point that needs backend coordination.

### 4.3 Outbound Events (client → server)

All game actions use `game:submit-intent` with `SubmitIntentCommand`:

| User Action | Intent Type | Payload |
|-------------|------------|---------|
| Send chat message | `IntentType.SEND_MESSAGE` | `{ channelId: string, content: string }` |
| Confirm vote | `IntentType.SUBMIT_VOTE` | `{ targetPlayerId: string \| null }` as `VoteIntentPayload` |
| Night action | `IntentType.SUBMIT_NIGHT_ACTION` | `{ actionType: string, targetPlayerId: string }` as `NightActionIntentPayload` |

Full command structure:
```typescript
{
  lobbyCode: string,
  gameId: string,
  playerId: string,
  reconnectToken: string,
  intent: {
    type: IntentType,
    payload: VoteIntentPayload | NightActionIntentPayload | Record<string, unknown>,
    clientTimestamp: string  // ISO string
  }
}
```

### 4.4 Reconnection

On WebSocket reconnect (handled by existing `game-socket.js`), the server pushes a fresh `sessionState` with full current state. `syncSessionState()` replaces store contents. Open windows remain — they re-render with fresh data. No special reconnect UI needed.

### 4.5 Message Delivery Gap

The current shared contracts define channels with metadata (type, members, locked) but do not include a message delivery event. Two options for resolution:

1. **Add a `channel:message` server push event** to `SOCKET_EVENTS.server` — delivers individual messages as they're sent. Preferred: real-time feel, lower bandwidth than full state sync.
2. **Include messages in `PlayerSessionView`** — server includes recent messages per channel in each state push. Simpler but higher payload size.

This needs backend coordination. The frontend is designed to work with either approach via the `addMessage()` action.

---

## 5. Phase Transitions & OS Theming

### 5.1 Theme System

A `useThemeEffect` hook runs inside `OS.jsx`. It subscribes to `useGameStore(s => s.phase)` and applies CSS classes + custom properties on the `.xp-os` root element.

| Phase | CSS Class | Wallpaper | Taskbar Tint |
|-------|-----------|-----------|-------------|
| DAY_OPEN | `.phase-day-open` | Bright XP hills (existing default) | Standard blue gradient |
| DAY_VOTE | `.phase-day-vote` | Same wallpaper, slight red/orange tint overlay | Amber/warning gradient |
| DAY_RESOLVE | `.phase-day-resolve` | Desaturates momentarily | Brief pulse |
| NIGHT_ACTIONS | `.phase-night-actions` | Dark starry sky / moonlit hills | Deep navy/purple gradient |
| NIGHT_RESOLVE | `.phase-night-resolve` | Same dark wallpaper, subtle flicker | Navy holds |
| NIGHT_REVEAL | `.phase-night-reveal` | Dawn gradient — dark to light | Shifts navy → blue |

**Implementation:**
- CSS custom properties on `.xp-os`: `--os-wallpaper`, `--taskbar-bg`, `--taskbar-tint`
- Phase classes defined in theme CSS with `transition: background 1.5s ease` for smooth shifts
- Wallpapers are SVG gradients (lightweight, theme-able)
- No fullscreen overlays or blocking animations — the OS shifts mood around the player

### 5.2 Phase Change Notification

When phase changes:
1. System tray notification bubble pops: "Day Phase — Discuss and find the hackers" / "Night has fallen — Hackers are active" / "Vote now — Choose who to disconnect"
2. Wallpaper/taskbar transition animates over 1.5s
3. Windows react: chat locks/unlocks, VotePanel appears/disappears, role action windows open/close

### 5.3 Timer Display

**System tray clock** (bottom-right of taskbar):
- Replaces or augments the existing clock with phase countdown
- Normal: white text, ticks down calmly
- Urgent (<15% remaining): text turns red, pulses via CSS animation, taskbar flashes briefly every few seconds

**PhaseHeader progress bar** (top of TattleStation main area):
- Thin bar that drains left-to-right
- Color transitions: green → yellow → red as time decreases

**Timer computation:**
- `phaseEndsAt` timestamp from server
- Client computes `timeRemaining` via `requestAnimationFrame` loop comparing `Date.now()` to `phaseEndsAt`
- `isUrgent` = `timeRemaining / totalPhaseDuration < 0.15`
- Total phase duration derived from lobby settings (`dayDurationSeconds`, `nightDurationSeconds`) and phase percentage splits (DAY_OPEN 70%, DAY_VOTE 20%, DAY_RESOLVE 10%, NIGHT_ACTIONS 75%, NIGHT_RESOLVE 15%, NIGHT_REVEAL 10%)

---

## 6. Elimination Sequence

When `syncSessionState` detects `selfAlive` flipped from `true` to `false`, the EliminationSequence component renders.

### 6.1 Cause-Weighted Randomization

The system picks randomly from variation pools, weighted by elimination cause:

**Cause detection:** If elimination happened during/after DAY_VOTE → "voted out". If during/after NIGHT_RESOLVE → "night kill". Determined by current phase when elimination is detected.

### 6.2 Glitch Phase (~2 seconds)

Random pick of 1-2 effects from the pool:

| Effect | Description | Vote Weight | Night Weight |
|--------|-------------|-------------|-------------|
| Window cascade | All open windows rapidly minimize one by one like dominoes | High | Low |
| Screen tear | Horizontal slices of the screen offset randomly, bad VGA signal | Medium | High |
| Popup storm | Rapid fake error dialogs: "Trust compromised", "User not found" | High | Medium |
| Cursor freakout | Cursor icon cycles through hourglass, skull, X, broken arrow | Low | Medium |
| Static burst | Brief TV-static noise overlay | Low | High |

### 6.3 BSOD Phase (~3 seconds)

Fullscreen blue (#0000AA) with white Lucida Console text. Random pick of 1 variant:

| Variant | STOP Code | .sys File | Vote Weight | Night Weight |
|---------|-----------|-----------|-------------|-------------|
| TRUST_VIOLATION_FATAL | 0x000000FE | socialnet.sys — Session terminated by network vote | High | Low |
| SOCIAL_ENGINEERING_SUCCESS | 0x00000C04 | consensus.sys — Majority override engaged | High | Low |
| CONNECTION_TERMINATED_BY_HOST | 0x0000DEAD | groupchat.sys — User removed by collective decision | Medium | Low |
| HACKER_INTRUSION_DETECTED | 0x00BADFED | firewall.sys — Unauthorized access detected | Low | High |
| FIREWALL_BREACH_0x00DEAD | 0x000000BE | defense.sys — Perimeter compromised | Low | High |
| ROOTKIT_INSTALLED | 0x00C0FFEE | kernel.sys — System integrity violation | Low | High |

All variants share the same layout structure:
```
A problem has been detected and TattleTale has been shut down to protect your network.

{VARIANT_NAME}

*** STOP: {STOP_CODE} (0xDEADBEEF, 0x00000001, 0x00000000)

Technical Information:
*** {sys_file} — {description}

Beginning memory dump... Complete.
Contact your system administrator or visit tattletale.gg for help.
```

### 6.4 Reboot Phase (~2 seconds)

Random pick of 1:

| Variant | Vote Weight | Night Weight |
|---------|-------------|-------------|
| Classic BIOS POST scroll text | Equal | Equal |
| "Attempting network recovery... FAILED" | High | Low |
| Progress bar fills then errors out | Equal | Equal |
| Spinning ASCII loading sequence | Low | High |

### 6.5 Transition to Safe Mode

After the reboot phase completes, EliminationSequence unmounts and applies `.spectator-mode` class to the OS root. See Section 7.

### 6.6 Reconnect After Death

If a dead player refreshes or reconnects, `syncSessionState` will set `selfAlive: false` on first load. EliminationSequence checks a `hasPlayedElimination` flag (stored in the game store or sessionStorage). If already played, skip straight to Safe Mode.

---

## 7. Safe Mode Spectator

### 7.1 Visual Treatment

CSS class `.spectator-mode` on `.xp-os`:
- `filter: saturate(0.4)` — desaturated colors
- Muted taskbar gradient
- Plain dark wallpaper replaces phase-themed wallpaper
- "Safe Mode" watermark text in each corner of the desktop, semi-transparent white, `pointer-events: none`
- Phase transitions still apply (wallpaper still shifts day/night within the desaturated filter)

### 7.2 Spectator Capabilities

**CAN do:**
- Read global chat (displayed in TattleStation, no input box rendered)
- Read any channels they had access to while alive (read-only)
- Open and play minigames (full functionality)
- Watch player list updates as others are eliminated
- See system events and phase changes

**CANNOT do:**
- Send messages in any channel
- Vote
- Open new DM windows to living players
- See channels they didn't have access to while alive (no hacker channel reveal)
- Submit any intents (the `pendingIntentTypes` array will be empty for dead players)

### 7.3 Implementation

- ChatPanel checks `selfAlive` — if false, render message list only (no input field)
- VotePanel does not render for dead players (TattleStation shows read-only chat during DAY_VOTE instead)
- Role action windows do not open for dead players
- PlayerList continues updating normally

---

## 8. DM Windows & Channel Management

### 8.1 Auto-Pop + Blink System

The channels slice tracks `popHistory: Set<string>` — channelIds that have auto-popped.

When a message arrives for a non-global channel:

1. **Window already open for this channel** → add message, briefly flash the taskbar entry
2. **No window AND channel not in popHistory** → auto-open a DMWindow for this channel, add channelId to `popHistory`
3. **No window AND channel already in popHistory** (player previously closed it) → blink taskbar icon with unread count badge, do not force open

Each channel auto-pops once to get attention, then respects the player's decision to close it.

### 8.2 Channel Locking

When server sends a channel with `locked: true`:
- ChatPanel input disabled, shows lock icon + "Channel locked" text in input area
- Existing messages remain visible (scrollable history)
- Window title bar gets a small 🔒 prefix
- The lock/unlock state is driven entirely by server state — no client-side logic

### 8.3 Window Lifecycle

- Closing a DMWindow removes the OS window but does NOT leave the channel. Messages keep accumulating in the store.
- Re-opening (via taskbar click on blinking icon, or new incoming message triggering auto-pop) shows full message history.
- Window IDs are derived from channelId (e.g., `dm-{channelId}`) for consistent tracking.

---

## 9. Night Phase Role Windows

### 9.1 Trigger

When phase transitions to NIGHT_ACTIONS:
- Game store checks `selfRole` and `selfAlive`
- If the player has a night action AND is alive → auto-open their role-specific app window
- If no night action (basic Friend) or dead → nothing happens, player can use minigames

### 9.2 Shared Interaction Pattern

All role windows share the same underlying UX (via a `useNightAction` hook):

1. Window auto-opens at NIGHT_ACTIONS start
2. Valid targets displayed (alive players, target restrictions per role)
3. Click to select target → highlight
4. Click confirm → submits intent:
   ```typescript
   {
     type: IntentType.SUBMIT_NIGHT_ACTION,
     payload: {
       actionType: string,      // e.g., "HACK", "INVESTIGATE", "PROTECT"
       targetPlayerId: string,
     }
   }
   ```
5. After confirming: window shows "Processing..." state, input disabled
6. Window auto-closes when phase leaves NIGHT_ACTIONS

### 9.3 Role-Specific Variations

**Eavesdropper (Wire Tap):** Instead of a player list, shows a channel list — Eavesdropper chooses which channel to tap into.

**The Boss (Command Channel):** Shows an extra info panel with what other hackers on the team have selected, allowing the Boss to coordinate or override.

### 9.4 Non-Role Players During Night

The darkened desktop with locked global chat. The existing SideTaskModal system (typing challenges, attention checks, 2048 — already built in OS.jsx) keeps them engaged. No changes needed to the side task system.

### 9.5 Adding New Roles

Adding a new role's night window requires:
1. Create one component with the role's visual theme
2. Register it in `apps.config.js`
3. Add the role name → app ID mapping in a role-to-app config
4. The trigger logic, target selection, and intent submission are all handled by the shared `useNightAction` hook

---

## 10. Win Screen

### 10.1 Trigger

When `syncSessionState` receives a `SessionView` with `status: SessionStatus.FRIENDS_WIN` or `SessionStatus.HACKERS_WIN`.

### 10.2 Sequence

1. **Freeze moment (~1 second):** All windows freeze. Input disabled everywhere. A brief CSS class `.game-frozen` disables pointer events on all windows.

2. **Results window:** A centered, non-closable, non-draggable window opens (styled like a classic Windows installer "Setup Complete" dialog):
   - **Header:** "GAME OVER" in bold
   - **Subheader:** "The Hackers win!" or "The Friends win!" — based on `status`
   - **Role reveal list:** Every player's name, their actual role, and their team. This is the big reveal moment. Requires the server to include full role information in the final `SessionView` (or a separate game-end event).
   - **Stats panel:** Game lasted X cycles, Y players eliminated, player's survival time
   - **"Return to Lobby" button** at the bottom

3. **Desktop reaction:**
   - If the local player's team won: wallpaper shifts to a bright celebratory variant
   - If the local player's team lost: wallpaper shifts to a stormy/glitchy variant
   - Spectators (dead players): Safe Mode styling drops, replaced by the win/loss variant

4. **Return to Lobby:** Clicking the button clears the game store, closes all game-related windows, transitions App.jsx back to the Lobby screen. OS theme resets to default.

### 10.3 Data Requirements

The final `SessionView` (or a supplementary event) needs to include:
- Each player's actual role and team (currently `SessionPlayerView` only has `playerId`, `displayName`, `alive`, `connected`)
- Win condition details (which team won, why — e.g., "all hackers eliminated" vs "hackers reached majority")

This is a backend integration point — the server needs to reveal hidden information on game end.

---

## 11. File Structure

New files to create:

```
apps/web/src/
├── stores/
│   └── gameStore.js              # Zustand + Immer game store (all 5 slices)
├── hooks/
│   ├── useThemeEffect.js         # Phase → OS theme hook
│   ├── useNightAction.js         # Shared night action logic
│   ├── usePhaseTimer.js          # requestAnimationFrame countdown
│   └── useGameSocket.js          # Wire socket events to game store
├── apps/
│   ├── TattleStation/
│   │   ├── index.jsx             # Main game window app
│   │   ├── ChatPanel.jsx         # Message list + input
│   │   ├── PlayerList.jsx        # Sidebar player list
│   │   ├── VotePanel.jsx         # Select-confirm voting grid
│   │   └── PhaseHeader.jsx       # Phase name + timer bar
│   ├── DMWindow/
│   │   └── index.jsx             # Pop-out channel window
│   └── roles/
│       ├── HackerConsole.jsx     # Hacker night action
│       ├── BossCommand.jsx       # The Boss night action
│       ├── SecurityScanner.jsx   # White Hat night action
│       ├── SpiritChannel.jsx     # Psychic night action
│       ├── FreqDisruptor.jsx     # Signal Jammer night action
│       ├── WireTap.jsx           # Eavesdropper night action
│       ├── FirewallConfig.jsx    # Security Specialist night action
│       └── roleAppMap.js         # role name → app ID mapping
├── components/
│   ├── EliminationSequence/
│   │   ├── index.jsx             # Orchestrator (glitch → BSOD → reboot → safe mode)
│   │   ├── GlitchEffects.jsx     # Randomized glitch pool
│   │   ├── BSODScreen.jsx        # Blue screen variants
│   │   └── RebootSequence.jsx    # Reboot animation variants
│   └── WinScreen/
│       └── index.jsx             # Game over results window
└── themes/xp/
    └── game-phases.css           # Phase-specific theme classes + spectator mode
```

Modified existing files:
- `apps/web/src/App.jsx` — Add game start detection, transition to OS with game context
- `apps/web/src/os/OS.jsx` — Add `useThemeEffect` hook, EliminationSequence rendering
- `apps/web/src/os/config/apps.config.js` — Register TattleStation, DMWindow, role apps
- `apps/web/src/os/store/windowStore.js` — No structural changes, used as-is
- `apps/web/src/lib/game-socket.js` — Add `sessionState` listener that calls `syncSessionState`
- `apps/web/src/themes/xp/index.css` — Import game-phases.css
- `apps/web/src/themes/xp/variables.css` — Add phase-specific CSS custom properties

---

## 12. Backend Integration Points

Three areas where the frontend design requires backend changes or confirmation:

### 12.1 Message Delivery
The current `SessionView` includes channel metadata but not message content. The frontend needs either:
- A new `channel:message` server push event (preferred for real-time UX), OR
- Messages included in `PlayerSessionView`

### 12.2 Vote Tally Delivery
The frontend's `confirmedTally` (Section 3.4) expects a map of playerId → vote count from the server during DAY_VOTE. Neither `SessionView` nor `PlayerSessionView` currently includes vote tally data. Options:
- Add a `voteTally: Record<string, number>` field to `PlayerSessionView` (populated only during DAY_VOTE/DAY_RESOLVE)
- Deliver tally updates via a separate server push event

### 12.3 Game End Role Reveal
The final `PlayerSessionView` when status is `FRIENDS_WIN` or `HACKERS_WIN` needs to include each player's actual role and team for the role reveal moment. Currently `SessionPlayerView` only has `playerId`, `displayName`, `alive`, `connected` — role and team fields need to be added to the end-game state payload.

---

## 13. Key Principles

- **Server-authoritative:** Frontend never calculates game logic. It renders server state and submits intents.
- **Dumb terminal:** The client doesn't decide who can vote, which channels are visible, or whether an action is valid. The server's `pendingIntentTypes` tells the client what actions are available.
- **OS-native:** Every game UI element lives inside the XP window system. No breaking out of the metaphor.
- **Progressive disclosure:** Complexity appears only when needed — role windows appear at night, vote panel appears at vote time, DMs pop when messages arrive.
- **Retro authenticity:** Styling follows XP conventions: Tahoma font, gradient buttons, inset shadows, blue title bars. The game UI should feel like period-appropriate software, not a modern web app wearing a retro skin.
