# Frontend Game UI — Design Spec

**Date:** 2026-04-09
**Scope:** Build the in-game frontend UI for TattleTale — chat interface, voting screen, phase displays, role action windows, elimination sequence, spectator mode, and win screen — all integrated into the existing retro XP desktop OS. This spec also defines the required contract extensions to `packages/shared` that the backend must implement for the frontend to function.

---

## 1. Overview & Approach

The game session UI lives *inside* the existing retro XP desktop OS. Instead of replacing the OS, the game extends it — the OS becomes the game world.

**Hybrid window model:** One main game window (TattleStation) handles the GLOBAL chat channel, voting, and phase info. Private messages and role channels pop out as separate DMWindow instances. Role-specific night action apps open as uniquely themed windows. The desktop itself reacts to game state — wallpaper and taskbar shift with day/night phases.

**Architecture:** Single Zustand store with Immer slices. All state uses plain objects and arrays (no Map/Set — Zustand equality checks, Redux DevTools, and serialization all assume plain data). Frontend is a dumb terminal — it renders server state and submits intents. No client-side game logic, no client-side inference of server-authoritative data.

---

## 2. Required Contract Extensions

Before the frontend can be built, the shared contracts in `packages/shared` must be extended. These are concrete type definitions, not aspirational integration points. The backend must implement them.

### 2.1 New Server Push Event: `channel:message`

Delivers individual messages in real time as they are processed by the server.

```typescript
// Add to SOCKET_EVENTS.server
channelMessage: 'channel:message'

// Payload
interface ChannelMessagePayload {
  channelId: string;
  message: {
    id: string;           // Server-generated, globally unique
    senderId: string;     // playerId of sender
    senderName: string;   // displayName at time of send
    content: string;      // The delivered content (may differ from raw if Troller mutated it)
    timestamp: string;    // ISO 8601, server clock
  };
}
```

Why a push event rather than embedding in `PlayerSessionView`: messages are high-frequency and append-only. Embedding them in the state snapshot would balloon payload size on every phase change and reconnect. The push event delivers messages incrementally.

**Ordering guarantee:** Messages within a single channel must arrive in server-timestamp order. The server is the source of truth for ordering — the client appends messages in the order they arrive and does not re-sort. If the server cannot guarantee arrival order (e.g., due to concurrent WebSocket writes), it must include a monotonic `seq` (sequence number) per channel so the client can insert at the correct position.

**On reconnect:** The server must replay the last 100 messages per channel (or all messages if fewer than 100 exist) via a burst of `channel:message` events immediately after the `session:state` push. Messages must be replayed in timestamp order within each channel. The 100-message cap bounds the replay payload while preserving enough context for a returning player. The client replaces (not merges) the local message array for each channel during reconnect replay — see Section 4.3.

### 2.2 New Server Push Event: `player:eliminated`

Notifies a player that they have been eliminated. This replaces client-side inference of elimination cause from phase.

```typescript
// Add to SOCKET_EVENTS.server
playerEliminated: 'player:eliminated'

// Payload
interface PlayerEliminatedPayload {
  playerId: string;
  cause: 'VOTED_OUT' | 'NIGHT_KILL';
  cycle: number;         // The cycle in which elimination occurred
}
```

This event is sent to the eliminated player alongside the `session:state` update that sets their `alive: false`. The `cause` field drives the weighted randomization of elimination effects (Section 7). The `cycle` field allows reconnecting clients to know if the elimination already occurred (if `cycle` matches a prior cycle, skip the animation).

### 2.3 Extended `PlayerSessionView` Fields

```typescript
interface PlayerSessionView {
  // ... existing fields ...

  // NEW: Server sends the duration of the current phase in seconds.
  // The client uses this to compute countdown and urgency.
  // The client MUST NOT infer duration from phase splits or lobby settings.
  phaseDurationSeconds: number;

  // NEW: Vote tally, populated only during DAY_VOTE and DAY_RESOLVE.
  // Null during all other phases.
  voteTally: Record<string, number> | null;  // playerId → confirmed vote count

  // NEW: On game end (status !== ACTIVE), players array includes role reveal.
  // During active game, these fields are omitted.
  players: PlayerSessionPlayerView[];
}

interface PlayerSessionPlayerView extends SessionPlayerView {
  // NEW: Present only when game status is FRIENDS_WIN or HACKERS_WIN
  role?: string;
  team?: Team;
}
```

### 2.4 Reconnect Message Replay

On WebSocket reconnect, the server must:
1. Push `session:state` with current `PlayerSessionView` (existing behavior)
2. Push a burst of `channel:message` events for all channels the player has access to, ordered by timestamp
3. Push `player:eliminated` if the player is dead (so the client can decide whether to show or skip the animation)

This is ordered: `session:state` first (so the store and channels exist), then messages, then elimination.

---

## 3. Component Architecture

### 3.1 New Apps (registered in `apps.config.js`)

#### TattleStation
The main game window. Opens automatically when the game starts.

- **Layout:** Sidebar on the left (PlayerList + phase info), main area on the right
- **Main area content depends on phase:**
  - DAY_OPEN: ChatPanel bound to the GLOBAL channel (always GLOBAL — no channel switching in TattleStation)
  - DAY_VOTE: VotePanel replaces ChatPanel
  - DAY_RESOLVE / NIGHT_RESOLVE / NIGHT_REVEAL: System event feed (elimination announcements, phase results)
  - NIGHT_ACTIONS: ChatPanel for GLOBAL channel, but locked (input disabled by server-sent `locked: true`)
- **Registration:** `desktopIcon: { show: false }` — opened programmatically, not from desktop
- **Default window size:** ~700x500, resizable, minWidth 500, minHeight 400

#### DMWindow
Lightweight chat window template for non-global channels. Multiple instances can coexist.

- **Styling varies by channel type:**
  - PRIVATE: Purple title bar, titled "DM — {PlayerName}"
  - ROLE: Red title bar for Hackers ("Hacker Channel"), green for Friends ("Friend Channel")
  - TEMP: Amber title bar, shows expiry info in title, titled "Temp — {GroupName}"
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
- **Close behavior:** Role windows hide the close button during NIGHT_ACTIONS (the window auto-closes on phase exit). If the player minimizes it, they can restore it from the taskbar.

### 3.2 New Reusable Components

#### ChatPanel
Shared message list + input. Used inside TattleStation (global channel) and DMWindow (other channels).

- Message list: scrollable, auto-scrolls to bottom on new messages, shows sender name + timestamp
- Input: text field + send button at the bottom
- When channel is locked: input disabled, shows lock icon with "Channel locked" text
- When player is dead: input field not rendered (read-only mode)
- Props: `channelId` — reads messages from the channels slice
- **Deduplication & ordering:** Before appending a message, check if `message.id` already exists in the channel's message array. Skip if duplicate. Messages are appended in arrival order — the server guarantees in-order delivery per channel (see Section 2.1). The client does not re-sort.

#### PlayerList
Sidebar component showing all players and their status.

- Each entry shows: display name, alive/dead indicator, connected/disconnected indicator
- Alive players: normal text
- Dead players: strikethrough text, grayed out
- Disconnected players: italic, dimmed
- Current player highlighted subtly
- During DAY_VOTE: the list is read-only context — voting happens in VotePanel, not here

#### VotePanel
Replaces ChatPanel in TattleStation during DAY_VOTE phase.

- **Player grid:** Grid of player entries (name + alive status), one per voteable player (alive and connected)
- **Two-step interaction:**
  1. Click a player → highlighted as "pending selection" (yellow/amber border)
  2. Click "Confirm Vote" button → locks in the vote, sends `submitIntent` with `IntentType.SUBMIT_VOTE`
  3. Can change pending selection before confirming. Cannot change after confirming.
- **Tally display:** Bar at the top showing confirmed vote counts per player, sourced from `PlayerSessionView.voteTally`. Only confirmed votes visible.
- **Invalidation:**
  - **Pending selection:** If the server pushes a `session:state` update during DAY_VOTE that removes a player from the voteable list (e.g., they disconnected), and the local player's `pendingSelection` points to that player, clear the pending selection silently.
  - **Confirmed vote:** If `confirmedVote` points to a player who is no longer voteable (disconnected, or removed from the player list), the client does NOT unilaterally revoke the vote — the server is authoritative on vote validity. However, the UI must clearly communicate the situation: the target player's entry in the VotePanel shows as grayed out with a "(disconnected)" label, and a notice appears above the tally: "Your vote target disconnected. The server will resolve this." This prevents confusion without overriding server authority.
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
- Thin progress bar underneath: starts full-width (green) and shrinks toward zero (red) as time expires. Left-aligned, shrinks from right edge.

#### EliminationSequence
Fullscreen overlay component. Triggered by the `player:eliminated` server event targeting the local player.

- z-index above everything (above SideTaskModal's 100000)
- Runs a timed sequence, then unmounts and applies `.spectator-mode` CSS class
- The `cause` field from `PlayerEliminatedPayload` drives weighted randomization (Section 7)
- **Replay prevention:** On receiving `player:eliminated`, the client stores the `cycle` value. On reconnect, if the server replays the event with the same `cycle`, skip the animation and go straight to Safe Mode. This is server-driven, not a local sessionStorage hack.
- See Section 7 for full detail.

#### PhaseTransition (useThemeEffect hook)
Not a visible component — a hook running in OS.jsx that subscribes to game phase and applies OS-level theme changes.

- See Section 6 for full detail.

---

## 4. State Management — Game Store

Single Zustand store (`useGameStore`) using Immer middleware, organized into five logical slices. All collections use plain objects and arrays — no Map or Set.

### 4.1 Phase Slice

```typescript
{
  phase: Phase | null,              // Current phase enum, null before game starts
  cycle: number,                    // Current game cycle
  phaseEndsAt: string | null,       // ISO timestamp from server
  phaseDurationSeconds: number,     // Total duration of current phase, from server
  timeRemaining: number,            // Seconds, derived via requestAnimationFrame
  isUrgent: boolean,                // true when <15% time remains
}
```

- `timeRemaining` is computed client-side from `phaseEndsAt` using a `requestAnimationFrame` tick loop
- `isUrgent` = `timeRemaining / phaseDurationSeconds < 0.15`
- `phaseDurationSeconds` comes directly from the server (Section 2.3) — the client never computes it from lobby settings or phase split percentages

### 4.2 Players Slice

```typescript
{
  players: Record<string, {     // playerId → player info
    displayName: string,
    alive: boolean,
    connected: boolean,
    role?: string,              // Only populated on game end (role reveal)
    team?: Team,                // Only populated on game end (role reveal)
  }>,
  selfId: string,
  selfRole: string,             // From PlayerSessionView.myRole
  selfTeam: Team,               // From PlayerSessionView.myTeam
  selfAlive: boolean,
}
```

### 4.3 Channels Slice

```typescript
{
  channels: Record<string, {    // channelId → channel state
    id: string,
    type: ChannelType,
    members: string[],
    locked: boolean,
    expiresAt: Phase | null,
    messages: Array<{
      id: string,               // Server-generated unique ID
      senderId: string,
      senderName: string,
      content: string,
      timestamp: string,
    }>,
  }>,
  unreadCounts: Record<string, number>,   // channelId → unread count
  popHistory: Record<string, true>,       // channelIds that have auto-popped
  removedChannelIds: string[],            // Channels removed in the last sync, cleared on next sync
}
```

**Actions:**
- `addMessage(channelId, msg)` — deduplicates by `msg.id`, appends if new, increments unread if window not focused. After appending, if the channel's message array exceeds 200 entries, trim the oldest messages to keep the array at 200. This bounds memory usage for long games. (The 200 cap is client-side only — the server's replay cap of 100 messages per reconnect is a separate concern.)
- `markRead(channelId)` — resets unread count to 0
- `prepareForReconnect()` — clears the `messages` array for every channel (they will be repopulated by the replay burst), preserves `unreadCounts` and `popHistory` (see Section 5.4 for rationale)

**No `activeChannelId`.** TattleStation always renders the GLOBAL channel. There is no channel switching within TattleStation. DM and role channels live in their own DMWindow instances.

### 4.4 Vote Slice

```typescript
{
  pendingSelection: string | null,         // playerId clicked but not confirmed
  confirmedVote: string | null,            // playerId locked in
  voteTally: Record<string, number> | null, // From server, null outside DAY_VOTE/DAY_RESOLVE
}
```

**Actions:**
- `selectPlayer(id)` — sets pending selection (no-op if already confirmed)
- `confirmVote()` — locks in pending selection, triggers `submitIntent`
- `clearVote()` — resets both pending and confirmed (called on phase transition away from DAY_VOTE)
- `invalidatePending(validPlayerIds)` — if `pendingSelection` is not in `validPlayerIds`, clear it

### 4.5 Session Slice

```typescript
{
  gameId: string,
  lobbyCode: string,
  status: SessionStatus,           // ACTIVE, FRIENDS_WIN, HACKERS_WIN
  systemEvents: SystemEventView[],
  pendingIntentTypes: IntentType[],
  eliminationCause: 'VOTED_OUT' | 'NIGHT_KILL' | null,  // Set by player:eliminated event
  eliminationCycle: number | null,  // Set by player:eliminated event, used for replay prevention
}
```

### 4.6 Root Action: syncSessionState

```typescript
syncSessionState(view: PlayerSessionView) => {
  // Phase slice
  set phase, cycle, phaseEndsAt, phaseDurationSeconds from view
  compute initial timeRemaining from phaseEndsAt

  // Players slice
  set players from view.players (convert array to Record<string, ...>)
  set selfRole from view.myRole, selfTeam from view.myTeam
  derive selfAlive from players[selfId].alive
  // On game end: view.players includes role/team fields → store them

  // Channels slice
  merge view.channels into store channels:
    - Add new channels that don't exist locally
    - Update metadata (locked, members, expiresAt) for existing channels
    - Preserve local messages array (messages come via channel:message events, not here)
    - Remove channels no longer in view.channels (player lost access):
      → Delete the channel entry from the store
      → Delete its unreadCounts entry
      → Delete its popHistory entry
      → Add the channelId to a `removedChannelIds: string[]` field (ephemeral, cleared on next sync)
      → Any open DMWindow for that channel reads this field and transitions to a "Channel closed" state (see Section 9.4)

  // Vote slice
  set voteTally from view.voteTally
  if phase changed away from DAY_VOTE → clearVote()
  if in DAY_VOTE → invalidatePending(alive + connected playerIds)

  // Session slice
  set gameId, lobbyCode, status, systemEvents, pendingIntentTypes
}
```

### 4.7 Selectors

Components use narrow selectors to minimize re-renders:
- `useGameStore(s => s.phase)` — PhaseHeader, useThemeEffect
- `useGameStore(s => s.players)` — PlayerList
- `useGameStore(s => s.channels[channelId]?.messages)` — ChatPanel (per channel)
- `useGameStore(s => s.voteTally)` — VotePanel tally display
- `useGameStore(s => s.selfAlive)` — Spectator mode checks
- `useGameStore(s => s.status)` — Win screen trigger
- `useGameStore(s => s.isUrgent)` — Timer urgency styling
- `useGameStore(s => s.eliminationCause)` — EliminationSequence trigger + variant weighting

---

## 5. WebSocket Integration

### 5.1 Connection Lifecycle

1. Player is in Lobby → clicks "Start Game" → server responds with `StartGameSuccess` containing initial `PlayerSessionView`
2. `App.jsx` detects lobby status is `IN_GAME` → transitions to OS → OS auto-opens TattleStation
3. `syncSessionState()` hydrates all store slices
4. Server pushes initial `channel:message` burst for any existing messages
5. Ongoing: server pushes `session:state` on phase changes and state updates, `channel:message` for chat, `player:eliminated` on elimination

### 5.2 Inbound Events (server → client)

| Event | Socket Key | Handler |
|-------|-----------|---------|
| Session state | `session:state` | `syncSessionState(view)` — updates all slices. |
| Channel message | `channel:message` | `addMessage(channelId, msg)` — deduplicates, appends, triggers DM auto-pop/blink. |
| Player eliminated | `player:eliminated` | Stores `cause` and `cycle` in session slice. If `cycle` > `eliminationCycle`, triggers EliminationSequence. Otherwise skips (replay). |
| Command error | `command:error` | Display error in retro error dialog via `dialogStore`. |

The server pushes `PlayerSessionView` (the player-specific projection including `myRole`, `myTeam`, `myPendingIntentTypes`, `phaseDurationSeconds`, `voteTally`) to each individual player — not the raw `SessionView`.

### 5.3 Outbound Events (client → server)

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

### 5.4 Reconnection

On WebSocket reconnect (handled by existing `game-socket.js`):

1. Server pushes `session:state` with full current `PlayerSessionView`
2. `syncSessionState()` replaces store contents (channels, players, phase, etc.)
3. `prepareForReconnect()` clears message arrays for all channels (they'll be repopulated by replay). Preserves `unreadCounts` and `popHistory` so the player's window state and unread badges remain stable — a brief disconnect shouldn't reset their mental model of which conversations they've seen.
4. Server replays `channel:message` events for all accessible channels (last 100 per channel, in timestamp order). The client appends these to the now-empty message arrays. Because `popHistory` is preserved, channels that were already popped once won't auto-pop again — they'll just re-accumulate their unread badge if the window is closed.
5. After replay, any channel whose replayed message count exceeds its pre-reconnect unread count keeps the pre-reconnect unread count (the player already saw those messages). Any channel with *new* messages beyond what was previously delivered increments the unread count normally.
6. If player is dead, server sends `player:eliminated` with the original `cause` and `cycle` — client compares `cycle` to stored `eliminationCycle` and skips the animation if already seen, going straight to Safe Mode
7. Open windows remain — they re-render with fresh data

---

## 6. Phase Transitions & OS Theming

### 6.1 Theme System

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

### 6.2 Phase Change Notification

When phase changes:
1. System tray notification bubble pops: "Day Phase — Discuss and find the hackers" / "Night has fallen — Hackers are active" / "Vote now — Choose who to disconnect"
2. Wallpaper/taskbar transition animates over 1.5s
3. Windows react: chat locks/unlocks, VotePanel appears/disappears, role action windows open/close

### 6.3 Timer Display

**System tray clock** (bottom-right of taskbar):
- Replaces or augments the existing clock with phase countdown
- Normal: white text, ticks down calmly
- Urgent (<15% remaining): text turns red, pulses via CSS animation. Pulses twice (0.5s on, 0.5s off), pauses for 5 seconds, repeats for a maximum of 3 cycles, then holds steady red until phase ends. This avoids sustained flashing fatigue.

**PhaseHeader progress bar** (top of TattleStation main area):
- Thin bar, left-aligned, starts at full width and shrinks toward zero from the right edge as time expires
- Color transitions: green (>50%) → yellow (15-50%) → red (<15%)

**Timer computation:**
- `phaseEndsAt` (ISO timestamp) and `phaseDurationSeconds` (number) both come from the server
- Client computes `timeRemaining` via `requestAnimationFrame` loop: `Math.max(0, (Date.parse(phaseEndsAt) - Date.now()) / 1000)`
- `isUrgent` = `timeRemaining / phaseDurationSeconds < 0.15`
- The client never infers phase duration from lobby settings or phase split percentages

---

## 7. Elimination Sequence

Triggered by the `player:eliminated` server event (Section 2.2), not by detecting `selfAlive` changes.

### 7.1 Cause-Weighted Randomization

The `cause` field from `PlayerEliminatedPayload` (`'VOTED_OUT'` or `'NIGHT_KILL'`) drives variant selection. Each variant pool uses numeric weights:
- **High** = 3, **Medium** = 2, **Low** = 1
- Pick randomly with weights as probabilities

### 7.2 Glitch Phase (~2 seconds)

Random pick of 1-2 effects from the pool:

| Effect | Description | VOTED_OUT Weight | NIGHT_KILL Weight |
|--------|-------------|-----------------|-------------------|
| Window cascade | All open windows rapidly minimize one by one like dominoes | 3 | 1 |
| Screen tear | Horizontal slices of the screen offset randomly, bad VGA signal | 2 | 3 |
| Popup storm | Rapid fake error dialogs: "Trust compromised", "User not found" | 3 | 2 |
| Cursor freakout | Cursor icon cycles through hourglass, skull, X, broken arrow | 1 | 2 |
| Static burst | Brief TV-static noise overlay | 1 | 3 |

### 7.3 BSOD Phase (~3 seconds)

Fullscreen blue (#0000AA) with white Lucida Console text. Random pick of 1 variant:

| Variant | STOP Code | .sys File | VOTED_OUT Weight | NIGHT_KILL Weight |
|---------|-----------|-----------|-----------------|-------------------|
| TRUST_VIOLATION_FATAL | 0x000000FE | socialnet.sys — Session terminated by network vote | 3 | 1 |
| SOCIAL_ENGINEERING_SUCCESS | 0x00000C04 | consensus.sys — Majority override engaged | 3 | 1 |
| CONNECTION_TERMINATED_BY_HOST | 0x0000DEAD | groupchat.sys — User removed by collective decision | 2 | 1 |
| HACKER_INTRUSION_DETECTED | 0x00BADFED | firewall.sys — Unauthorized access detected | 1 | 3 |
| FIREWALL_BREACH | 0x000000BE | defense.sys — Perimeter compromised | 1 | 3 |
| ROOTKIT_INSTALLED | 0x00C0FFEE | kernel.sys — System integrity violation | 1 | 3 |

All variants share the same layout structure:
```
A problem has been detected and TattleTale has been shut down to protect your network.

{VARIANT_NAME}

*** STOP: {STOP_CODE} (0xDEADBEEF, 0x00000001, 0x00000000)

Technical Information:
*** {sys_file} — {description}

Beginning memory dump... Complete.
Contact your system administrator for help.
```

### 7.4 Reboot Phase (~2 seconds)

Random pick of 1:

| Variant | VOTED_OUT Weight | NIGHT_KILL Weight |
|---------|-----------------|-------------------|
| Classic BIOS POST scroll text | 2 | 2 |
| "Attempting network recovery... FAILED" | 3 | 1 |
| Progress bar fills then errors out | 2 | 2 |
| Spinning ASCII loading sequence | 1 | 3 |

### 7.5 Transition to Safe Mode

After the reboot phase completes, EliminationSequence unmounts and applies `.spectator-mode` class to the OS root. See Section 8.

### 7.6 Replay Prevention

When the `player:eliminated` event arrives, the client stores `eliminationCycle` in the session slice. On reconnect, if the server replays the event with the same `cycle` value, the client skips the animation and applies `.spectator-mode` immediately. This is driven by server data — no local sessionStorage or flags.

---

## 8. Safe Mode Spectator

### 8.1 Visual Treatment

CSS class `.spectator-mode` on `.xp-os`:
- `filter: saturate(0.4)` — desaturated colors
- Muted taskbar gradient
- Plain dark wallpaper replaces phase-themed wallpaper
- "Safe Mode" watermark text in each corner of the desktop, semi-transparent white, `pointer-events: none`
- Phase transitions still apply (wallpaper still shifts day/night within the desaturated filter)

### 8.2 Spectator Capabilities

**CAN do:**
- Read global chat (displayed in TattleStation, no input field rendered)
- Read any channels they had access to while alive (read-only) — specifically, channels the server still includes in `PlayerSessionView.channels`. The server controls visibility; the client just renders what it receives.
- Open and play minigames (full functionality)
- Watch player list updates as others are eliminated
- See system events and phase changes

**CANNOT do:**
- Send messages in any channel
- Vote
- Open new DM windows (no new channels will appear in server state for dead players)
- Submit any intents (the `pendingIntentTypes` array will be empty for dead players)

### 8.3 Implementation

- ChatPanel checks `selfAlive` — if false, does not render the input field
- VotePanel does not render for dead players (TattleStation shows read-only GLOBAL chat during DAY_VOTE instead)
- Role action windows do not open for dead players
- PlayerList continues updating normally
- DMWindows that were open before death remain open (read-only). DMWindows that were closed stay closed — no new auto-pops since no new messages will arrive for channels the dead player lost access to. For channels the server keeps sending (e.g., GLOBAL), messages continue to appear in TattleStation.

---

## 9. DM Windows & Channel Management

### 9.1 Auto-Pop + Blink System

The channels slice tracks `popHistory: Record<string, true>` — channelIds that have auto-popped.

When a `channel:message` event arrives for a non-GLOBAL channel:

1. **Window already open for this channel** → add message, briefly flash the taskbar entry (single 0.3s highlight, not a sustained blink)
2. **No window AND channel not in popHistory** → auto-open a DMWindow for this channel, add channelId to `popHistory`
3. **No window AND channel already in popHistory** (player previously closed it) → blink taskbar icon with unread count badge, do not force open

Each channel auto-pops once to get attention, then respects the player's decision to close it.

**On reconnect:** `popHistory` is preserved across reconnects (see Section 5.4). Channels that already auto-popped once won't force-open again on replay — they'll accumulate unread badges on their existing taskbar entries if the window is closed. This prevents a brief network hiccup from re-spawning every DM window the player had previously arranged or closed.

### 9.2 Channel Locking

When the server sends a channel with `locked: true` in `PlayerSessionView.channels`:
- ChatPanel input disabled, shows lock icon + "Channel locked" text in input area
- Existing messages remain visible (scrollable history)
- Window title bar gets a small lock indicator prefix
- The lock/unlock state is driven entirely by server state

### 9.3 Window Lifecycle

- Closing a DMWindow removes the OS window but does NOT leave the channel. Messages keep accumulating in the store.
- Re-opening (via taskbar click on blinking icon, or new message triggering auto-pop if not in popHistory) shows full message history.
- Window IDs are derived from channelId (e.g., `dm-{channelId}`) for consistent tracking.

### 9.4 Channel Removal

When `syncSessionState` removes a channel from the store (because the server no longer includes it in `PlayerSessionView.channels`), any open DMWindow for that channel must handle the disappearance gracefully:

1. The DMWindow subscribes to `useGameStore(s => s.channels[channelId])`. When this becomes `undefined`, the window transitions to a "closed" state.
2. **Closed state UI:** The ChatPanel is replaced with a centered message: "This channel is no longer available." The input field is removed. Existing messages are gone (the store entry was deleted).
3. The window remains open but inert — the player can read the notice and close it manually. It does not auto-close (an abruptly vanishing window with no explanation would be confusing).
4. The window title appends "(closed)" to indicate the state.

This handles cases like: TEMP channels expiring, role channels being revoked, or the player losing access to a channel due to game events.

---

## 10. Night Phase Role Windows

### 10.1 Trigger

When phase transitions to NIGHT_ACTIONS (detected in `syncSessionState`):
- Check `selfRole` and `selfAlive`
- If the player has a night action AND is alive → auto-open their role-specific app window
- If no night action (basic Friend) or dead → nothing happens, player can use minigames

### 10.2 Shared Interaction Pattern

All role windows share the same underlying UX (via a `useNightAction` hook):

1. Window auto-opens at NIGHT_ACTIONS start
2. Valid targets displayed (alive players, per role's target rules)
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
7. Close button is hidden during NIGHT_ACTIONS — player can minimize to taskbar but cannot dismiss. This prevents accidental closure with no way to resubmit.

### 10.3 Role-Specific Variations

**Eavesdropper (Wire Tap):** Instead of a player list, shows a channel list — Eavesdropper chooses which channel to tap into. Payload uses `metadata` field for the channelId target.

**The Boss (Command Channel):** Shows an extra info panel with what other hackers on the team have selected, allowing the Boss to coordinate or override. This info comes from the server as part of the Boss's `PlayerSessionView` (the server already knows what to reveal per role).

### 10.4 Non-Role Players During Night

The darkened desktop with locked global chat. The existing SideTaskModal system (typing challenges, attention checks, 2048 — already built in OS.jsx) keeps them engaged. No changes needed to the side task system.

### 10.5 Adding New Roles

Adding a new role's night window requires:
1. Create one component with the role's visual theme
2. Register it in `apps.config.js`
3. Add the role name → app ID mapping in `roleAppMap.js`
4. The trigger logic, target selection, and intent submission are all handled by the shared `useNightAction` hook

---

## 11. Win Screen

### 11.1 Trigger

When `syncSessionState` receives a `PlayerSessionView` with `status: SessionStatus.FRIENDS_WIN` or `SessionStatus.HACKERS_WIN`.

### 11.2 Sequence

1. **Freeze moment (~1 second):** All windows freeze. Input disabled everywhere. CSS class `.game-frozen` on `.xp-os` sets `pointer-events: none` on all `.xp-window` elements.

2. **Results window:** A centered, non-closable, non-draggable window opens (styled like a classic Windows installer "Setup Complete" dialog):
   - **Header:** "GAME OVER" in bold
   - **Subheader:** "The Hackers win!" or "The Friends win!" — based on `status`
   - **Role reveal list:** Every player's name, their actual role, and their team — from the `role` and `team` fields now present on `PlayerSessionPlayerView` (Section 2.3)
   - **Stats panel:** Game lasted X cycles, Y players eliminated
   - **"Return to Lobby" button** at the bottom

3. **Desktop reaction:**
   - If the local player's team won: wallpaper shifts to a bright celebratory variant
   - If the local player's team lost: wallpaper shifts to a stormy/glitchy variant
   - Spectators (dead players): Safe Mode styling drops, replaced by the win/loss variant

4. **Return to Lobby:** Clicking the button clears the game store, closes all game-related windows, transitions App.jsx back to the Lobby screen. OS theme resets to default.

---

## 12. File Structure

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

packages/shared/src/
├── contracts/
│   ├── events.ts                 # MODIFIED: add channelMessage, playerEliminated
│   └── views.ts                  # MODIFIED: add PlayerSessionPlayerView, phaseDurationSeconds, voteTally
```

Modified existing files:
- `apps/web/src/App.jsx` — Add game start detection, transition to OS with game context
- `apps/web/src/os/OS.jsx` — Add `useThemeEffect` hook, EliminationSequence rendering
- `apps/web/src/os/config/apps.config.js` — Register TattleStation, DMWindow, role apps
- `apps/web/src/os/store/windowStore.js` — No structural changes, used as-is
- `apps/web/src/lib/game-socket.js` — Add listeners for `channel:message` and `player:eliminated`
- `apps/web/src/themes/xp/index.css` — Import game-phases.css
- `apps/web/src/themes/xp/variables.css` — Add phase-specific CSS custom properties
- `packages/shared/src/contracts/events.ts` — Add new server events and payload types
- `packages/shared/src/contracts/views.ts` — Extend PlayerSessionView with new fields

---

## 13. Key Principles

- **Server-authoritative:** Frontend never calculates game logic. It renders server state and submits intents. Elimination cause, phase duration, vote tallies, channel visibility, and role reveal data all come from the server.
- **No client-side inference:** The client does not derive authoritative game state from indirect signals (like guessing elimination cause from current phase, or computing phase duration from settings). If the client needs data, the server must provide it explicitly.
- **Dumb terminal:** The client doesn't decide who can vote, which channels are visible, or whether an action is valid. The server's `pendingIntentTypes` tells the client what actions are available.
- **Plain data:** All Zustand state uses plain objects and arrays. No Map, Set, or other non-serializable types. This ensures compatibility with Zustand equality checks, Immer, and DevTools.
- **OS-native:** Every game UI element lives inside the XP window system. No breaking out of the metaphor.
- **Progressive disclosure:** Complexity appears only when needed — role windows appear at night, vote panel appears at vote time, DMs pop when messages arrive.
- **Retro authenticity:** Styling follows XP conventions: Tahoma font, gradient buttons, inset shadows, blue title bars. The game UI should feel like period-appropriate software, not a modern web app wearing a retro skin.
- **Deduplication at boundaries:** Messages are deduplicated by ID on arrival. Reconnect replays are safe because every addMessage call checks for existing IDs.
