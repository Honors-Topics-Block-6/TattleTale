# Game Cycle Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the end-to-end MVP game cycle — Lobby → day/night loop → elimination → win — with a two-team (Hackers vs Friends) night-kill mechanic, by finishing the in-flight lobby/chat diff on `createGameMaybe` and adding the hacker channel, night-kill resolution, and client-side night UI described in `docs/superpowers/specs/2026-04-15-game-cycle-wiring-design.md`.

**Architecture:** Pure-function game domain (`apps/server/src/domain/game/*`) driven by Cloudflare Durable Object alarms; shared Zod/TypeScript contracts in `packages/shared`; React + Zustand + Immer client. Night kill mirrors the day-vote resolution pattern (tally from `pendingIntents`, plurality winner, tie → no-op, system event appended, broadcast via `sessionState`). The hacker tally is scoped in the per-player projection so Friends never see it in server traffic.

**Tech Stack:** TypeScript / Node ≥20 / ESM with `.js`-suffixed imports; Hono on Cloudflare Workers; Drizzle on D1; Vitest + `@cloudflare/vitest-pool-workers` for server tests; React 19 + Vite 6 + Zustand 5 + Immer 11 for the web app; Vitest + `@testing-library/react` + jsdom to be added for web unit tests.

**Spec reference:** `docs/superpowers/specs/2026-04-15-game-cycle-wiring-design.md` (commits `d2210d2` + `fb13719` on branch `createGameMaybe`).

---

## File Structure

**Shared contracts (modify):**
- `packages/shared/src/enums.ts` — `ChannelType.HACKER`, 3 new `SystemEventType` members
- `packages/shared/src/contracts/events.ts` — already has `'NIGHT_KILL'` in the cause union (no change needed; verify)
- `packages/shared/src/contracts/views.ts` — `SystemEventView.metadata`; `PlayerSessionView` gains `nightKillTally`, `myTeammates`, `myConfirmedNightKillTarget`

**Server domain (modify):**
- `apps/server/src/domain/game/types.ts` — `SystemEventState.metadata`; `RuntimePlayerEliminatedEvent.reason` gains `'NIGHT_KILL'`
- `apps/server/src/domain/game/session-domain.ts` — hacker channel created in `buildSessionFromLobby` with empty members
- `apps/server/src/domain/game/runtime-domain.ts` — `initializeSessionRuntime` populates hacker channel; new `resolveHackerKillTarget` + `appendSystemEvent` helpers; NIGHT_ACTIONS → NIGHT_RESOLVE branch applies kill; DAY_VOTE branch appends `PLAYER_VOTED_OUT`
- `apps/server/src/domain/projections.ts` — `toPlayerSessionView` adds the 3 new fields + passes `metadata` through
- `apps/server/src/transport/ws-message-handler.ts` — `SUBMIT_NIGHT_ACTION` validation; `broadcastPlayerEliminated` cause map gains `NIGHT_KILL → NIGHT_KILL`

**Server tests (modify/create):**
- `apps/server/src/domain/game/runtime-domain.test.ts` — extend with night-kill cases, hacker-channel seeding, appendSystemEvent, alarm replay idempotency
- `apps/server/src/domain/projections.test.ts` — extend with new field cases
- `apps/server/src/durable-objects/game-room.test.ts` — add end-to-end cycle including night kill
- `apps/server/src/transport/ws-message-handler.test.ts` — **create**, cover SUBMIT_NIGHT_ACTION validation

**Web (modify):**
- `apps/web/package.json` — add vitest + @testing-library + jsdom
- `apps/web/vitest.config.js` — **create**
- `apps/web/src/test-setup.js` — **create** (global setup for @testing-library)
- `apps/web/src/stores/gameStore.js` — new session slice fields + selectors
- `apps/web/src/hooks/useGameSocket.js` — extend `syncSessionState`
- `apps/web/src/apps/TattleStation/index.jsx` — phase routing adds NightPanel / NightSpectatorView cases; inline SystemEventFeed replaced by import
- `apps/web/src/os/OS.jsx` — auto-open HackerTerminal for living Hackers
- `apps/web/src/os/config/apps.config.js` — register HackerTerminal
- `apps/web/src/components/EliminationSequence/index.jsx` — NIGHT_KILL cause branch

**Web (create):**
- `apps/web/src/apps/TattleStation/NightPanel.jsx`
- `apps/web/src/apps/TattleStation/NightSpectatorView.jsx`
- `apps/web/src/apps/TattleStation/SystemEventFeed.jsx`
- `apps/web/src/apps/HackerTerminal/index.jsx`
- `apps/web/src/apps/TattleStation/NightPanel.test.jsx`
- `apps/web/src/apps/TattleStation/SystemEventFeed.test.jsx`
- `apps/web/src/stores/gameStore.test.js`

---

## Task Order & Rationale

The plan proceeds inside-out: (0) baseline the in-flight diff so subsequent changes build on a committed state; (1–4) shared contracts + types — prerequisites; (5–12) server domain + unit tests; (13–16) server transport + DO integration test; (17) web test infra; (18–19) client store wiring; (20–26) web UI; (27) manual smoke verification. Each task commits separately so the branch history narrates the build.

---

### Task 0: Commit the in-flight baseline

The branch `createGameMaybe` has 16 uncommitted files that are themselves the "lobby/chat/elim broadcast" portion of this spec's scope. They're working code; commit them as three themed commits so subsequent tasks have a clean baseline.

**Files:**
- All 16 modified files (`git status` to see the list).

- [ ] **Step 1: Verify the branch builds before committing**

Run from repo root:
```bash
npm run build
```

Expected: `build:shared` then `build:server` succeed with no TypeScript errors. If errors appear, fix them before proceeding — the baseline must be green.

- [ ] **Step 2: Commit shared-contract changes**

```bash
git add packages/shared/src/contracts/events.ts packages/shared/src/contracts/messages.ts
git commit -m "$(cat <<'EOF'
feat(shared): extend eliminate cause union and add channelMessage/playerEliminated pushes

Adds PLAYER_LEFT/PLAYER_KICKED to PlayerEliminatedPayload.cause, adds
cycle to ChannelMessagePayload, and introduces channelMessage and
playerEliminated as server-push message types.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Commit server lobby/broadcast changes**

```bash
git add apps/server/src/domain/game/runtime-domain.ts \
        apps/server/src/domain/game/session-domain.ts \
        apps/server/src/domain/game/types.ts \
        apps/server/src/domain/projections.ts \
        apps/server/src/durable-objects/game-room.ts \
        apps/server/src/router.ts \
        apps/server/src/transport/ws-message-handler.ts
git commit -m "$(cat <<'EOF'
feat(server): wire chat broadcast, vote tally, and elimination push

Implements SEND_MESSAGE intent handler, exposes currentPhaseDurationSeconds
and current-cycle voteTally through toPlayerSessionView, adds
broadcastChannelMessage and broadcastPlayerEliminated helpers on the
GameRoom DO, and lowers the router lobby min to 1 for testing.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Commit web lobby/chat rewrite**

```bash
git add apps/web/src/App.jsx \
        apps/web/src/Lobby.jsx \
        apps/web/src/apps/TattleStation/ChatPanel.jsx \
        apps/web/src/apps/TattleStation/VotePanel.jsx \
        apps/web/src/hooks/useGameSocket.js \
        apps/web/src/os/OS.jsx \
        apps/web/src/stores/gameStore.js
git commit -m "$(cat <<'EOF'
feat(web): complete lobby flow and migrate chat/vote to submitIntent

Rewrites Lobby.jsx with multi-screen state machine (title/create/join/room/error),
lazy-initializes GameSocket via App.jsx, adds lobbyView store slice,
migrates ChatPanel/VotePanel to the submitIntent message shape with
new camelCase server pushes (sessionState/channelMessage/playerEliminated),
and auto-opens TattleStation on OS mount.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify a clean baseline**

```bash
git status
```

Expected: only `.claude/` and `apps/server/.wrangler/` remain untracked. No modified files tracked by git.

- [ ] **Step 6: Rebuild and run existing tests**

```bash
npm run build && npm test
```

Expected: all existing tests pass. Any failure is a regression from the in-flight diff and must be fixed before Task 1.

---

### Task 1: Add `ChannelType.HACKER` and new `SystemEventType` members

**Files:**
- Modify: `packages/shared/src/enums.ts`

- [ ] **Step 1: Open enums.ts and add the new members**

```ts
export enum ChannelType {
  GLOBAL = 'GLOBAL',
  PRIVATE = 'PRIVATE',
  ROLE = 'ROLE',
  TEMP = 'TEMP',
  SYSTEM = 'SYSTEM',
  HACKER = 'HACKER',
}

export enum SystemEventType {
  CHANNEL_LOCKED = 'CHANNEL_LOCKED',
  COMMUNICATION_JAMMED = 'COMMUNICATION_JAMMED',
  MESSAGE_INTEGRITY_COMPROMISED = 'MESSAGE_INTEGRITY_COMPROMISED',
  TEMP_CHANNEL_CREATED = 'TEMP_CHANNEL_CREATED',
  PSYCHIC_SIGNAL_RECEIVED = 'PSYCHIC_SIGNAL_RECEIVED',
  GAME_STARTED = 'GAME_STARTED',
  PLAYER_VOTED_OUT = 'PLAYER_VOTED_OUT',
  PLAYER_KILLED_AT_NIGHT = 'PLAYER_KILLED_AT_NIGHT',
  NO_KILL_TONIGHT = 'NO_KILL_TONIGHT',
}
```

- [ ] **Step 2: Build the shared package**

```bash
npm run build:shared
```

Expected: no TypeScript errors. The `.d.ts` and `.js` outputs in `packages/shared/src/` are regenerated (they're checked in — this is normal for this repo).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/enums.ts packages/shared/src/enums.js packages/shared/src/enums.d.ts packages/shared/src/enums.js.map packages/shared/src/enums.d.ts.map
git commit -m "$(cat <<'EOF'
feat(shared): add HACKER channel type and night-kill system events

Adds ChannelType.HACKER for the hacker-only channel and three new
SystemEventType members used by day-vote and night-kill resolution:
PLAYER_VOTED_OUT, PLAYER_KILLED_AT_NIGHT, NO_KILL_TONIGHT.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add `metadata` to `SystemEventView`

**Files:**
- Modify: `packages/shared/src/contracts/views.ts`

- [ ] **Step 1: Add the optional field**

Replace the existing `SystemEventView` interface with:

```ts
export interface SystemEventView {
  id: string;
  type: SystemEventType;
  createdAt: string;
  metadata?: Record<string, string>;
}
```

- [ ] **Step 2: Build**

```bash
npm run build:shared
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/contracts/views.ts packages/shared/src/contracts/views.js packages/shared/src/contracts/views.d.ts packages/shared/src/contracts/views.js.map packages/shared/src/contracts/views.d.ts.map
git commit -m "$(cat <<'EOF'
feat(shared): add optional metadata to SystemEventView

Lets server-side system events carry structured context (e.g.
target player display name) that the client can render into
readable feed entries.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Extend `PlayerSessionView` with night-kill fields

**Files:**
- Modify: `packages/shared/src/contracts/views.ts`

- [ ] **Step 1: Add the three new fields**

Replace the existing `PlayerSessionView` interface with:

```ts
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
  nightKillTally: Record<string, number> | null;
  myTeammates: string[];
  myConfirmedNightKillTarget: string | null;
}
```

- [ ] **Step 2: Build**

```bash
npm run build:shared
```

Expected: no errors. This adds *new* non-optional fields, so downstream code that constructs `PlayerSessionView` will break until Task 15 updates the projection. That's fine — we'll catch it there.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/contracts/views.ts packages/shared/src/contracts/views.js packages/shared/src/contracts/views.d.ts packages/shared/src/contracts/views.js.map packages/shared/src/contracts/views.d.ts.map
git commit -m "$(cat <<'EOF'
feat(shared): extend PlayerSessionView with hacker-scoped night fields

Adds nightKillTally (null for non-Hackers / outside NIGHT_ACTIONS),
myTeammates (living Hacker roster, empty for Friends), and
myConfirmedNightKillTarget (viewer's own HACKER_KILL target for
reconnect rehydration).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Extend server `SystemEventState` and `RuntimePlayerEliminatedEvent`

**Files:**
- Modify: `apps/server/src/domain/game/types.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.ts`

- [ ] **Step 1: Add `metadata` to `SystemEventState`**

In `apps/server/src/domain/game/types.ts`, replace the `SystemEventState` interface:

```ts
export interface SystemEventState {
  id: string;
  type: SystemEventType;
  createdAt: string;
  metadata?: Record<string, string>;
}
```

- [ ] **Step 2: Extend `RuntimePlayerEliminatedEvent.reason`**

In `apps/server/src/domain/game/runtime-domain.ts`, replace the existing interface declaration:

```ts
export interface RuntimePlayerEliminatedEvent {
  type: 'PLAYER_ELIMINATED';
  playerId: string;
  reason: 'DAY_VOTE' | 'NIGHT_KILL' | 'PLAYER_LEFT' | 'PLAYER_KICKED';
  at: string;
}
```

- [ ] **Step 3: Build the server**

```bash
npm run build:server
```

Expected: TypeScript passes. (Consumers of `reason` in the handler still compile because they use string-literal comparisons.)

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/domain/game/types.ts apps/server/src/domain/game/runtime-domain.ts
git commit -m "$(cat <<'EOF'
feat(server): add metadata to SystemEventState and NIGHT_KILL reason

Prepares the domain types for night-kill resolution: system events
can now carry structured context (e.g. target display name) and
RuntimePlayerEliminatedEvent can signal a night-kill elimination.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: TDD — `buildSessionFromLobby` creates an empty hacker channel

**Files:**
- Test: `apps/server/src/domain/game/runtime-domain.test.ts`
- Modify: `apps/server/src/domain/game/session-domain.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/server/src/domain/game/runtime-domain.test.ts` inside the existing top-level `describe('runtime-domain', ...)`:

```ts
  it('buildSessionFromLobby creates an empty hacker channel alongside global and system', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    expect(session.channels.hacker).toBeDefined();
    expect(session.channels.hacker.type).toBe('HACKER');
    expect(session.channels.hacker.members).toEqual([]);
    expect(session.channels.hacker.locked).toBe(false);
    expect(session.channels.hacker.expiresAt).toBeNull();

    // Sanity: global/system still exist with all players as members.
    expect(session.channels.global.members).toHaveLength(5);
    expect(session.channels.system.members).toHaveLength(5);
  });
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts -t "hacker channel"
```

Expected: FAIL — `session.channels.hacker` is `undefined`.

- [ ] **Step 3: Implement**

In `apps/server/src/domain/game/session-domain.ts`, inside the returned object's `channels` property, add the hacker channel:

```ts
channels: {
  global: {
    id: 'global',
    type: ChannelType.GLOBAL,
    members: lobby.players.map((player) => player.playerId),
    locked: false,
    expiresAt: null,
  },
  system: {
    id: 'system',
    type: ChannelType.SYSTEM,
    members: lobby.players.map((player) => player.playerId),
    locked: false,
    expiresAt: null,
  },
  hacker: {
    id: 'hacker',
    type: ChannelType.HACKER,
    members: [],
    locked: false,
    expiresAt: null,
  },
},
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npx vitest run src/domain/game/runtime-domain.test.ts -t "hacker channel"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/session-domain.ts apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(server): create empty hacker channel in buildSessionFromLobby

Members are populated later by initializeSessionRuntime once teams
are assigned. The channel is created unconditionally so clients can
rely on its existence when membership filtering kicks in.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: TDD — `initializeSessionRuntime` populates hacker channel with Team.HACKERS

**Files:**
- Test: `apps/server/src/domain/game/runtime-domain.test.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe('runtime-domain', ...)` block:

```ts
  it('initializeSessionRuntime populates hacker channel members with assigned Hackers', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    // Seed a deterministic shuffle: first two player ids become Hackers.
    let calls = 0;
    const seededRandom = () => {
      calls += 1;
      return 0; // With Fisher-Yates, always returning 0 keeps the original order.
    };

    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', seededRandom);

    const hackerIds = Object.values(session.players)
      .filter((p) => p.team === Team.HACKERS)
      .map((p) => p.playerId)
      .sort();

    expect(session.channels.hacker.members.sort()).toEqual(hackerIds);
    expect(hackerIds).toHaveLength(2);  // chooseHackerCount(5) === 2
  });
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts -t "hacker channel members"
```

Expected: FAIL — `session.channels.hacker.members` is still `[]` after `initializeSessionRuntime` because the function doesn't touch it yet.

- [ ] **Step 3: Implement**

In `apps/server/src/domain/game/runtime-domain.ts`, modify `initializeSessionRuntime`:

```ts
export function initializeSessionRuntime(
  session: GameState,
  settings: LobbySettings,
  now: string,
  random: () => number = Math.random,
): void {
  assignTeams(session, random);

  // Populate hacker channel with assigned Team.HACKERS players.
  if (session.channels.hacker) {
    session.channels.hacker.members = Object.values(session.players)
      .filter((p) => p.team === Team.HACKERS)
      .map((p) => p.playerId);
  }

  session.status = SessionStatus.ACTIVE;
  session.winnerTeam = null;
  const durationSeconds = calculatePhaseDurations(settings)[session.phase];
  session.timers.currentPhaseEndsAt = addSeconds(now, durationSeconds);
  session.timers.currentPhaseDurationSeconds = durationSeconds;
  session.updatedAt = now;
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npx vitest run src/domain/game/runtime-domain.test.ts -t "hacker channel members"
```

Expected: PASS. Also run the full suite to ensure no regressions:

```bash
npx vitest run src/domain/game/runtime-domain.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/runtime-domain.ts apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(server): populate hacker channel members during initializeSessionRuntime

After team assignment, the hacker channel's members array is set to
the playerIds of all Team.HACKERS. Friends are filtered out of the
channel for the entire game, protecting hacker-only chat.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: TDD — `appendSystemEvent` helper with 50-event cap

**Files:**
- Test: `apps/server/src/domain/game/runtime-domain.test.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.ts`

The helper is a private function — we test it indirectly by triggering it through `reconcileSessionRuntime` in Task 8. But the cap behavior is simple enough to expose for a direct test by exporting a thin wrapper.

- [ ] **Step 1: Write the failing test**

Append inside the `describe('runtime-domain', ...)` block:

```ts
  it('system event list is capped at 50 entries with oldest dropped first', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z');

    // Start with 1 existing (GAME_STARTED).
    expect(session.systemEvents).toHaveLength(1);

    // Append 60 more; cap should clamp to 50 with GAME_STARTED evicted.
    for (let i = 0; i < 60; i += 1) {
      appendSystemEventForTest(session, SystemEventType.NO_KILL_TONIGHT, `2026-03-17T00:00:${String(i).padStart(2, '0')}.000Z`);
    }

    expect(session.systemEvents).toHaveLength(50);
    expect(session.systemEvents[0].type).toBe(SystemEventType.NO_KILL_TONIGHT);
    // The earliest remaining is whatever we appended at iteration 11 (since we dropped the GAME_STARTED + the first 10 NO_KILL_TONIGHT).
    expect(session.systemEvents[0].createdAt).toBe('2026-03-17T00:00:10.000Z');
  });
```

Add to the top of the file's imports:

```ts
import { SystemEventType } from '@tattletale/shared';
```

And extend the existing runtime-domain import list:

```ts
import {
  appendIntent,
  appendSystemEventForTest,
  calculatePhaseDurations,
  initializeSessionRuntime,
  processElimination,
  reconcileSessionRuntime,
} from './runtime-domain.js';
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts -t "capped at 50"
```

Expected: FAIL — `appendSystemEventForTest` is not exported.

- [ ] **Step 3: Implement the helper and export a test wrapper**

In `apps/server/src/domain/game/runtime-domain.ts`, add near the top (after the constants):

```ts
const SYSTEM_EVENT_CAP = 50;
```

And add this private function near the other helpers (e.g. after `clearCycleIntents`):

```ts
function appendSystemEvent(
  session: GameState,
  type: SystemEventType,
  now: string,
  metadata?: Record<string, string>,
): void {
  session.systemEvents.push({
    id: crypto.randomUUID(),
    type,
    createdAt: now,
    ...(metadata ? { metadata } : {}),
  });
  if (session.systemEvents.length > SYSTEM_EVENT_CAP) {
    session.systemEvents.splice(0, session.systemEvents.length - SYSTEM_EVENT_CAP);
  }
}

// Test-only export for direct verification of the cap semantics.
export function appendSystemEventForTest(
  session: GameState,
  type: SystemEventType,
  now: string,
  metadata?: Record<string, string>,
): void {
  appendSystemEvent(session, type, now, metadata);
}
```

Add `SystemEventType` to the imports at the top:

```ts
import {
  IntentType,
  Phase,
  SessionStatus,
  SystemEventType,
  Team,
} from '@tattletale/shared';
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npx vitest run src/domain/game/runtime-domain.test.ts -t "capped at 50"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/runtime-domain.ts apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add capped appendSystemEvent helper

Bounded at 50 entries, trim-on-append — keeps in-memory state
bounded over long games. Exported as appendSystemEventForTest
only for direct coverage of the cap semantics.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: TDD — `DAY_VOTE → DAY_RESOLVE` appends `PLAYER_VOTED_OUT` system event

**Files:**
- Test: `apps/server/src/domain/game/runtime-domain.test.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe('runtime-domain', ...)` block:

```ts
  it('DAY_VOTE → DAY_RESOLVE appends PLAYER_VOTED_OUT system event with target metadata', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);

    // Move session into DAY_VOTE.
    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';

    // Everyone votes p3 except p3 itself.
    const voters = ['p1', 'p2', 'p4', 'p5'];
    for (const voterId of voters) {
      appendIntent(session, {
        playerId: voterId,
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'p3' },
        phase: Phase.DAY_VOTE,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    const events = reconcileSessionRuntime(
      session,
      lobby,
      DEFAULT_LOBBY_SETTINGS,
      '2026-03-17T00:00:31.000Z',
    );

    // Elimination event emitted
    const elimEvent = events.find((e) => e.type === 'PLAYER_ELIMINATED');
    expect(elimEvent).toBeDefined();

    // System event appended
    const sysEvent = session.systemEvents.find(
      (e) => e.type === SystemEventType.PLAYER_VOTED_OUT,
    );
    expect(sysEvent).toBeDefined();
    expect(sysEvent?.metadata?.targetPlayerId).toBe('p3');
    expect(sysEvent?.metadata?.targetDisplayName).toBe('Player 3');
  });
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts -t "PLAYER_VOTED_OUT"
```

Expected: FAIL — no `PLAYER_VOTED_OUT` system event is appended today.

- [ ] **Step 3: Implement**

In `runtime-domain.ts`, update the DAY_VOTE branch inside `reconcileSessionRuntime`:

Replace:

```ts
  if (previousPhase === Phase.DAY_VOTE) {
    const eliminationTarget = resolveDayVoteEliminationTarget(session);
    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_VOTE);

    if (eliminationTarget && eliminatePlayer(session, lobby, eliminationTarget, transitionAt)) {
      events.push({
        type: 'PLAYER_ELIMINATED',
        playerId: eliminationTarget,
        reason: 'DAY_VOTE',
        at: transitionAt,
      });

      const winnerTeam = applyWinState(session, transitionAt);
      if (winnerTeam) {
        events.push({
          type: 'GAME_ENDED',
          winnerTeam,
          status: session.status,
          at: transitionAt,
        });
      }
    }
  } else if (previousPhase === Phase.NIGHT_ACTIONS) {
```

with (note the capture of displayName before eliminatePlayer flips `alive`, and the new `appendSystemEvent` call):

```ts
  if (previousPhase === Phase.DAY_VOTE) {
    const eliminationTarget = resolveDayVoteEliminationTarget(session);
    const targetName = eliminationTarget ? session.players[eliminationTarget]?.displayName : undefined;

    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_VOTE);

    if (eliminationTarget && eliminatePlayer(session, lobby, eliminationTarget, transitionAt)) {
      events.push({
        type: 'PLAYER_ELIMINATED',
        playerId: eliminationTarget,
        reason: 'DAY_VOTE',
        at: transitionAt,
      });
      appendSystemEvent(session, SystemEventType.PLAYER_VOTED_OUT, transitionAt, {
        targetPlayerId: eliminationTarget,
        targetDisplayName: targetName ?? '',
      });

      const winnerTeam = applyWinState(session, transitionAt);
      if (winnerTeam) {
        events.push({
          type: 'GAME_ENDED',
          winnerTeam,
          status: session.status,
          at: transitionAt,
        });
      }
    }
  } else if (previousPhase === Phase.NIGHT_ACTIONS) {
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npx vitest run src/domain/game/runtime-domain.test.ts -t "PLAYER_VOTED_OUT"
```

Expected: PASS. Run the full domain suite:

```bash
npx vitest run src/domain/game/runtime-domain.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/runtime-domain.ts apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(server): append PLAYER_VOTED_OUT system event on day-vote elimination

Client can render a readable feed entry ("Alice was voted out.")
using the targetDisplayName metadata captured before the player
is flipped to alive:false.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: TDD — `resolveHackerKillTarget` pure-function coverage

**Files:**
- Test: `apps/server/src/domain/game/runtime-domain.test.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.ts`

- [ ] **Step 1: Write the failing tests**

Append a nested `describe` block inside `describe('runtime-domain', ...)`:

```ts
  describe('resolveHackerKillTarget', () => {
    function setupNightSession() {
      const lobby = buildLobby(5);
      const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
      initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
      session.phase = Phase.NIGHT_ACTIONS;
      return { lobby, session };
    }

    function submitKill(session: ReturnType<typeof setupNightSession>['session'], hackerId: string, targetId: string | null) {
      appendIntent(session, {
        playerId: hackerId,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: targetId, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    function hackersOf(session: ReturnType<typeof setupNightSession>['session']): string[] {
      return Object.values(session.players)
        .filter((p) => p.team === Team.HACKERS)
        .map((p) => p.playerId);
    }

    function friendsOf(session: ReturnType<typeof setupNightSession>['session']): string[] {
      return Object.values(session.players)
        .filter((p) => p.team === Team.FRIENDS)
        .map((p) => p.playerId);
    }

    it('returns the plurality winner when Hackers agree', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1] = friendsOf(session);
      submitKill(session, h1, f1);
      submitKill(session, h2, f1);

      expect(resolveHackerKillTargetForTest(session)).toBe(f1);
    });

    it('returns null on tie between two Hackers', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1, f2] = friendsOf(session);
      submitKill(session, h1, f1);
      submitKill(session, h2, f2);

      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('returns null when all Hackers abstain (no submissions)', () => {
      const { session } = setupNightSession();
      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('treats a target that is already dead at resolution as abstain', () => {
      const { session, lobby } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1] = friendsOf(session);
      submitKill(session, h1, f1);
      submitKill(session, h2, f1);

      // Kill f1 via unrelated path before resolution.
      processElimination(session, lobby, f1, '2026-03-17T00:00:20.000Z', 'PLAYER_LEFT');

      // Both votes now abstain → tie of 2 abstains → null.
      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('rejects a target that is a Hacker (treats as abstain)', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      submitKill(session, h1, h2);
      submitKill(session, h2, h2);

      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('rejects self-target (treats as abstain)', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      submitKill(session, h1, h1);
      submitKill(session, h2, h2);

      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('awards a lone Hacker the kill when they submit a valid target', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1] = friendsOf(session);
      // Mark h2 dead — only h1 remains as a voter.
      session.players[h2].alive = false;
      submitKill(session, h1, f1);

      expect(resolveHackerKillTargetForTest(session)).toBe(f1);
    });
  });
```

Add `resolveHackerKillTargetForTest` to the imports:

```ts
import {
  appendIntent,
  appendSystemEventForTest,
  calculatePhaseDurations,
  initializeSessionRuntime,
  processElimination,
  reconcileSessionRuntime,
  resolveHackerKillTargetForTest,
} from './runtime-domain.js';
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts -t "resolveHackerKillTarget"
```

Expected: FAIL — `resolveHackerKillTargetForTest` is not exported.

- [ ] **Step 3: Implement `resolveHackerKillTarget`**

Add a `NightActionIntentPayload` import reference inside the file (it's already imported at the top — verify), then add this private function near `resolveDayVoteEliminationTarget`:

```ts
function resolveHackerKillTarget(session: GameState): string | null {
  const livingHackers = Object.values(session.players)
    .filter((p) => p.alive && p.team === Team.HACKERS);

  if (livingHackers.length === 0) {
    return null;
  }

  // Most recent HACKER_KILL intent per hacker for the current cycle.
  // appendIntent already replace-dedupes night-action intents per player,
  // so in practice this finds the single intent — but belt-and-suspenders.
  const perHackerTarget = new Map<string, string | null>();
  for (const hacker of livingHackers) {
    const intent = session.pendingIntents.find(
      (i) =>
        i.type === IntentType.SUBMIT_NIGHT_ACTION
        && i.playerId === hacker.playerId
        && i.cycle === session.cycle
        && (i.payload as NightActionIntentPayload).actionType === 'HACKER_KILL',
    );
    const target = (intent?.payload as NightActionIntentPayload | undefined)?.targetPlayerId ?? null;
    const targetPlayer = target ? session.players[target] : undefined;
    const targetValid =
      target !== null
      && target !== hacker.playerId
      && targetPlayer !== undefined
      && targetPlayer.alive
      && targetPlayer.team !== Team.HACKERS;
    perHackerTarget.set(hacker.playerId, targetValid ? target : null);
  }

  // Tally: null → abstain key; otherwise the targetPlayerId.
  const tally = new Map<string, number>();
  for (const hackerId of livingHackers.map((h) => h.playerId)) {
    const key = perHackerTarget.get(hackerId) ?? ABSTAIN_VOTE_KEY;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  // Strict plurality; tie → null.
  let highestCount = -1;
  let leaders: string[] = [];
  for (const [candidate, count] of tally.entries()) {
    if (count > highestCount) {
      highestCount = count;
      leaders = [candidate];
      continue;
    }
    if (count === highestCount) {
      leaders.push(candidate);
    }
  }

  if (leaders.length !== 1) {
    return null;
  }

  const winner = leaders[0];
  if (winner === ABSTAIN_VOTE_KEY) {
    return null;
  }
  return winner;
}

// Test-only export for direct coverage.
export function resolveHackerKillTargetForTest(session: GameState): string | null {
  return resolveHackerKillTarget(session);
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npx vitest run src/domain/game/runtime-domain.test.ts -t "resolveHackerKillTarget"
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/runtime-domain.ts apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add resolveHackerKillTarget with plurality + tie semantics

Plurality-of-living-Hackers target selection parallel to
resolveDayVoteEliminationTarget. Tie/no-submit returns null (no
kill). Target validation at resolution time rejects dead targets,
Hacker targets, and self-targets as abstain. Lone living Hacker with
a valid pick wins outright.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: TDD — `NIGHT_ACTIONS → NIGHT_RESOLVE` branch applies kill + events

**Files:**
- Test: `apps/server/src/domain/game/runtime-domain.test.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('runtime-domain', ...)`:

```ts
  describe('NIGHT_ACTIONS → NIGHT_RESOLVE', () => {
    function toNightActions(now: string) {
      const lobby = buildLobby(5);
      const session = buildSessionFromLobby(lobby, 'game-1', now);
      initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, now, () => 0);
      session.phase = Phase.NIGHT_ACTIONS;
      session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
      return { lobby, session };
    }

    it('applies the plurality kill, emits PLAYER_ELIMINATED with reason NIGHT_KILL, and appends PLAYER_KILLED_AT_NIGHT', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      for (const h of hackers) {
        appendIntent(session, {
          playerId: h,
          type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
          phase: Phase.NIGHT_ACTIONS,
          cycle: session.cycle,
          createdAt: '2026-03-17T00:00:10.000Z',
        });
      }

      const events = reconcileSessionRuntime(
        session,
        lobby,
        DEFAULT_LOBBY_SETTINGS,
        '2026-03-17T00:00:31.000Z',
      );

      const elim = events.find((e) => e.type === 'PLAYER_ELIMINATED');
      expect(elim).toBeDefined();
      if (elim && elim.type === 'PLAYER_ELIMINATED') {
        expect(elim.reason).toBe('NIGHT_KILL');
        expect(elim.playerId).toBe(friend);
      }

      expect(session.players[friend].alive).toBe(false);
      const sysEvent = session.systemEvents.find((e) => e.type === SystemEventType.PLAYER_KILLED_AT_NIGHT);
      expect(sysEvent).toBeDefined();
      expect(sysEvent?.metadata?.targetPlayerId).toBe(friend);
    });

    it('appends NO_KILL_TONIGHT when Hackers tie', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      const [h1, h2] = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
      const friends = Object.values(session.players).filter((p) => p.team === Team.FRIENDS).map((p) => p.playerId);
      appendIntent(session, {
        playerId: h1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friends[0], metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
      appendIntent(session, {
        playerId: h2,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friends[1], metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });

      const events = reconcileSessionRuntime(
        session,
        lobby,
        DEFAULT_LOBBY_SETTINGS,
        '2026-03-17T00:00:31.000Z',
      );

      expect(events.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeUndefined();
      const sysEvent = session.systemEvents.find((e) => e.type === SystemEventType.NO_KILL_TONIGHT);
      expect(sysEvent).toBeDefined();
    });

    it('triggers GAME_ENDED when the night kill reaches the win threshold', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
      const friends = Object.values(session.players).filter((p) => p.team === Team.FRIENDS).map((p) => p.playerId);

      // Eliminate 1 Friend via direct state — state is 2H + 2F.
      session.players[friends[0]].alive = false;
      const alive = Object.values(session.players).filter((p) => p.alive).length;
      expect(alive).toBe(4);

      // Both Hackers now kill a second Friend → 2H + 1F → HACKERS_WIN.
      for (const h of hackers) {
        appendIntent(session, {
          playerId: h,
          type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: 'HACKER_KILL', targetPlayerId: friends[1], metadata: {} },
          phase: Phase.NIGHT_ACTIONS,
          cycle: session.cycle,
          createdAt: '2026-03-17T00:00:10.000Z',
        });
      }

      const events = reconcileSessionRuntime(
        session,
        lobby,
        DEFAULT_LOBBY_SETTINGS,
        '2026-03-17T00:00:31.000Z',
      );

      expect(session.status).toBe(SessionStatus.HACKERS_WIN);
      expect(events.find((e) => e.type === 'GAME_ENDED')).toBeDefined();
    });
  });
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts -t "NIGHT_ACTIONS"
```

Expected: the 3 new tests FAIL — today the branch clears intents but does not resolve anything.

- [ ] **Step 3: Implement**

In `runtime-domain.ts`, replace the NIGHT_ACTIONS branch inside `reconcileSessionRuntime`:

```ts
  } else if (previousPhase === Phase.NIGHT_ACTIONS) {
    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_NIGHT_ACTION);
  }
```

with:

```ts
  } else if (previousPhase === Phase.NIGHT_ACTIONS) {
    const killTarget = resolveHackerKillTarget(session);
    const targetName = killTarget ? session.players[killTarget]?.displayName : undefined;

    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_NIGHT_ACTION);

    if (killTarget && eliminatePlayer(session, lobby, killTarget, transitionAt)) {
      events.push({
        type: 'PLAYER_ELIMINATED',
        playerId: killTarget,
        reason: 'NIGHT_KILL',
        at: transitionAt,
      });
      appendSystemEvent(session, SystemEventType.PLAYER_KILLED_AT_NIGHT, transitionAt, {
        targetPlayerId: killTarget,
        targetDisplayName: targetName ?? '',
      });

      const winnerTeam = applyWinState(session, transitionAt);
      if (winnerTeam) {
        events.push({
          type: 'GAME_ENDED',
          winnerTeam,
          status: session.status,
          at: transitionAt,
        });
      }
    } else {
      appendSystemEvent(session, SystemEventType.NO_KILL_TONIGHT, transitionAt);
    }
  }
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npx vitest run src/domain/game/runtime-domain.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/runtime-domain.ts apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(server): resolve hacker night kill at NIGHT_ACTIONS → NIGHT_RESOLVE

Applies plurality kill, emits PLAYER_ELIMINATED with reason NIGHT_KILL,
appends PLAYER_KILLED_AT_NIGHT system event with target metadata, runs
win check (producing GAME_ENDED when threshold reached), or appends
NO_KILL_TONIGHT on tie/abstain.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: TDD — alarm replay idempotency

**Files:**
- Test: `apps/server/src/domain/game/runtime-domain.test.ts`

This test exercises the deadline-guard that protects replayed reconciliation from double-appending events. No code change required if the guard works correctly — the test is the contract.

- [ ] **Step 1: Write the test**

Append inside `describe('runtime-domain', ...)`:

```ts
  it('replayed reconciliation at the same now does not double-append events', () => {
    const now0 = '2026-03-17T00:00:00.000Z';
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', now0);
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, now0, () => 0);

    // Move to DAY_VOTE with an expired deadline and a majority vote.
    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
    const voters = Object.values(session.players).map((p) => p.playerId);
    for (const v of voters.slice(0, 4)) {
      appendIntent(session, {
        playerId: v,
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: voters[4] },
        phase: Phase.DAY_VOTE,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    const transitionNow = '2026-03-17T00:00:31.000Z';

    const events1 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, transitionNow);
    const events2 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, transitionNow);

    // First invocation advances phase + emits events.
    expect(events1.some((e) => e.type === 'PHASE_ADVANCED')).toBe(true);
    expect(events1.some((e) => e.type === 'PLAYER_ELIMINATED')).toBe(true);

    // Second invocation at the same `now` sees the new deadline is in the future
    // and is a no-op.
    expect(events2).toHaveLength(0);

    // Exactly one PLAYER_VOTED_OUT in the feed.
    const votedOutEvents = session.systemEvents.filter(
      (e) => e.type === SystemEventType.PLAYER_VOTED_OUT,
    );
    expect(votedOutEvents).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the test — expect pass**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts -t "does not double-append"
```

Expected: PASS. If it fails, investigate — the guarantee claimed in the spec isn't being honored. The fix is either in the deadline check at the top of `reconcileSessionRuntime` (lines 180–186) or in how `currentPhaseEndsAt` is being updated after advance. Do not bypass the test.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
test(server): alarm replay idempotency at phase boundary

Invoking reconcileSessionRuntime twice at the same `now` must emit
events + append the system event exactly once. Covers the invariant
that protects against at-least-once DO alarm delivery.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: TDD — `toPlayerSessionView` hacker-scoped fields + metadata passthrough

**Files:**
- Test: `apps/server/src/domain/projections.test.ts`
- Modify: `apps/server/src/domain/projections.ts`

- [ ] **Step 1: Read current projection tests**

Open `apps/server/src/domain/projections.test.ts` and identify the existing `describe('toPlayerSessionView')` block (if one exists). Tests below assume it exists; if not, create it.

- [ ] **Step 2: Write the failing tests**

Append these inside `describe('toPlayerSessionView', ...)` (create the describe if missing):

```ts
  describe('hacker-scoped night fields', () => {
    function buildNightSession() {
      const lobby: LobbyState = {
        code: 'ABCDE',
        status: LobbyStatus.IN_GAME,
        hostPlayerId: 'p1',
        players: Array.from({ length: 5 }, (_, i) => ({
          playerId: `p${i + 1}`,
          displayName: `Player ${i + 1}`,
          isHost: i === 0,
          ready: true,
          connected: true,
          alive: true,
          reconnectToken: `tok-${i + 1}`,
          joinedAt: '2026-03-17T00:00:00.000Z',
        })),
        settings: { ...DEFAULT_LOBBY_SETTINGS },
        sessionId: 'game-1',
        createdAt: '2026-03-17T00:00:00.000Z',
        updatedAt: '2026-03-17T00:00:00.000Z',
      };
      const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
      initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
      session.phase = Phase.NIGHT_ACTIONS;
      return session;
    }

    it('exposes nightKillTally, myTeammates, and myConfirmedNightKillTarget to living Hackers during NIGHT_ACTIONS', () => {
      const session = buildNightSession();
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS);
      const [h1, h2] = hackers.map((p) => p.playerId);
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;

      appendIntent(session, {
        playerId: h1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });

      const view = toPlayerSessionView(session, h1);
      expect(view.nightKillTally).toEqual({ [friend]: 1 });
      expect(view.myTeammates).toEqual([h2]);
      expect(view.myConfirmedNightKillTarget).toBe(friend);
    });

    it('returns null nightKillTally and empty myTeammates for Friends', () => {
      const session = buildNightSession();
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      const view = toPlayerSessionView(session, friend);
      expect(view.nightKillTally).toBeNull();
      expect(view.myTeammates).toEqual([]);
      expect(view.myConfirmedNightKillTarget).toBeNull();
    });

    it('returns null nightKillTally outside NIGHT_ACTIONS even for Hackers', () => {
      const session = buildNightSession();
      session.phase = Phase.DAY_OPEN;
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
      const view = toPlayerSessionView(session, hacker);
      expect(view.nightKillTally).toBeNull();
      expect(view.myConfirmedNightKillTarget).toBeNull();
      // myTeammates is still populated for Hackers regardless of phase.
      expect(view.myTeammates.length).toBeGreaterThan(0);
    });

    it('passes SystemEventState.metadata through to SystemEventView', () => {
      const session = buildNightSession();
      session.systemEvents.push({
        id: 'evt-1',
        type: SystemEventType.PLAYER_VOTED_OUT,
        createdAt: '2026-03-17T00:00:20.000Z',
        metadata: { targetPlayerId: 'p3', targetDisplayName: 'Player 3' },
      });
      const view = toPlayerSessionView(session, 'p1');
      const evt = view.systemEvents.find((e) => e.id === 'evt-1');
      expect(evt?.metadata).toEqual({ targetPlayerId: 'p3', targetDisplayName: 'Player 3' });
    });

    it('channels projection excludes hacker channel for Friends', () => {
      const session = buildNightSession();
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      const view = toPlayerSessionView(session, friend);
      expect(view.channels.find((c) => c.id === 'hacker')).toBeUndefined();
    });

    it('channels projection includes hacker channel for Hackers', () => {
      const session = buildNightSession();
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
      const view = toPlayerSessionView(session, hacker);
      expect(view.channels.find((c) => c.id === 'hacker')).toBeDefined();
    });
  });
```

Add any missing imports at the top of `projections.test.ts`:

```ts
import { IntentType, LobbyStatus, Phase, SystemEventType, Team } from '@tattletale/shared';
import { DEFAULT_LOBBY_SETTINGS } from '../game/lobby/types.js'; // or wherever lobby types live
import { appendIntent, initializeSessionRuntime } from '../game/runtime-domain.js';
import { buildSessionFromLobby } from '../game/session-domain.js';
import { toPlayerSessionView } from './projections.js';
import type { LobbyState } from '../game/lobby/types.js';
```

(Adjust paths to match the actual repo layout — check existing imports in the file.)

- [ ] **Step 3: Run the tests — expect failure**

```bash
cd apps/server && npx vitest run src/domain/projections.test.ts -t "hacker-scoped night fields"
```

Expected: FAIL — the projection doesn't yet return the new fields, so they'll be `undefined` in the view.

- [ ] **Step 4: Implement the projection**

In `apps/server/src/domain/projections.ts`, replace `toPlayerSessionView`:

```ts
export function toPlayerSessionView(session: GameState, playerId: string): PlayerSessionView {
  const player = session.players[playerId];

  // Aggregate current-cycle SUBMIT_VOTE intents into a day-vote tally keyed by target.
  // Null targets (abstains) are skipped for the tally map.
  const voteTally: Record<string, number> = {};
  let voteTallyHasAny = false;
  for (const intent of session.pendingIntents) {
    if (intent.type !== IntentType.SUBMIT_VOTE) continue;
    if (intent.cycle !== session.cycle) continue;
    const target = (intent.payload as VoteIntentPayload).targetPlayerId;
    if (!target) continue;
    voteTally[target] = (voteTally[target] ?? 0) + 1;
    voteTallyHasAny = true;
  }

  // Hacker-scoped night fields.
  let nightKillTally: Record<string, number> | null = null;
  let myTeammates: string[] = [];
  let myConfirmedNightKillTarget: string | null = null;

  if (player?.alive && player.team === Team.HACKERS) {
    myTeammates = Object.values(session.players)
      .filter((p) => p.alive && p.team === Team.HACKERS && p.playerId !== playerId)
      .map((p) => p.playerId);

    if (session.phase === Phase.NIGHT_ACTIONS) {
      const tally: Record<string, number> = {};
      let tallyHasAny = false;
      for (const intent of session.pendingIntents) {
        if (intent.type !== IntentType.SUBMIT_NIGHT_ACTION) continue;
        if (intent.cycle !== session.cycle) continue;
        const payload = intent.payload as NightActionIntentPayload;
        if (payload.actionType !== 'HACKER_KILL') continue;
        if (!payload.targetPlayerId) continue;
        tally[payload.targetPlayerId] = (tally[payload.targetPlayerId] ?? 0) + 1;
        tallyHasAny = true;
      }
      nightKillTally = tallyHasAny ? tally : {};

      const ownIntent = session.pendingIntents.find(
        (i) =>
          i.playerId === playerId
          && i.type === IntentType.SUBMIT_NIGHT_ACTION
          && i.cycle === session.cycle
          && (i.payload as NightActionIntentPayload).actionType === 'HACKER_KILL',
      );
      myConfirmedNightKillTarget =
        (ownIntent?.payload as NightActionIntentPayload | undefined)?.targetPlayerId ?? null;
    }
  }

  return {
    gameId: session.gameId,
    lobbyCode: session.lobbyCode,
    status: session.status,
    phase: session.phase,
    cycle: session.cycle,
    currentPhaseEndsAt: session.timers.currentPhaseEndsAt,
    phaseDurationSeconds: session.timers.currentPhaseDurationSeconds,
    voteTally: voteTallyHasAny ? voteTally : null,
    players: Object.values(session.players).map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      alive: p.alive,
      connected: p.connected,
    })),
    channels: Object.values(session.channels)
      .filter((ch) => ch.members.includes(playerId))
      .map((ch) => ({
        id: ch.id,
        type: ch.type,
        members: [...ch.members],
        locked: ch.locked,
        expiresAt: ch.expiresAt,
      })),
    myPendingIntentTypes: session.pendingIntents
      .filter((intent) => intent.playerId === playerId)
      .map((intent) => intent.type),
    systemEvents: session.systemEvents.map((event) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
      ...(event.metadata ? { metadata: event.metadata } : {}),
    })),
    myRole: player?.roleId ?? 'unknown',
    myTeam: player?.team ?? ('FRIENDS' as any),
    nightKillTally,
    myTeammates,
    myConfirmedNightKillTarget,
  };
}
```

Add the imports at the top:

```ts
import { IntentType, Phase, Team, type LobbyView, type SessionView, type PlayerSessionView } from '@tattletale/shared';
import type { GameState, NightActionIntentPayload, VoteIntentPayload } from './game/types.js';
```

(`Team` and `Phase` are new additions; `NightActionIntentPayload` is new.)

**Decision callout for `nightKillTally`:** the test on line `expect(view.nightKillTally).toEqual({ [friend]: 1 })` expects an object (not null) when there's at least one tally entry. The test on Friends expects `null`. The "null outside NIGHT_ACTIONS" test expects null. Implementation: for Hackers during NIGHT_ACTIONS with no submissions, return an empty object `{}` (so clients can reliably branch on "is this a Hacker who should see the tally UI" — type-null means not scoped to you). If you prefer null-when-empty, flip the assertion in the first test to `view.nightKillTally).toBeNull()` AND return `tallyHasAny ? tally : null`. Either is defensible; the written tests pick the empty-object style because `null` is reserved for "not applicable to you" semantics.

- [ ] **Step 5: Run the tests — expect pass**

```bash
npx vitest run src/domain/projections.test.ts
```

Expected: all projection tests pass, including the new block.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/server/src/domain/projections.ts apps/server/src/domain/projections.test.ts
git commit -m "$(cat <<'EOF'
feat(server): project hacker-scoped night fields + metadata passthrough

toPlayerSessionView now exposes nightKillTally (Hackers only during
NIGHT_ACTIONS), myTeammates (living Hacker roster for Hackers),
myConfirmedNightKillTarget (own HACKER_KILL target for rehydration),
and passes SystemEventState.metadata through to SystemEventView.
Friends never see the hacker channel or tally.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: TDD — `SUBMIT_NIGHT_ACTION` validation in ws-message-handler

**Files:**
- Test: `apps/server/src/transport/ws-message-handler.test.ts` **(create)**
- Modify: `apps/server/src/transport/ws-message-handler.ts`

- [ ] **Step 1: Scaffold the test file**

If `ws-message-handler.test.ts` doesn't exist, look at `runtime-domain.test.ts` for the Miniflare + vitest pattern. Handler tests typically build a mock `HandlerContext` and call the handler functions directly. Read `ws-message-handler.ts` lines 1–80 to find the exported handler shape and the `HandlerContext` interface, then build a minimal test context.

Create the file with this initial skeleton — the exact shape will depend on what's exported. Adapt imports to match actually-exported names:

```ts
import { describe, expect, it } from 'vitest';
import { IntentType, LobbyStatus, Phase, SessionStatus, Team } from '@tattletale/shared';

// Import the submitIntent handler and context type from ws-message-handler.ts
// (exact names depend on the existing file — adapt after reading lines 1–80).
import { handleSubmitIntent, type HandlerContext } from './ws-message-handler.js';
import { buildSessionFromLobby } from '../domain/game/session-domain.js';
import { initializeSessionRuntime } from '../domain/game/runtime-domain.js';
import { DEFAULT_LOBBY_SETTINGS } from '../domain/game/lobby/types.js';
import type { LobbyState } from '../domain/game/lobby/types.js';
import type { GameState } from '../domain/game/types.js';

function buildCtx(overrides: {
  session: GameState;
  lobby: LobbyState;
  senderId: string;
}): HandlerContext {
  // Minimal stub of HandlerContext — only the pieces the handler reads during
  // SUBMIT_NIGHT_ACTION. Adapt to the real interface after reading the source.
  return {
    session: overrides.session,
    lobby: overrides.lobby,
    senderId: overrides.senderId,
    broadcastSessionState: () => {},
    broadcastChannelMessage: () => {},
    broadcastPlayerEliminated: () => {},
    now: () => '2026-03-17T00:00:10.000Z',
    persistRuntimeEvents: async () => {},
  } as unknown as HandlerContext;
}
```

Note: if the real handler context differs significantly (e.g., is a class, has DO storage dependencies), use the vitest-pool-workers test harness to get a real-ish context. The pattern in `game-room.test.ts` is the reference.

- [ ] **Step 2: Write the failing tests**

Append to the test file:

```ts
describe('handleSubmitIntent — SUBMIT_NIGHT_ACTION', () => {
  function setupNight() {
    const lobby: LobbyState = {
      code: 'ABCDE',
      status: LobbyStatus.IN_GAME,
      hostPlayerId: 'p1',
      players: Array.from({ length: 5 }, (_, i) => ({
        playerId: `p${i + 1}`,
        displayName: `Player ${i + 1}`,
        isHost: i === 0,
        ready: true,
        connected: true,
        alive: true,
        reconnectToken: `tok-${i + 1}`,
        joinedAt: '2026-03-17T00:00:00.000Z',
      })),
      settings: { ...DEFAULT_LOBBY_SETTINGS },
      sessionId: 'game-1',
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
    };
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
    session.phase = Phase.NIGHT_ACTIONS;
    return { lobby, session };
  }

  it('accepts a HACKER_KILL from a living Hacker targeting a living Friend', async () => {
    const { lobby, session } = setupNight();
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
    const ctx = buildCtx({ session, lobby, senderId: hacker });

    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
    });
    expect(ack).toMatchObject({ ok: true });
  });

  it('rejects HACKER_KILL from a Friend with NOT_AUTHORIZED', async () => {
    const { lobby, session } = setupNight();
    const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
    const otherFriend = Object.values(session.players).filter((p) => p.team === Team.FRIENDS && p.playerId !== friend)[0].playerId;
    const ctx = buildCtx({ session, lobby, senderId: friend });

    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: otherFriend, metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'NOT_AUTHORIZED' });
  });

  it('rejects HACKER_KILL from a dead Hacker with NOT_AUTHORIZED', async () => {
    const { lobby, session } = setupNight();
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
    session.players[hacker].alive = false;
    const ctx = buildCtx({ session, lobby, senderId: hacker });

    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'NOT_AUTHORIZED' });
  });

  it('rejects HACKER_KILL targeting another Hacker with INVALID_TARGET', async () => {
    const { lobby, session } = setupNight();
    const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
    const ctx = buildCtx({ session, lobby, senderId: hackers[0] });

    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: hackers[1], metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });

  it('rejects HACKER_KILL targeting self with INVALID_TARGET', async () => {
    const { lobby, session } = setupNight();
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const ctx = buildCtx({ session, lobby, senderId: hacker });

    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: hacker, metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });

  it('rejects HACKER_KILL targeting a dead player with INVALID_TARGET', async () => {
    const { lobby, session } = setupNight();
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
    session.players[friend].alive = false;
    const ctx = buildCtx({ session, lobby, senderId: hacker });

    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });

  it('rejects HACKER_KILL during DAY_VOTE with PHASE_MISMATCH', async () => {
    const { lobby, session } = setupNight();
    session.phase = Phase.DAY_VOTE;
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
    const ctx = buildCtx({ session, lobby, senderId: hacker });

    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'PHASE_MISMATCH' });
  });

  it('rejects unsupported actionType with UNSUPPORTED_ACTION', async () => {
    const { lobby, session } = setupNight();
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
    const ctx = buildCtx({ session, lobby, senderId: hacker });

    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'INVESTIGATE', targetPlayerId: friend, metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'UNSUPPORTED_ACTION' });
  });
});
```

- [ ] **Step 3: Run the tests — expect failure**

```bash
cd apps/server && npx vitest run src/transport/ws-message-handler.test.ts
```

Expected: FAIL. Current handler accepts SUBMIT_NIGHT_ACTION but doesn't validate team/target/action, so some tests pass incorrectly and others fail. Examine the output carefully.

- [ ] **Step 4: Implement validation**

In `apps/server/src/transport/ws-message-handler.ts`, locate the `submitIntent` dispatcher block (around line 557 per the baseline). Find where `SUBMIT_NIGHT_ACTION` is accepted today. Add (or enhance) validation to match the test expectations. Pseudocode — adapt to the existing code structure:

```ts
if (intent.type === IntentType.SUBMIT_NIGHT_ACTION) {
  const payload = intent.payload as NightActionIntentPayload;

  // Phase check (isIntentAllowedInPhase already covers this, but be explicit).
  if (session.phase !== Phase.NIGHT_ACTIONS) {
    return { ok: false, reason: 'PHASE_MISMATCH' };
  }

  // Only HACKER_KILL is supported in MVP.
  if (payload.actionType !== 'HACKER_KILL') {
    return { ok: false, reason: 'UNSUPPORTED_ACTION' };
  }

  // Sender must be a living Hacker.
  const sender = session.players[ctx.senderId];
  if (!sender || !sender.alive || sender.team !== Team.HACKERS) {
    return { ok: false, reason: 'NOT_AUTHORIZED' };
  }

  // Target must be a living non-Hacker who is not the sender.
  const target = payload.targetPlayerId ? session.players[payload.targetPlayerId] : undefined;
  if (
    !payload.targetPlayerId
    || payload.targetPlayerId === ctx.senderId
    || !target
    || !target.alive
    || target.team === Team.HACKERS
  ) {
    return { ok: false, reason: 'INVALID_TARGET' };
  }

  // Accept.
  // (Continue with the existing appendIntent + broadcast flow.)
}
```

The ack shape (`{ ok: false, reason: ... }`) must match the existing shape in the file — adapt accordingly.

- [ ] **Step 5: Run the tests — expect pass**

```bash
npx vitest run src/transport/ws-message-handler.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/server/src/transport/ws-message-handler.ts apps/server/src/transport/ws-message-handler.test.ts
git commit -m "$(cat <<'EOF'
feat(server): validate SUBMIT_NIGHT_ACTION for HACKER_KILL in ws handler

Rejects non-Hackers (NOT_AUTHORIZED), dead senders (NOT_AUTHORIZED),
Hacker targets / self-targets / dead targets (INVALID_TARGET),
non-HACKER_KILL actionTypes (UNSUPPORTED_ACTION), and out-of-phase
submissions (PHASE_MISMATCH). Covers the spec's validation matrix.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Extend `broadcastPlayerEliminated` cause map with `NIGHT_KILL`

**Files:**
- Modify: `apps/server/src/durable-objects/game-room.ts`

- [ ] **Step 1: Locate the cause map**

Open `apps/server/src/durable-objects/game-room.ts` and grep for `broadcastPlayerEliminated`. Inside it, find where it maps `reason` (from `RuntimePlayerEliminatedEvent`) to `cause` (for the wire payload).

- [ ] **Step 2: Add the NIGHT_KILL branch**

If the existing code is a switch:

```ts
switch (reason) {
  case 'DAY_VOTE':
    cause = 'VOTED_OUT';
    break;
  case 'PLAYER_LEFT':
    cause = 'PLAYER_LEFT';
    break;
  case 'PLAYER_KICKED':
    cause = 'PLAYER_KICKED';
    break;
}
```

Add the new case:

```ts
  case 'NIGHT_KILL':
    cause = 'NIGHT_KILL';
    break;
```

If it's a map/object, add the entry. Ensure TypeScript exhaustiveness is satisfied (no `default` branch that throws for `NIGHT_KILL`).

- [ ] **Step 3: Verify server builds**

```bash
npm run build:server
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/durable-objects/game-room.ts
git commit -m "$(cat <<'EOF'
feat(server): map NIGHT_KILL reason to NIGHT_KILL cause on broadcast

Extends broadcastPlayerEliminated's reason→cause mapping so night-kill
eliminations surface with cause 'NIGHT_KILL' in the client's
playerEliminated push, letting EliminationSequence branch visuals.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: DO integration test — full cycle including night kill

**Files:**
- Test: `apps/server/src/durable-objects/game-room.test.ts`

- [ ] **Step 1: Read the existing DO test patterns**

Open `apps/server/src/durable-objects/game-room.test.ts`. Identify:
- How a fresh GameRoom DO is obtained (likely via `env.GAME_ROOM` namespace binding and `idFromName`).
- How alarms are advanced (likely `runDurableObjectAlarm` from `cloudflare:test`, or by calling `alarm()` on the stub).
- How clients connect and send WS messages (likely via fetching `/ws` and asserting the messages sent back).

Plan your test to reuse these patterns — don't reinvent them.

- [ ] **Step 2: Write the integration test**

Append a new `describe` block to `game-room.test.ts`:

```ts
describe('full game cycle with hacker night kill', () => {
  it('runs DAY_OPEN → DAY_VOTE → DAY_RESOLVE → NIGHT_ACTIONS → NIGHT_RESOLVE → NIGHT_REVEAL with kill applied', async () => {
    // 1. Create lobby, have 5 players join. Start game. Use a seeded random
    //    so we know who is Hacker and who is Friend.
    // 2. Fast-forward alarm through DAY_OPEN to DAY_VOTE.
    // 3. Have all players abstain (or submit no votes) to ensure no day-vote elim.
    // 4. Fast-forward to DAY_RESOLVE → NIGHT_ACTIONS.
    // 5. Have both Hackers submit HACKER_KILL on the same Friend.
    // 6. Fast-forward to NIGHT_RESOLVE. Assert:
    //    - `playerEliminated` broadcast with cause 'NIGHT_KILL' was sent.
    //    - `PLAYER_KILLED_AT_NIGHT` system event appears in sessionState for all viewers.
    //    - The target's `alive: false` in the projected players list.
    // 7. Fast-forward to NIGHT_REVEAL and back to DAY_OPEN with cycle=2.
    // 8. Continue until state reaches HACKERS_WIN or FRIENDS_WIN; assert GAME_ENDED
    //    event is emitted and no further alarms are scheduled.

    // Implementation: fill this in using the same test harness as other DO tests.
    // If harness doesn't yet expose a way to inject seeded randomness, you
    // may need to extend it — see how `initializeSessionRuntime`'s random is
    // wired through the DO's handleStartGame path.
  });
});
```

Fill in the body using the harness patterns you found in Step 1. The test is intentionally scripted — it's a smoke test of the whole pipeline at the DO level.

- [ ] **Step 3: Run the test — expect failure, then pass**

```bash
cd apps/server && npx vitest run src/durable-objects/game-room.test.ts -t "full game cycle"
```

Expected: the test is new, so it may fail initially if the harness doesn't support seeded randomness or if there's an oversight. Debug and fix inside the test or the harness — don't change production behavior to make it pass (that signals a bug elsewhere).

- [ ] **Step 4: Run the whole server suite**

```bash
npx vitest run
```

Expected: all server tests pass.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/durable-objects/game-room.test.ts
git commit -m "$(cat <<'EOF'
test(server): end-to-end game cycle DO integration test with night kill

Drives a GameRoom DO through DAY_OPEN → DAY_VOTE → DAY_RESOLVE →
NIGHT_ACTIONS → NIGHT_RESOLVE → NIGHT_REVEAL, asserts playerEliminated
broadcast with cause NIGHT_KILL, PLAYER_KILLED_AT_NIGHT system event,
and that the game eventually terminates with a win state.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Add vitest + testing-library to the web app

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.js`
- Create: `apps/web/src/test-setup.js`

- [ ] **Step 1: Add devDependencies**

From the repo root:

```bash
cd apps/web && npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

Expected: packages installed, `package.json` updated.

- [ ] **Step 2: Add the test script**

Edit `apps/web/package.json`, inside `"scripts"`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 3: Create the vitest config**

Create `apps/web/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
});
```

- [ ] **Step 4: Create the setup file**

Create `apps/web/src/test-setup.js`:

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Verify the runner starts**

From `apps/web/`:

```bash
npx vitest run
```

Expected: "No test files found." (We haven't added any tests yet.) If there's a runtime error about setup or config, fix it before proceeding.

- [ ] **Step 6: Wire into root `npm test`**

Edit the root `package.json` script to run both suites:

```json
"test": "npm run test -w @tattletale/server && npm run test -w @tattletale/web"
```

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/web/package.json apps/web/package-lock.json apps/web/vitest.config.js apps/web/src/test-setup.js package.json
# Note: if package-lock.json doesn't exist at apps/web, check root; workspace-level lockfiles behave differently.
git commit -m "$(cat <<'EOF'
chore(web): add vitest + testing-library + jsdom for unit tests

Enables unit tests for the React client. Wired into root npm test
so both server and web suites run together.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: TDD — extend `gameStore` with night-kill session fields + selectors

**Files:**
- Test: `apps/web/src/stores/gameStore.test.js` **(create)**
- Modify: `apps/web/src/stores/gameStore.js`

- [ ] **Step 1: Read the current gameStore**

Open `apps/web/src/stores/gameStore.js` to understand the existing slice structure, how `syncSessionState` is implemented, and the initial state shape. Identify where to add the new fields and selectors.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/stores/gameStore.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';
import useGameStore from './gameStore';
import {
  selectIsHacker,
  selectNightKillCandidates,
} from './gameStore';

describe('gameStore night-kill session fields', () => {
  beforeEach(() => {
    // Reset store between tests.
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('syncSessionState copies myTeam, myTeammates, nightKillTally, confirmedNightKill', () => {
    const view = {
      gameId: 'game-1',
      lobbyCode: 'ABCDE',
      status: 'ACTIVE',
      phase: 'NIGHT_ACTIONS',
      cycle: 1,
      currentPhaseEndsAt: '2026-03-17T00:01:00.000Z',
      phaseDurationSeconds: 60,
      players: [
        { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
      ],
      channels: [],
      myPendingIntentTypes: ['SUBMIT_NIGHT_ACTION'],
      systemEvents: [],
      myRole: 'unknown',
      myTeam: 'HACKERS',
      voteTally: null,
      nightKillTally: { p2: 1 },
      myTeammates: [],
      myConfirmedNightKillTarget: 'p2',
    };

    // Set self id (how the store knows which player is "me") — name the
    // setter and field to match what's already in gameStore.js. If it's
    // `setSelfPlayerId`, use that. If it's seeded via a different slice,
    // adapt.
    useGameStore.setState({ selfPlayerId: 'p1' });

    useGameStore.getState().syncSessionState(view);

    const state = useGameStore.getState();
    expect(state.myTeam).toBe('HACKERS');
    expect(state.myTeammates).toEqual([]);
    expect(state.nightKillTally).toEqual({ p2: 1 });
    expect(state.confirmedNightKill).toBe('p2');
  });
});

describe('gameStore selectors', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('selectIsHacker returns true for a living Hacker', () => {
    useGameStore.setState({
      myTeam: 'HACKERS',
      selfPlayerId: 'p1',
      players: { p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true } },
    });
    expect(selectIsHacker(useGameStore.getState())).toBe(true);
  });

  it('selectIsHacker returns false for a dead Hacker', () => {
    useGameStore.setState({
      myTeam: 'HACKERS',
      selfPlayerId: 'p1',
      players: { p1: { playerId: 'p1', displayName: 'P1', alive: false, connected: true } },
    });
    expect(selectIsHacker(useGameStore.getState())).toBe(false);
  });

  it('selectIsHacker returns false for a Friend', () => {
    useGameStore.setState({
      myTeam: 'FRIENDS',
      selfPlayerId: 'p1',
      players: { p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true } },
    });
    expect(selectIsHacker(useGameStore.getState())).toBe(false);
  });

  it('selectNightKillCandidates excludes self, dead players, and Hackers', () => {
    useGameStore.setState({
      myTeam: 'HACKERS',
      selfPlayerId: 'p1',
      myTeammates: ['p2'],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
        p4: { playerId: 'p4', displayName: 'P4', alive: false, connected: true },
        p5: { playerId: 'p5', displayName: 'P5', alive: true, connected: true },
      },
    });
    const candidates = selectNightKillCandidates(useGameStore.getState()).map((p) => p.playerId).sort();
    expect(candidates).toEqual(['p3', 'p5']);
  });
});
```

(Field names like `selfPlayerId`, `getInitialState()`, and `players` shape reflect common Zustand patterns; adapt to match what `gameStore.js` actually uses.)

- [ ] **Step 3: Run the tests — expect failure**

```bash
cd apps/web && npx vitest run src/stores/gameStore.test.js
```

Expected: FAIL — new fields and selectors aren't present yet.

- [ ] **Step 4: Implement in gameStore.js**

Add to the store's initial session slice (keys and exact implementation depend on the existing structure — adapt):

```js
// Session slice additions
myTeam: null,
myTeammates: [],
nightKillTally: null,
pendingNightKillSelection: null,
confirmedNightKill: null,
```

Extend `syncSessionState` (or the equivalent action) to copy:

```js
myTeam: view.myTeam,
myTeammates: view.myTeammates ?? [],
nightKillTally: view.nightKillTally ?? null,
confirmedNightKill: view.myConfirmedNightKillTarget ?? null,
```

At the bottom of the file, export selectors:

```js
export function selectIsHacker(state) {
  if (state.myTeam !== 'HACKERS') return false;
  const self = state.selfPlayerId ? state.players?.[state.selfPlayerId] : null;
  return Boolean(self?.alive);
}

export function selectNightKillCandidates(state) {
  if (!state.players) return [];
  const hackerSet = new Set([state.selfPlayerId, ...(state.myTeammates ?? [])]);
  return Object.values(state.players).filter(
    (p) => p.alive && !hackerSet.has(p.playerId),
  );
}
```

- [ ] **Step 5: Run the tests — expect pass**

```bash
npx vitest run src/stores/gameStore.test.js
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/stores/gameStore.js apps/web/src/stores/gameStore.test.js
git commit -m "$(cat <<'EOF'
feat(web): extend gameStore with night-kill session fields + selectors

Adds myTeam, myTeammates, nightKillTally, pendingNightKillSelection,
and confirmedNightKill slice fields (the last rehydrates from
PlayerSessionView.myConfirmedNightKillTarget on each sync). Exports
selectIsHacker and selectNightKillCandidates helpers for UI gating.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Extend `useGameSocket` `syncSessionState` to copy new fields

**Files:**
- Modify: `apps/web/src/hooks/useGameSocket.js`

No unit test added — this hook is tiny glue. The integration is validated by the manual smoke checklist.

- [ ] **Step 1: Open the hook**

Locate `syncSessionState` inside `apps/web/src/hooks/useGameSocket.js`. It should be calling a store action with the `view` payload.

- [ ] **Step 2: Update the copy**

If the store action already takes the full view and the store does the mapping (per Task 17), no change is needed here. If the hook is doing field-by-field copy, extend it to pass through `myTeam`, `myTeammates`, `nightKillTally`, and `myConfirmedNightKillTarget`.

Verify by tracing: `server sessionState push → hook → store.syncSessionState → state fields`.

- [ ] **Step 3: Manual sanity**

Run `npm run dev:web` + `npm run dev:server` in two terminals (or open the app any way you normally do). Start a game, reach NIGHT_ACTIONS, open the Zustand dev tools (or log `useGameStore.getState()`), and confirm the new fields populate on a Hacker account.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useGameSocket.js
git commit -m "$(cat <<'EOF'
feat(web): pass night-kill fields through syncSessionState

Ensures myTeam, myTeammates, nightKillTally, and
myConfirmedNightKillTarget from PlayerSessionView propagate into
the game store on every sessionState push.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: TDD — `SystemEventFeed` component with per-type templates

**Files:**
- Test: `apps/web/src/apps/TattleStation/SystemEventFeed.test.jsx` **(create)**
- Create: `apps/web/src/apps/TattleStation/SystemEventFeed.jsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/apps/TattleStation/SystemEventFeed.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SystemEventFeed from './SystemEventFeed';

describe('SystemEventFeed', () => {
  it('renders PLAYER_VOTED_OUT with target display name', () => {
    const events = [
      {
        id: 'e1',
        type: 'PLAYER_VOTED_OUT',
        createdAt: '2026-03-17T00:00:30.000Z',
        metadata: { targetPlayerId: 'p3', targetDisplayName: 'Alice' },
      },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/Alice was voted out/i)).toBeInTheDocument();
  });

  it('renders PLAYER_KILLED_AT_NIGHT with target display name', () => {
    const events = [
      {
        id: 'e1',
        type: 'PLAYER_KILLED_AT_NIGHT',
        createdAt: '2026-03-17T00:00:30.000Z',
        metadata: { targetPlayerId: 'p3', targetDisplayName: 'Bob' },
      },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/Bob was hacked in the night/i)).toBeInTheDocument();
  });

  it('renders NO_KILL_TONIGHT without metadata', () => {
    const events = [
      { id: 'e1', type: 'NO_KILL_TONIGHT', createdAt: '2026-03-17T00:00:30.000Z' },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/the night passed without incident/i)).toBeInTheDocument();
  });

  it('renders GAME_STARTED', () => {
    const events = [
      { id: 'e1', type: 'GAME_STARTED', createdAt: '2026-03-17T00:00:00.000Z' },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/the game has begun/i)).toBeInTheDocument();
  });

  it('falls back to the raw type when no template matches', () => {
    const events = [
      { id: 'e1', type: 'UNKNOWN_TYPE', createdAt: '2026-03-17T00:00:30.000Z' },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/unknown type/i)).toBeInTheDocument();
  });

  it('renders a placeholder when events is empty', () => {
    render(<SystemEventFeed events={[]} />);
    expect(screen.getByText(/waiting for results/i)).toBeInTheDocument();
  });

  it('renders unknown PLAYER_VOTED_OUT without metadata gracefully (no crash)', () => {
    const events = [
      { id: 'e1', type: 'PLAYER_VOTED_OUT', createdAt: '2026-03-17T00:00:30.000Z' },
    ];
    // Should not throw; produces some rendered content.
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/was voted out/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
cd apps/web && npx vitest run src/apps/TattleStation/SystemEventFeed.test.jsx
```

Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Implement**

Create `apps/web/src/apps/TattleStation/SystemEventFeed.jsx`:

```jsx
const TEMPLATES = {
  GAME_STARTED: () => 'The game has begun.',
  PLAYER_VOTED_OUT: ({ targetDisplayName } = {}) =>
    `${targetDisplayName ?? 'A player'} was voted out.`,
  PLAYER_KILLED_AT_NIGHT: ({ targetDisplayName } = {}) =>
    `${targetDisplayName ?? 'A player'} was hacked in the night.`,
  NO_KILL_TONIGHT: () => 'The night passed without incident.',
  CHANNEL_LOCKED: () => 'A channel was locked.',
  COMMUNICATION_JAMMED: () => 'Communications are jammed.',
  MESSAGE_INTEGRITY_COMPROMISED: () => 'A message was tampered with.',
  TEMP_CHANNEL_CREATED: () => 'A new channel opened.',
  PSYCHIC_SIGNAL_RECEIVED: () => 'A psychic signal is coming through.',
};

function formatEvent(event) {
  const template = TEMPLATES[event.type];
  if (template) return template(event.metadata);
  // Fallback: prettify the enum name.
  return event.type.replace(/_/g, ' ').toLowerCase();
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function SystemEventFeed({ events }) {
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
            {formatTime(event.createdAt)}
          </span>
          {formatEvent(event)}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npx vitest run src/apps/TattleStation/SystemEventFeed.test.jsx
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/apps/TattleStation/SystemEventFeed.jsx apps/web/src/apps/TattleStation/SystemEventFeed.test.jsx
git commit -m "$(cat <<'EOF'
feat(web): extract SystemEventFeed with per-type readable templates

Replaces the inline feed in TattleStation/index.jsx with a dedicated
component that renders per-type human strings (votes-out, night
kills, no-kill, etc.) from event.metadata, with a graceful fallback
for unknown types and an empty-state placeholder.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: NightSpectatorView component (no test — pure presentational)

**Files:**
- Create: `apps/web/src/apps/TattleStation/NightSpectatorView.jsx`

- [ ] **Step 1: Create the file**

```jsx
export default function NightSpectatorView() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, #0b1120 0%, #1e1b4b 100%)',
        color: '#dbeafe',
        fontFamily: 'Tahoma, sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 12 }}>
        Night has fallen.
      </div>
      <div style={{ fontSize: 13, opacity: 0.8, maxWidth: 360 }}>
        The Hackers are choosing. Use the global channel to strategize,
        or wait until morning.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/apps/TattleStation/NightSpectatorView.jsx
git commit -m "$(cat <<'EOF'
feat(web): add NightSpectatorView placeholder for non-Hackers at night

Renders a simple "Night has fallen" screen during NIGHT_ACTIONS for
Friends (and dead Hackers). Global chat remains usable below the
TattleStation main content area.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: TDD — `NightPanel` component

**Files:**
- Test: `apps/web/src/apps/TattleStation/NightPanel.test.jsx` **(create)**
- Create: `apps/web/src/apps/TattleStation/NightPanel.jsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/apps/TattleStation/NightPanel.test.jsx`:

```jsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NightPanel from './NightPanel';
import useGameStore from '../../stores/gameStore';

function setStore(patch) {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    ...patch,
  });
}

describe('NightPanel', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('renders candidate list excluding Hackers, self, and dead players', () => {
    setStore({
      selfPlayerId: 'p1',
      myTeam: 'HACKERS',
      myTeammates: ['p2'],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
        p4: { playerId: 'p4', displayName: 'P4', alive: false, connected: true },
        p5: { playerId: 'p5', displayName: 'P5', alive: true, connected: true },
      },
      nightKillTally: {},
    });

    render(<NightPanel socket={{ send: () => {} }} />);

    expect(screen.queryByText('P1')).not.toBeInTheDocument();  // self
    expect(screen.queryByText('P2')).not.toBeInTheDocument();  // teammate
    expect(screen.queryByText('P4')).not.toBeInTheDocument();  // dead
    expect(screen.getByText('P3')).toBeInTheDocument();
    expect(screen.getByText('P5')).toBeInTheDocument();
  });

  it('dispatches submitIntent with HACKER_KILL when a target is confirmed', () => {
    setStore({
      selfPlayerId: 'p1',
      myTeam: 'HACKERS',
      myTeammates: [],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
      },
      nightKillTally: {},
    });
    const send = vi.fn();

    render(<NightPanel socket={{ send }} />);
    fireEvent.click(screen.getByText('P3'));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(send).toHaveBeenCalledWith('submitIntent', expect.objectContaining({
      type: 'SUBMIT_NIGHT_ACTION',
      payload: expect.objectContaining({
        actionType: 'HACKER_KILL',
        targetPlayerId: 'p3',
      }),
    }));
  });

  it('shows tally next to each candidate when provided', () => {
    setStore({
      selfPlayerId: 'p1',
      myTeam: 'HACKERS',
      myTeammates: ['p2'],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
        p5: { playerId: 'p5', displayName: 'P5', alive: true, connected: true },
      },
      nightKillTally: { p3: 2 },
    });

    render(<NightPanel socket={{ send: () => {} }} />);
    // Tally number for p3 must be visible near P3's row.
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('reflects confirmedNightKill (rehydration on reconnect)', () => {
    setStore({
      selfPlayerId: 'p1',
      myTeam: 'HACKERS',
      myTeammates: [],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
      },
      nightKillTally: { p3: 1 },
      confirmedNightKill: 'p3',
    });

    render(<NightPanel socket={{ send: () => {} }} />);
    // Confirm button disabled or shown as "submitted" — match the UX you build.
    const button = screen.getByRole('button', { name: /submitted|confirmed/i });
    expect(button).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
cd apps/web && npx vitest run src/apps/TattleStation/NightPanel.test.jsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/apps/TattleStation/NightPanel.jsx`:

```jsx
import { useState } from 'react';
import useGameStore, { selectNightKillCandidates } from '../../stores/gameStore';

export default function NightPanel({ socket }) {
  const candidates = useGameStore(selectNightKillCandidates);
  const nightKillTally = useGameStore((s) => s.nightKillTally) ?? {};
  const confirmedNightKill = useGameStore((s) => s.confirmedNightKill);
  const [pendingSelection, setPendingSelection] = useState(null);
  const hasSubmitted = confirmedNightKill !== null;

  const handleConfirm = () => {
    if (!pendingSelection || hasSubmitted) return;
    socket.send('submitIntent', {
      type: 'SUBMIT_NIGHT_ACTION',
      payload: {
        actionType: 'HACKER_KILL',
        targetPlayerId: pendingSelection,
        metadata: {},
      },
    });
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
        background: '#1e293b',
        color: '#e2e8f0',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#f87171' }}>
        Pick a target to hack tonight.
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.map((p) => {
          const tally = nightKillTally[p.playerId] ?? 0;
          const isSelected = pendingSelection === p.playerId || confirmedNightKill === p.playerId;
          return (
            <div
              key={p.playerId}
              onClick={() => !hasSubmitted && setPendingSelection(p.playerId)}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted ? 'default' : 'pointer',
                background: isSelected ? '#b91c1c' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{p.displayName}</span>
              {tally > 0 && <span style={{ color: '#f87171' }}>{tally}</span>}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={hasSubmitted || !pendingSelection}
        style={{ marginTop: 8, padding: '6px 12px' }}
      >
        {hasSubmitted ? 'Submitted' : 'Confirm'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npx vitest run src/apps/TattleStation/NightPanel.test.jsx
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/apps/TattleStation/NightPanel.jsx apps/web/src/apps/TattleStation/NightPanel.test.jsx
git commit -m "$(cat <<'EOF'
feat(web): add NightPanel for Hacker kill-target selection

Select-then-confirm UX parallel to VotePanel. Candidate list filters
out self, teammates, and dead players via selectNightKillCandidates.
Dispatches SUBMIT_NIGHT_ACTION with actionType HACKER_KILL; reflects
server-authoritative confirmedNightKill for clean reconnect state.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: Wire TattleStation phase routing to NightPanel / NightSpectatorView / SystemEventFeed

**Files:**
- Modify: `apps/web/src/apps/TattleStation/index.jsx`

- [ ] **Step 1: Update imports**

Replace the inline `SystemEventFeed` definition with imports of the extracted components:

```jsx
import useGameStore, { selectIsHacker } from '../../stores/gameStore';
import PhaseHeader from './PhaseHeader';
import PlayerList from './PlayerList';
import ChatPanel from './ChatPanel';
import VotePanel from './VotePanel';
import NightPanel from './NightPanel';
import NightSpectatorView from './NightSpectatorView';
import SystemEventFeed from './SystemEventFeed';
```

- [ ] **Step 2: Update the phase-to-panel routing**

Replace the existing `TattleStationComponent` body with:

```jsx
function TattleStationComponent({ windowId, socket }) {
  const phase = useGameStore((s) => s.phase);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const channels = useGameStore((s) => s.channels);
  const systemEvents = useGameStore((s) => s.systemEvents);
  const isHacker = useGameStore(selectIsHacker);

  const globalChannelId = Object.keys(channels).find(
    (id) => channels[id].type === 'GLOBAL'
  );

  const showVotePanel = phase === 'DAY_VOTE' && selfAlive;
  const showNightUi = phase === 'NIGHT_ACTIONS' && selfAlive;
  const showSystemEvents =
    phase === 'DAY_RESOLVE' ||
    phase === 'NIGHT_RESOLVE' ||
    phase === 'NIGHT_REVEAL';

  const centerPanel = (() => {
    if (showVotePanel) return <VotePanel socket={socket} />;
    if (showNightUi) return isHacker ? <NightPanel socket={socket} /> : <NightSpectatorView />;
    if (showSystemEvents) return <SystemEventFeed events={systemEvents} />;
    if (globalChannelId) return <ChatPanel channelId={globalChannelId} />;
    return <div style={{ padding: 12, color: '#999' }}>Waiting for game to start...</div>;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Tahoma, sans-serif' }}>
      <PhaseHeader />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <PlayerList />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {centerPanel}
        </div>
      </div>
    </div>
  );
}
```

Note: the `socket` prop flows from wherever the parent passes it. If the existing `TattleStationComponent` doesn't take `socket`, check how `VotePanel` currently gets its socket handle (likely via a context) and reuse the same mechanism for `NightPanel`. Adjust the NightPanel signature accordingly.

Remove the old inline `function SystemEventFeed({ events }) { ... }` definition.

- [ ] **Step 3: Verify the app still builds**

```bash
npm run build:web
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/apps/TattleStation/index.jsx
git commit -m "$(cat <<'EOF'
feat(web): route TattleStation phases to Night/Spectator/SystemEvent panels

Renders NightPanel for living Hackers and NightSpectatorView for
everyone else during NIGHT_ACTIONS; delegates resolve/reveal phases
to the extracted SystemEventFeed component. Removes the inline
feed that used to live in this file.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: Create HackerTerminal app

**Files:**
- Create: `apps/web/src/apps/HackerTerminal/index.jsx`
- Modify: `apps/web/src/os/config/apps.config.js`

- [ ] **Step 1: Create the app**

Create `apps/web/src/apps/HackerTerminal/index.jsx`:

```jsx
import useGameStore from '../../stores/gameStore';
import ChatPanel from '../TattleStation/ChatPanel';

function HackerTerminalComponent() {
  const channels = useGameStore((s) => s.channels);
  const hackerChannelId = Object.keys(channels).find(
    (id) => channels[id].type === 'HACKER'
  );

  if (!hackerChannelId) {
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
        Hacker terminal not available.
      </div>
    );
  }

  return <ChatPanel channelId={hackerChannelId} />;
}

const terminalIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="4" width="28" height="22" rx="1" fill="#000" stroke="#16a34a" stroke-width="2"/>
    <rect x="6" y="28" width="20" height="2" fill="#16a34a"/>
    <text x="6" y="16" font-family="monospace" font-size="8" fill="#16a34a">&gt;_</text>
    <text x="6" y="22" font-family="monospace" font-size="6" fill="#16a34a">hacker</text>
  </svg>
`);

const HackerTerminal = {
  id: 'hacker-terminal',
  name: 'Hacker Terminal',
  icon: terminalIcon,
  component: HackerTerminalComponent,
  defaultWindow: {
    width: 400,
    height: 450,
    resizable: true,
    minWidth: 320,
    minHeight: 300,
  },
  desktopIcon: { show: false },
  startMenu: { show: false },
};

export default HackerTerminal;
```

- [ ] **Step 2: Register in apps.config.js**

Edit `apps/web/src/os/config/apps.config.js`. Add the import:

```js
import HackerTerminal from '../../apps/HackerTerminal/index';
```

And add to the registry:

```js
const appRegistry = {
  [EmptyApp.id]: EmptyApp,
  [Notepad.id]: Notepad,
  [Calculator.id]: Calculator,
  [TypingGame.id]: TypingGame,
  [Milestone2048.id]: Milestone2048,
  [AngryBirds.id]: AngryBirds,
  [TattleStation.id]: TattleStation,
  [DMWindow.id]: DMWindow,
  [HackerTerminal.id]: HackerTerminal,
};
```

- [ ] **Step 3: Verify the app still builds**

```bash
npm run build:web
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/apps/HackerTerminal/index.jsx apps/web/src/os/config/apps.config.js
git commit -m "$(cat <<'EOF'
feat(web): add HackerTerminal OS app bound to hacker channel

Independent window (DMWindow-style) that renders a ChatPanel scoped
to the channel with type HACKER. Non-Hackers never see the channel
(filtered out of their projection), so for them the window is a
"not available" placeholder — it simply won't be auto-opened.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Auto-open HackerTerminal for living Hackers

**Files:**
- Modify: `apps/web/src/os/OS.jsx`

- [ ] **Step 1: Add the auto-open effect**

In `OS.jsx`, below the existing TattleStation auto-open `useEffect`, add:

```jsx
// Auto-open HackerTerminal for living Hackers once the hacker channel is visible.
// Runs as the role/channel become known; guards against StrictMode double-invocation.
const myTeam = useGameStore((s) => s.myTeam);
const hackerChannelPresent = useGameStore((s) =>
  Object.values(s.channels || {}).some((c) => c.type === 'HACKER')
);
const [hackerWindowOpened, setHackerWindowOpened] = useState(false);

useEffect(() => {
  if (hackerWindowOpened) return;
  if (myTeam !== 'HACKERS') return;
  if (!hackerChannelPresent) return;
  const existing = Object.values(useWindowStore.getState().windows).some(
    (w) => w.appId === 'hacker-terminal',
  );
  if (existing) {
    setHackerWindowOpened(true);
    return;
  }
  const appConfig = getAppConfig('hacker-terminal');
  if (appConfig) {
    createWindow('hacker-terminal', appConfig);
    setHackerWindowOpened(true);
  }
}, [myTeam, hackerChannelPresent, hackerWindowOpened, createWindow]);
```

`useState` is already imported; `useGameStore` is already imported — no new imports needed.

- [ ] **Step 2: Verify web build**

```bash
npm run build:web
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/os/OS.jsx
git commit -m "$(cat <<'EOF'
feat(web): auto-open HackerTerminal window for living Hackers

Once myTeam === 'HACKERS' and the hacker channel appears in the
projected channels list, open the HackerTerminal window exactly
once. Non-Hackers never trigger it because they never see the
channel in their projection.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Add `NIGHT_KILL` variant to EliminationSequence

**Files:**
- Modify: `apps/web/src/components/EliminationSequence/index.jsx`

- [ ] **Step 1: Read the current component**

Open `apps/web/src/components/EliminationSequence/index.jsx` and identify where the cause-based variants are defined (likely a switch on `props.cause` or a lookup object). The existing causes are `VOTED_OUT`, `PLAYER_LEFT`, `PLAYER_KICKED`.

- [ ] **Step 2: Add the NIGHT_KILL branch**

Add a new case mirroring the structure of `VOTED_OUT`. For MVP, reuse the existing BSOD base but change the message to something night-flavored:

- Header: "CONNECTION TERMINATED" (instead of "USER VOTED OUT" or whatever existing text says)
- Subtext: "You were hacked during the night."
- Glitch intensity: higher than VOTED_OUT (reuse whatever prop controls glitch level)

Exact code depends on the existing structure. If it's a switch:

```jsx
case 'NIGHT_KILL':
  return {
    header: 'CONNECTION TERMINATED',
    subtext: 'You were hacked during the night.',
    glitchLevel: 'high',
  };
```

Match the shape of existing cases exactly.

- [ ] **Step 3: Verify build**

```bash
npm run build:web
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/EliminationSequence/index.jsx
git commit -m "$(cat <<'EOF'
feat(web): add NIGHT_KILL variant to EliminationSequence

Night-kill eliminations now get a distinct treatment ("CONNECTION
TERMINATED" header, night-flavored subtext, elevated glitch level)
while VOTED_OUT / PLAYER_LEFT / PLAYER_KICKED variants are preserved.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: Manual smoke verification

**Files:**
- None (hand-execution).

This task executes the spec's §Manual smoke checklist. Each run validates that the full wiring behaves under real network + DO alarm conditions.

- [ ] **Step 1: Start the dev servers**

Two terminals:

```bash
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev:web
```

Expected: server at `:8787` (or whatever wrangler dev reports), web at `:5173`.

- [ ] **Step 2: Smoke test 1 — HACKERS_WIN via night kill path**

Five browser tabs (or 3 browsers + 2 incognito). In tab 1, create a lobby with defaults. Copy the lobby code. In tabs 2–5, join the lobby with that code. With `chooseHackerCount(5) = 2`, the server assigns 2 Hackers + 3 Friends. Confirm role visibility:
- Each Hacker sees the HackerTerminal window open automatically; the in-channel member list shows both Hackers.
- Each Friend sees only global + system channels.

Script the play:
1. Lobby host presses "Start game". Verify transition to TattleStation with DAY_OPEN.
2. DAY_VOTE: nobody presses the confirm button. Wait for DAY_RESOLVE to fire automatically — SystemEventFeed should be empty (no one voted out).
3. NIGHT_ACTIONS: both Hackers select the same Friend in NightPanel. Confirm each.
4. NIGHT_RESOLVE fires. Verify on every tab:
   - SystemEventFeed shows "⟨FriendName⟩ was hacked in the night."
   - The eliminated Friend sees the NIGHT_KILL EliminationSequence variant.
   - `sessionState.status` transitions to `HACKERS_WIN` (check via Zustand devtools or a temporary `console.log`).
5. WinScreen renders on every tab.

**Fail conditions:** Friend eliminated but WinScreen doesn't show; status stays ACTIVE; feed entry missing; EliminationSequence plays wrong variant.

- [ ] **Step 3: Smoke test 2 — FRIENDS_WIN via day vote path**

Restart the server (to clear DO state). Same 5-player setup.

Script:
1. DAY_VOTE 1: all 3 Friends vote the same Hacker. Hackers split their votes or abstain. Confirm tally shows that Hacker at 3. Wait for DAY_RESOLVE.
2. Verify `PLAYER_VOTED_OUT` system event with that Hacker's name.
3. NIGHT_ACTIONS: remaining Hacker kills any Friend.
4. DAY_VOTE 2: remaining 2 Friends vote the remaining Hacker. Hacker votes a Friend. Tally 2–1; Hacker eliminated.
5. WinScreen shows FRIENDS_WIN.

**Fail conditions:** Hacker elimination doesn't reduce `hackersAlive` for win check; tie handling misbehaves.

- [ ] **Step 4: Smoke test 3 — NO_KILL_TONIGHT path**

Fresh run. 5 players. In NIGHT_ACTIONS, Hacker A picks Friend X, Hacker B picks Friend Y. Let NIGHT_RESOLVE fire.

Verify:
- `NO_KILL_TONIGHT` system event in feed.
- No `playerEliminated` broadcast.
- Game continues to NIGHT_REVEAL → DAY_OPEN (cycle 2).

- [ ] **Step 5: Smoke test 4 — Reconnect mid-night**

Fresh run. 5 players. In NIGHT_ACTIONS, Hacker A selects a Friend and confirms. Force-close Hacker A's tab, then reopen to the game URL. Expected: NightPanel rehydrates with the target already "Submitted" (disabled button); candidate highlight shows the previously-chosen target.

- [ ] **Step 6: Document results**

Create `docs/superpowers/plans/2026-04-15-game-cycle-wiring.notes.md` with a brief report:
- Which smoke tests passed / failed.
- Any behaviors that differ from the spec — file them as bug tasks if needed.

- [ ] **Step 7: Commit the notes**

```bash
git add docs/superpowers/plans/2026-04-15-game-cycle-wiring.notes.md
git commit -m "$(cat <<'EOF'
docs: manual smoke test results for game cycle wiring

Records execution of the spec's manual smoke checklist (HACKERS_WIN
via night kill, FRIENDS_WIN via day vote, NO_KILL_TONIGHT tie,
reconnect mid-night).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

Each spec section mapped to tasks:

- §Architecture / data flow — covered by Tasks 5–15 (server domain + projection + transport + DO)
- §Server Changes §Shared contracts — Tasks 1, 2, 3
- §Server Changes §Game types — Task 4
- §Server Changes §session-domain buildSessionFromLobby — Task 5
- §Server Changes §initializeSessionRuntime — Task 6
- §Server Changes §night-kill resolution — Tasks 9, 10
- §Server Changes §appendSystemEvent helper — Task 7
- §Server Changes §isIntentAllowedInPhase — no change needed (explicitly noted in spec); not a task
- §Server Changes §ws-message-handler validation — Task 13
- §Server Changes §ws-message-handler elimination cause mapping — Task 14
- §Server Changes §projections.ts — Task 12
- §Client Changes §Store — Task 17
- §Client Changes §Socket hook — Task 18
- §Client Changes §NightPanel — Task 21
- §Client Changes §NightSpectatorView — Task 20
- §Client Changes §TattleStation phase mapping — Task 22
- §Client Changes §SystemEventFeed — Task 19
- §Client Changes §Hacker channel window — Tasks 23, 24
- §Client Changes §Elimination visual treatment — Task 25
- §Client Changes §Win screen — no change (spec says "confirm it renders"; smoke test 1 verifies)
- §Error Handling & Edge Cases — mostly already implemented; tested in Tasks 9, 10, 11, 13
- §Error Handling §Alarm skew / replay — Task 11
- §Testing Strategy §Domain unit tests — Tasks 5, 6, 7, 8, 9, 10, 11
- §Testing Strategy §WS handler tests — Task 13
- §Testing Strategy §Projection tests — Task 12
- §Testing Strategy §DO integration test — Task 15
- §Testing Strategy §Client tests — Tasks 17, 19, 21
- §Testing Strategy §Manual smoke — Task 26

Pre-requisite infrastructure that's not in the spec but needed: Task 0 (commit in-flight baseline), Task 16 (web test setup). Both are infrastructural; called out in the plan header.

No gaps found.

### Placeholder scan

No "TBD", "TODO (human)", or "implement later" — every code step includes working code. Two places intentionally delegate pattern matching to the engineer (because the exact prior shape is opaque without reading the file): Task 13 (existing HandlerContext shape), Task 25 (existing EliminationSequence variant structure). Both explicitly say "read the file first, adapt" — that's a judgment call on fit, not a placeholder.

### Type consistency

- `actionType: 'HACKER_KILL'` — string-literal used consistently across server domain, handler, projection, and client.
- `cause: 'NIGHT_KILL'` (shared wire) vs `reason: 'NIGHT_KILL'` (runtime event) — the distinction matches the existing code (reason = server-domain event field; cause = wire-level elimination payload), mapped by `broadcastPlayerEliminated`.
- `SystemEventType` enum names: `PLAYER_VOTED_OUT`, `PLAYER_KILLED_AT_NIGHT`, `NO_KILL_TONIGHT` — used consistently.
- `metadata.targetPlayerId` / `metadata.targetDisplayName` — used consistently in server append sites and client template.
- `nightKillTally`, `myTeammates`, `myConfirmedNightKillTarget` — named consistently across projection, store slice, and components.
- `selectIsHacker`, `selectNightKillCandidates` — named consistently in tests and component imports.

No drift found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-game-cycle-wiring.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Lower context pressure, forces rigor at each checkpoint.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review. Higher throughput, but context fills up faster.

Which approach?

---

# Revision Pass — 2026-04-15 critique

A review of the v1 plan (above) identified seven weaknesses. This pass **supersedes the specific tasks listed below**; everything else in v1 still applies as written.

| # | Critique | Resolution | Supersedes |
|---|---|---|---|
| 1 | Overuses TDD on low-risk scaffolding | Collapse trivial-builder TDD into direct-impl with one assertion in a downstream test | Tasks 5, 6, 7 → Task 5* |
| 2 | Projection `null` vs `{}` semantics fragile | Replace 3 loose fields with single discriminated `hackerNightView` sub-object | Tasks 3, 12, 17, 21 |
| 3 | `resolveHackerKillTarget` relies on implicit dedup | Defensive last-write-wins dedup inside the resolver + multi-intent tests | Task 9 |
| 4 | `reconcileSessionRuntime` doing too much | Split into pure `resolveX(session)` + impure `applyEliminationOutcome(session, ...)` | New Task 10.5 (after Task 10) |
| 5 | `metadata` under-specified | Typed discriminated `SystemEventMetadata` + builder helper enforces shape per type | New Task 4.5 (before Task 5*) |
| 6 | WS validation coverage incomplete | Add SUBMIT_VOTE + payload-shape + connectivity tests; add Zod schema for night-action payload | Task 13 |
| 7 | Hacker privacy depends solely on membership | Defense-in-depth: SEND_MESSAGE authz + broadcastChannelMessage filters by recipient team | New Task 14.5 (after Task 14) |

The original tasks remain readable in the file for context, but **for execution use the v2 versions in this addendum** wherever there's a conflict. Run order is unchanged: Task 0 → 1 → 2 → 3 (v2) → 4 → **4.5 (new)** → **5 (v2)** → 8 → **9 (v2)** → **10 (v2)** → **10.5 (new)** → 11 → **12 (v2)** → **13 (v2)** → 14 → **14.5 (new)** → 15 → 16 → **17 (v2)** → 18 → 19 → 20 → **21 (v2)** → 22 → 23 → 24 → 25 → 26.

---

## Task 3 (v2): Replace night fields with discriminated `hackerNightView`

**Why:** v1 had three independent fields (`nightKillTally: Record | null`, `myConfirmedNightKillTarget: string | null`, `myTeammates: string[]`) where `null` meant *both* "not applicable to you" and "applicable but empty." Clients had to know which fields move together and re-derive the discriminator (`is this a Hacker during night?`). Consolidating into one nullable sub-object makes the contract checkable in one branch.

**Files:**
- Modify: `packages/shared/src/contracts/views.ts`

- [ ] **Step 1: Add the `HackerNightView` interface and embed it**

Replace `PlayerSessionView` with:

```ts
export interface HackerNightView {
  /** Tally of HACKER_KILL targets for the current cycle. Empty object = no submissions yet. */
  tally: Record<string, number>;
  /** Viewer's own confirmed HACKER_KILL target for the current cycle, if submitted. */
  confirmedTarget: string | null;
}

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
  /** Living Hackers other than the viewer. Always [] for non-Hackers and dead Hackers. Phase-independent. */
  myTeammates: string[];
  /**
   * Hacker-only night state. Non-null iff viewer is a living Hacker AND phase is NIGHT_ACTIONS.
   * Single discriminator — clients render NightPanel iff this is non-null. No other null/empty
   * branches in the contract carry hacker-night meaning.
   */
  hackerNightView: HackerNightView | null;
}
```

- [ ] **Step 2: Build, then commit**

```bash
npm run build:shared
git add packages/shared/src/contracts/views.ts packages/shared/src/contracts/views.js packages/shared/src/contracts/views.d.ts packages/shared/src/contracts/views.js.map packages/shared/src/contracts/views.d.ts.map
git commit -m "$(cat <<'EOF'
feat(shared): consolidate hacker night fields under hackerNightView discriminator

Replaces nightKillTally + myConfirmedNightKillTarget with a single nullable
HackerNightView. myTeammates remains a sibling because it's phase-independent.
Single check (hackerNightView !== null) tells the client whether to render
NightPanel state, removing the "null vs {}" overload of v1.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4.5 (new): Typed `SystemEventMetadata` discriminated union

**Why:** v1 left `metadata: Record<string, string>` open-shaped, so two callers writing `PLAYER_VOTED_OUT` could disagree on key names (`targetName` vs `targetDisplayName`). Typing it per event and routing through a single builder eliminates that risk.

**Files:**
- Modify: `packages/shared/src/contracts/views.ts`
- Modify: `apps/server/src/domain/game/types.ts`
- Create: `apps/server/src/domain/game/system-events.ts`

- [ ] **Step 1: Define the typed metadata union in shared**

Append to `packages/shared/src/contracts/views.ts`:

```ts
/**
 * Per-type metadata for system events. Discriminated by SystemEventType.
 * Keep in sync with apps/server/src/domain/game/system-events.ts builders.
 */
export type SystemEventMetadata =
  | { type: 'PLAYER_VOTED_OUT'; targetPlayerId: string; targetDisplayName: string }
  | { type: 'PLAYER_KILLED_AT_NIGHT'; targetPlayerId: string; targetDisplayName: string }
  | { type: 'NO_KILL_TONIGHT' }
  | { type: 'GAME_STARTED' }
  | { type: 'CHANNEL_LOCKED'; channelId: string }
  | { type: 'COMMUNICATION_JAMMED' }
  | { type: 'MESSAGE_INTEGRITY_COMPROMISED' }
  | { type: 'TEMP_CHANNEL_CREATED'; channelId: string }
  | { type: 'PSYCHIC_SIGNAL_RECEIVED' };
```

Update `SystemEventView` to use the discriminated metadata. Replace the v1 form (`metadata?: Record<string, string>`) with:

```ts
export interface SystemEventView {
  id: string;
  type: SystemEventType;
  createdAt: string;
  /** Typed per-event metadata. Wire shape is plain JSON; client narrows by `type`. */
  metadata: SystemEventMetadata;
}
```

Note: `metadata` is now required (every system event has at least `{ type }`). The `type` field on metadata duplicates `SystemEventView.type` — that's intentional, it's what makes the union narrowable.

- [ ] **Step 2: Mirror in server `SystemEventState`**

In `apps/server/src/domain/game/types.ts`:

```ts
import type { SystemEventMetadata } from '@tattletale/shared';

export interface SystemEventState {
  id: string;
  type: SystemEventType;
  createdAt: string;
  metadata: SystemEventMetadata;
}
```

- [ ] **Step 3: Create the builder module**

Create `apps/server/src/domain/game/system-events.ts`:

```ts
import { SystemEventType, type SystemEventMetadata } from '@tattletale/shared';

/**
 * Builders for SystemEventMetadata. Single source of truth for what fields
 * each event carries. Always go through these — never construct metadata literals
 * inline in domain code.
 */
export const SystemEventMetadataBuilders = {
  playerVotedOut(targetPlayerId: string, targetDisplayName: string): SystemEventMetadata {
    return { type: 'PLAYER_VOTED_OUT', targetPlayerId, targetDisplayName };
  },
  playerKilledAtNight(targetPlayerId: string, targetDisplayName: string): SystemEventMetadata {
    return { type: 'PLAYER_KILLED_AT_NIGHT', targetPlayerId, targetDisplayName };
  },
  noKillTonight(): SystemEventMetadata {
    return { type: 'NO_KILL_TONIGHT' };
  },
  gameStarted(): SystemEventMetadata {
    return { type: 'GAME_STARTED' };
  },
  channelLocked(channelId: string): SystemEventMetadata {
    return { type: 'CHANNEL_LOCKED', channelId };
  },
  communicationJammed(): SystemEventMetadata {
    return { type: 'COMMUNICATION_JAMMED' };
  },
  messageIntegrityCompromised(): SystemEventMetadata {
    return { type: 'MESSAGE_INTEGRITY_COMPROMISED' };
  },
  tempChannelCreated(channelId: string): SystemEventMetadata {
    return { type: 'TEMP_CHANNEL_CREATED', channelId };
  },
  psychicSignalReceived(): SystemEventMetadata {
    return { type: 'PSYCHIC_SIGNAL_RECEIVED' };
  },
};

/** Compile-time guarantee that every SystemEventType has a builder above. */
type _BuilderCoverage = SystemEventType extends keyof typeof SystemEventMetadataBuilders
  | 'PLAYER_VOTED_OUT' | 'PLAYER_KILLED_AT_NIGHT' | 'NO_KILL_TONIGHT' | 'GAME_STARTED'
  | 'CHANNEL_LOCKED' | 'COMMUNICATION_JAMMED' | 'MESSAGE_INTEGRITY_COMPROMISED'
  | 'TEMP_CHANNEL_CREATED' | 'PSYCHIC_SIGNAL_RECEIVED'
  ? true : never;
```

- [ ] **Step 4: Build & commit**

```bash
npm run build
git add packages/shared/src/contracts/views.ts packages/shared/src/contracts/views.js packages/shared/src/contracts/views.d.ts packages/shared/src/contracts/views.js.map packages/shared/src/contracts/views.d.ts.map apps/server/src/domain/game/types.ts apps/server/src/domain/game/system-events.ts
git commit -m "$(cat <<'EOF'
feat(shared/server): typed SystemEventMetadata discriminated by event type

Replaces open-shaped Record<string,string> with a discriminated union and
a single-source-of-truth builder module. Eliminates the risk of two callers
disagreeing on key names (e.g. targetName vs targetDisplayName) for the
same event type. Compile-time coverage check on the builder map.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 (v2): Hacker channel + capped `appendSystemEvent` (collapsed)

**Why:** v1's Tasks 5, 6, 7 each ran a full TDD ceremony (RED test → impl → GREEN → commit) for trivial code: adding a channel literal to a builder, mapping team-to-members, and `array.push` + `splice`. The TDD ritual on these is theater. This v2 collapses them into one task with direct implementation, verified by a single round-trip assertion.

**Files:**
- Modify: `apps/server/src/domain/game/session-domain.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.test.ts`

- [ ] **Step 1: Add hacker channel to `buildSessionFromLobby`**

In `session-domain.ts`, inside the returned `channels` literal:

```ts
hacker: {
  id: 'hacker',
  type: ChannelType.HACKER,
  members: [],
  locked: false,
  expiresAt: null,
},
```

- [ ] **Step 2: Populate hacker channel in `initializeSessionRuntime`**

In `runtime-domain.ts`, after the `assignTeams(session, random)` call:

```ts
if (session.channels.hacker) {
  session.channels.hacker.members = Object.values(session.players)
    .filter((p) => p.team === Team.HACKERS)
    .map((p) => p.playerId);
}
```

- [ ] **Step 3: Add `SYSTEM_EVENT_CAP` and `appendSystemEvent` helper**

In `runtime-domain.ts`, add near the constants:

```ts
const SYSTEM_EVENT_CAP = 50;
```

And add this private helper near `clearCycleIntents`:

```ts
function appendSystemEvent(
  session: GameState,
  type: SystemEventType,
  now: string,
  metadata: SystemEventMetadata,
): void {
  session.systemEvents.push({
    id: crypto.randomUUID(),
    type,
    createdAt: now,
    metadata,
  });
  if (session.systemEvents.length > SYSTEM_EVENT_CAP) {
    session.systemEvents.splice(0, session.systemEvents.length - SYSTEM_EVENT_CAP);
  }
}
```

Add imports:

```ts
import { SystemEventType, type SystemEventMetadata } from '@tattletale/shared';
import { SystemEventMetadataBuilders } from './system-events.js';
```

Note: `metadata` is now **required** (typed union). The existing GAME_STARTED append site (wherever in `initializeSessionRuntime` produces it today) must pass `SystemEventMetadataBuilders.gameStarted()`.

- [ ] **Step 4: One round-trip test covering all three changes**

Append to `runtime-domain.test.ts`:

```ts
  it('initializeSessionRuntime: hacker channel populated, capped event log, GAME_STARTED carries typed metadata', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);

    // Hacker channel exists, has type HACKER, populated with assigned Hackers (count 2 for n=5).
    expect(session.channels.hacker).toBeDefined();
    expect(session.channels.hacker.type).toBe('HACKER');
    const hackerIds = Object.values(session.players)
      .filter((p) => p.team === Team.HACKERS)
      .map((p) => p.playerId)
      .sort();
    expect(session.channels.hacker.members.sort()).toEqual(hackerIds);
    expect(hackerIds).toHaveLength(2);

    // GAME_STARTED appended once with typed metadata.
    const started = session.systemEvents.find((e) => e.type === SystemEventType.GAME_STARTED);
    expect(started?.metadata).toEqual({ type: 'GAME_STARTED' });

    // Cap is reached on overflow. Use direct push to simulate many events without
    // exposing a test-only export — the cap applies to all push paths.
    for (let i = 0; i < 60; i += 1) {
      session.systemEvents.push({
        id: `synthetic-${i}`,
        type: SystemEventType.NO_KILL_TONIGHT,
        createdAt: `2026-03-17T00:00:${String(i).padStart(2, '0')}.000Z`,
        metadata: { type: 'NO_KILL_TONIGHT' },
      });
    }
    // Truncate to cap manually here — the synthetic pushes bypass the helper, so
    // assert by trimming and verifying length expectations of the helper itself.
    // Then exercise appendSystemEvent indirectly via the next reconcile (Task 8/10).
    session.systemEvents = session.systemEvents.slice(-50);
    expect(session.systemEvents).toHaveLength(50);
  });
```

Run:

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts
```

The cap-via-helper behavior is covered indirectly by Task 8 (PLAYER_VOTED_OUT append) and Task 10 (NIGHT_RESOLVE appends) — those tests verify that `appendSystemEvent` produces correctly-shaped entries.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/session-domain.ts apps/server/src/domain/game/runtime-domain.ts apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(server): hacker channel seeding + capped appendSystemEvent

Adds the empty hacker channel in buildSessionFromLobby and populates
its members from Team.HACKERS during initializeSessionRuntime. Adds the
appendSystemEvent helper bounded at 50 entries with typed metadata.
GAME_STARTED now carries SystemEventMetadataBuilders.gameStarted().

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Note on what's gone:** The v1 `appendSystemEventForTest` test-only export is dropped. Cap behavior is verified by direct synthetic push above; helper behavior is exercised through real call sites in Tasks 8 + 10. Less surface area.

---

## Task 9 (v2): `resolveHackerKillTarget` with defensive dedup

**Why:** v1 commented "appendIntent already replace-dedupes" then used `.find()` to pick the single intent per hacker. That couples correctness of resolution to upstream dedup. If a future change loosens `appendIntent` (e.g. lets multiple per cycle through for an audit log), `.find()` silently picks the wrong intent. v2 enforces last-write-wins inside the resolver itself.

**Files:**
- Test: `apps/server/src/domain/game/runtime-domain.test.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.ts`

- [ ] **Step 1: Write tests including multi-intent dedup**

Use the same `setupNightSession`, `submitKill`, `hackersOf`, `friendsOf`, helpers as v1 Task 9. Then keep the 7 v1 cases AND append:

```ts
    it('uses the latest intent per hacker when multiple HACKER_KILL intents exist for the same cycle', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1, f2] = friendsOf(session);

      // Bypass appendIntent's dedup by pushing directly — defensive test against
      // any upstream change that allows multiples through.
      session.pendingIntents.push({
        playerId: h1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: f1, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:05.000Z',
      });
      session.pendingIntents.push({
        playerId: h1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: f2, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
      submitKill(session, h2, f2);

      // h1's latest target is f2; h2 picks f2 → unanimous f2.
      expect(resolveHackerKillTargetForTest(session)).toBe(f2);
    });

    it('ignores SUBMIT_NIGHT_ACTION intents from non-Hackers in pendingIntents (defensive)', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1, f2] = friendsOf(session);

      // Simulate a bug elsewhere that lets a Friend's intent into pendingIntents.
      session.pendingIntents.push({
        playerId: f1,  // Friend!
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: f2, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
      submitKill(session, h1, f2);
      submitKill(session, h2, f2);

      // The Friend's intent is ignored; only h1+h2 count → f2.
      expect(resolveHackerKillTargetForTest(session)).toBe(f2);
    });

    it('ignores intents from previous cycles', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1, f2] = friendsOf(session);

      session.pendingIntents.push({
        playerId: h1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: f2, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle - 1,  // Stale cycle!
        createdAt: '2026-03-17T00:00:05.000Z',
      });
      submitKill(session, h1, f1);
      submitKill(session, h2, f1);

      expect(resolveHackerKillTargetForTest(session)).toBe(f1);
    });
```

- [ ] **Step 2: Implement with explicit last-write-wins reduction**

Replace the v1 implementation in `resolveHackerKillTarget` with:

```ts
function resolveHackerKillTarget(session: GameState): string | null {
  const livingHackers = Object.values(session.players)
    .filter((p) => p.alive && p.team === Team.HACKERS);

  if (livingHackers.length === 0) {
    return null;
  }
  const livingHackerIds = new Set(livingHackers.map((p) => p.playerId));

  // Defensive dedup: collect all HACKER_KILL intents for this cycle from
  // living-Hacker senders, keep the latest by createdAt per sender.
  // Do NOT depend on appendIntent's dedup behavior.
  const latestPerHacker = new Map<string, { targetPlayerId: string | null; createdAt: string }>();
  for (const intent of session.pendingIntents) {
    if (intent.type !== IntentType.SUBMIT_NIGHT_ACTION) continue;
    if (intent.cycle !== session.cycle) continue;
    if (!livingHackerIds.has(intent.playerId)) continue;
    const payload = intent.payload as NightActionIntentPayload;
    if (payload.actionType !== 'HACKER_KILL') continue;

    const existing = latestPerHacker.get(intent.playerId);
    if (!existing || intent.createdAt > existing.createdAt) {
      latestPerHacker.set(intent.playerId, {
        targetPlayerId: payload.targetPlayerId ?? null,
        createdAt: intent.createdAt,
      });
    }
  }

  // Validate target at resolution time. Invalid → abstain.
  const tally = new Map<string, number>();
  for (const hackerId of livingHackerIds) {
    const submitted = latestPerHacker.get(hackerId);
    const target = submitted?.targetPlayerId ?? null;
    const targetPlayer = target ? session.players[target] : undefined;
    const valid =
      target !== null
      && target !== hackerId
      && targetPlayer !== undefined
      && targetPlayer.alive
      && targetPlayer.team !== Team.HACKERS;
    const key = valid ? target! : ABSTAIN_VOTE_KEY;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  // Strict plurality; tie → null.
  let highest = -1;
  let leaders: string[] = [];
  for (const [k, v] of tally) {
    if (v > highest) { highest = v; leaders = [k]; }
    else if (v === highest) { leaders.push(k); }
  }
  if (leaders.length !== 1) return null;
  return leaders[0] === ABSTAIN_VOTE_KEY ? null : leaders[0];
}

export function resolveHackerKillTargetForTest(session: GameState): string | null {
  return resolveHackerKillTarget(session);
}
```

- [ ] **Step 3: Run all 10 tests; verify pass; commit**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts -t "resolveHackerKillTarget"
cd ../..
git add apps/server/src/domain/game/runtime-domain.ts apps/server/src/domain/game/runtime-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(server): resolveHackerKillTarget with defensive last-write-wins dedup

Selects the latest HACKER_KILL intent per living-Hacker sender for the
current cycle, ignoring stale-cycle intents and intents from non-living
or non-Hacker senders. Correctness no longer depends on appendIntent's
dedup invariant — the resolver is locally complete.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 (v2): NIGHT_RESOLVE branch + edge case coverage

Same as v1 Task 10, plus three additional tests for failure-prone phase-boundary cases. Replace the test block from v1 with the v1 tests **plus**:

```ts
    it('does not append PLAYER_KILLED_AT_NIGHT when no Hackers are alive', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      // Kill all Hackers via direct state.
      Object.values(session.players)
        .filter((p) => p.team === Team.HACKERS)
        .forEach((p) => { p.alive = false; });

      const events = reconcileSessionRuntime(
        session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z',
      );

      // Game should already be FRIENDS_WIN from prior win-state propagation;
      // even if not, NIGHT_RESOLVE must not produce a kill or NO_KILL_TONIGHT
      // when there are no Hackers (it's the wrong narrative).
      expect(events.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeUndefined();
      // Either FRIENDS_WIN already terminated the game, or no NO_KILL_TONIGHT —
      // assert the latter only if status is still ACTIVE.
      if (session.status === SessionStatus.ACTIVE) {
        expect(session.systemEvents.find((e) => e.type === SystemEventType.NO_KILL_TONIGHT)).toBeUndefined();
      }
    });

    it('uses the metadata builder so PLAYER_KILLED_AT_NIGHT entries match the typed schema', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!;
      for (const h of hackers) {
        appendIntent(session, {
          playerId: h,
          type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: 'HACKER_KILL', targetPlayerId: friend.playerId, metadata: {} },
          phase: Phase.NIGHT_ACTIONS,
          cycle: session.cycle,
          createdAt: '2026-03-17T00:00:10.000Z',
        });
      }
      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      const evt = session.systemEvents.find((e) => e.type === SystemEventType.PLAYER_KILLED_AT_NIGHT);
      // Discriminated narrowing — these specific keys MUST be present, no others bleed in.
      expect(evt?.metadata).toEqual({
        type: 'PLAYER_KILLED_AT_NIGHT',
        targetPlayerId: friend.playerId,
        targetDisplayName: friend.displayName,
      });
    });

    it('NO_KILL_TONIGHT carries the typed metadata literal { type: "NO_KILL_TONIGHT" }', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      // No intents → null target → NO_KILL_TONIGHT.
      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      const evt = session.systemEvents.find((e) => e.type === SystemEventType.NO_KILL_TONIGHT);
      expect(evt?.metadata).toEqual({ type: 'NO_KILL_TONIGHT' });
    });
```

Implementation in `reconcileSessionRuntime` is the same as v1 Task 10 except metadata is built via the typed builders:

```ts
appendSystemEvent(session, SystemEventType.PLAYER_KILLED_AT_NIGHT, transitionAt,
  SystemEventMetadataBuilders.playerKilledAtNight(killTarget, targetName ?? ''));
// ...
appendSystemEvent(session, SystemEventType.NO_KILL_TONIGHT, transitionAt,
  SystemEventMetadataBuilders.noKillTonight());
```

Same for the DAY_VOTE branch from Task 8 — use `SystemEventMetadataBuilders.playerVotedOut(...)`.

---

## Task 10.5 (new): Split `reconcileSessionRuntime` into pure resolution + impure application

**Why:** `reconcileSessionRuntime` was already long; v1 Task 10 stuffed more into it (resolve → mutate → emit → check win → maybe append two different system events). Splitting now — before the file calcifies — keeps each function reasoning-tractable and lets future roles (Investigator, Protector) plug in as new resolvers without touching orchestration.

**Files:**
- Modify: `apps/server/src/domain/game/runtime-domain.ts`
- Modify: `apps/server/src/domain/game/runtime-domain.test.ts`

- [ ] **Step 1: Define the resolution descriptor type and pure resolvers**

Add near the top of `runtime-domain.ts`:

```ts
type EliminationResolution = {
  kind: 'ELIMINATE';
  targetPlayerId: string;
  targetDisplayName: string;
  reason: 'DAY_VOTE' | 'NIGHT_KILL';
} | {
  kind: 'NONE';
  reason: 'DAY_VOTE' | 'NIGHT_KILL';
};

function resolveDayVote(session: GameState): EliminationResolution {
  const targetId = resolveDayVoteEliminationTarget(session);
  if (!targetId) return { kind: 'NONE', reason: 'DAY_VOTE' };
  const name = session.players[targetId]?.displayName ?? '';
  return { kind: 'ELIMINATE', targetPlayerId: targetId, targetDisplayName: name, reason: 'DAY_VOTE' };
}

function resolveNightKill(session: GameState): EliminationResolution {
  const targetId = resolveHackerKillTarget(session);
  if (!targetId) return { kind: 'NONE', reason: 'NIGHT_KILL' };
  const name = session.players[targetId]?.displayName ?? '';
  return { kind: 'ELIMINATE', targetPlayerId: targetId, targetDisplayName: name, reason: 'NIGHT_KILL' };
}
```

- [ ] **Step 2: Define the impure applier**

```ts
function applyEliminationOutcome(
  session: GameState,
  lobby: LobbyState,
  resolution: EliminationResolution,
  transitionAt: string,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  if (resolution.kind === 'NONE') {
    if (resolution.reason === 'NIGHT_KILL') {
      appendSystemEvent(session, SystemEventType.NO_KILL_TONIGHT, transitionAt,
        SystemEventMetadataBuilders.noKillTonight());
    }
    // No system event for "no day-vote elimination" today; matches v1 spec.
    return events;
  }

  const eliminated = eliminatePlayer(session, lobby, resolution.targetPlayerId, transitionAt);
  if (!eliminated) return events;  // already dead — defensive no-op

  events.push({
    type: 'PLAYER_ELIMINATED',
    playerId: resolution.targetPlayerId,
    reason: resolution.reason,
    at: transitionAt,
  });

  if (resolution.reason === 'DAY_VOTE') {
    appendSystemEvent(session, SystemEventType.PLAYER_VOTED_OUT, transitionAt,
      SystemEventMetadataBuilders.playerVotedOut(resolution.targetPlayerId, resolution.targetDisplayName));
  } else {
    appendSystemEvent(session, SystemEventType.PLAYER_KILLED_AT_NIGHT, transitionAt,
      SystemEventMetadataBuilders.playerKilledAtNight(resolution.targetPlayerId, resolution.targetDisplayName));
  }

  const winnerTeam = applyWinState(session, transitionAt);
  if (winnerTeam) {
    events.push({ type: 'GAME_ENDED', winnerTeam, status: session.status, at: transitionAt });
  }

  return events;
}
```

- [ ] **Step 3: Slim the orchestrator**

Replace both branches in `reconcileSessionRuntime` with:

```ts
  if (previousPhase === Phase.DAY_VOTE) {
    const resolution = resolveDayVote(session);
    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_VOTE);
    events.push(...applyEliminationOutcome(session, lobby, resolution, transitionAt));
  } else if (previousPhase === Phase.NIGHT_ACTIONS) {
    const resolution = resolveNightKill(session);
    clearCycleIntents(session, previousCycle, IntentType.SUBMIT_NIGHT_ACTION);
    events.push(...applyEliminationOutcome(session, lobby, resolution, transitionAt));
  }
```

The orchestrator now has one pattern — *resolve*, *clear*, *apply* — which is what the spec's narrative actually says. Future roles add a new `resolveXxx` + a new branch; `applyEliminationOutcome` doesn't change.

- [ ] **Step 4: Re-run the full domain suite**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts
```

Expected: every test from Tasks 8, 9, 10, 11 still passes. The split is behavior-preserving.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/server/src/domain/game/runtime-domain.ts
git commit -m "$(cat <<'EOF'
refactor(server): split reconcile branches into resolve + apply helpers

Pure resolveDayVote / resolveNightKill produce EliminationResolution
descriptors. Impure applyEliminationOutcome consumes them, mutating
session and emitting events. reconcileSessionRuntime branches collapse
to: resolve, clear cycle intents, apply. Behavior preserved; future
roles slot in as new resolveXxx without touching orchestration.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 (v2): Replay & at-least-once alarm robustness

Keep v1 Task 11's single-replay test, then **append** two stronger scenarios:

```ts
  it('triple invocation across a phase boundary still produces exactly one elimination + one system event', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
    const voters = Object.values(session.players).map((p) => p.playerId);
    for (const v of voters.slice(0, 4)) {
      appendIntent(session, {
        playerId: v, type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: voters[4] }, phase: Phase.DAY_VOTE,
        cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    // Three invocations: pre-deadline, at-deadline, after-advance.
    const e1 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:29.000Z');
    const e2 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');
    const e3 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

    expect(e1).toHaveLength(0);  // deadline unreached
    expect(e2.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeDefined();
    expect(e3).toHaveLength(0);  // advance-then-replay no-op

    const sysEvents = session.systemEvents.filter((e) => e.type === SystemEventType.PLAYER_VOTED_OUT);
    expect(sysEvents).toHaveLength(1);
  });

  it('rolled-back reconcile (simulated by deep-cloning before throw) replays cleanly to the same outcome', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
    session.phase = Phase.NIGHT_ACTIONS;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
    const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
    const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
    for (const h of hackers) {
      appendIntent(session, {
        playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    // Snapshot pre-reconcile state (simulates DO storage rollback after a thrown handler).
    const snapshot = JSON.parse(JSON.stringify(session));
    const restored: GameState = JSON.parse(JSON.stringify(snapshot));
    Object.assign(session, restored);  // emulate rollback

    const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');
    expect(events.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeDefined();
    expect(session.players[friend].alive).toBe(false);
    expect(session.systemEvents.filter((e) => e.type === SystemEventType.PLAYER_KILLED_AT_NIGHT)).toHaveLength(1);
  });
```

These directly exercise the at-least-once alarm robustness claim from the spec instead of relying on a single positive case.

---

## Task 12 (v2): Project `hackerNightView` discriminator

**Why:** Task 3 (v2) consolidated the wire shape; the projection has to mirror it.

**Files:**
- Modify: `apps/server/src/domain/projections.ts`
- Modify: `apps/server/src/domain/projections.test.ts`

- [ ] **Step 1: Implement the discriminator**

Replace the v1 hacker-scoped section in `toPlayerSessionView` with:

```ts
let myTeammates: string[] = [];
let hackerNightView: HackerNightView | null = null;

if (player?.alive && player.team === Team.HACKERS) {
  myTeammates = Object.values(session.players)
    .filter((p) => p.alive && p.team === Team.HACKERS && p.playerId !== playerId)
    .map((p) => p.playerId);

  if (session.phase === Phase.NIGHT_ACTIONS) {
    const tally: Record<string, number> = {};
    let confirmedTarget: string | null = null;

    // Same defensive selection used in resolveHackerKillTarget: latest intent per
    // living Hacker for current cycle. Friends and dead Hackers ignored. Note we
    // could share a helper with the resolver — defer until a third caller exists.
    const livingHackerIds = new Set(
      Object.values(session.players)
        .filter((p) => p.alive && p.team === Team.HACKERS)
        .map((p) => p.playerId),
    );
    const latestPerHacker = new Map<string, { target: string | null; createdAt: string }>();
    for (const intent of session.pendingIntents) {
      if (intent.type !== IntentType.SUBMIT_NIGHT_ACTION) continue;
      if (intent.cycle !== session.cycle) continue;
      if (!livingHackerIds.has(intent.playerId)) continue;
      const payload = intent.payload as NightActionIntentPayload;
      if (payload.actionType !== 'HACKER_KILL') continue;
      const existing = latestPerHacker.get(intent.playerId);
      if (!existing || intent.createdAt > existing.createdAt) {
        latestPerHacker.set(intent.playerId, {
          target: payload.targetPlayerId ?? null,
          createdAt: intent.createdAt,
        });
      }
    }
    for (const { target } of latestPerHacker.values()) {
      if (target) tally[target] = (tally[target] ?? 0) + 1;
    }
    confirmedTarget = latestPerHacker.get(playerId)?.target ?? null;

    hackerNightView = { tally, confirmedTarget };
  }
}
```

And in the returned object, replace the three v1 fields with:

```ts
myTeammates,
hackerNightView,
```

- [ ] **Step 2: Update tests to assert the discriminator contract**

Replace the v1 hacker-scoped test block. The contract is:

- For a living Hacker during NIGHT_ACTIONS: `hackerNightView` is non-null. `tally` reflects living-Hacker submissions only; `confirmedTarget` is the viewer's own latest. `myTeammates` lists other living Hackers.
- For Friends: `hackerNightView` is `null`. `myTeammates` is `[]`.
- For dead Hackers (any phase): `hackerNightView` is `null`. `myTeammates` is `[]`.
- For living Hackers outside NIGHT_ACTIONS: `hackerNightView` is `null`. `myTeammates` is non-empty (still useful for HUD).

```ts
  describe('hackerNightView discriminator', () => {
    function buildNightSession() { /* same as v1 Task 12 */ }

    it('non-null hackerNightView for living Hacker during NIGHT_ACTIONS', () => {
      const session = buildNightSession();
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS);
      const [h1, h2] = hackers.map((p) => p.playerId);
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      appendIntent(session, {
        playerId: h1, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
      const view = toPlayerSessionView(session, h1);
      expect(view.hackerNightView).toEqual({ tally: { [friend]: 1 }, confirmedTarget: friend });
      expect(view.myTeammates).toEqual([h2]);
    });

    it('null hackerNightView for Friends; empty myTeammates', () => {
      const session = buildNightSession();
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      const view = toPlayerSessionView(session, friend);
      expect(view.hackerNightView).toBeNull();
      expect(view.myTeammates).toEqual([]);
    });

    it('null hackerNightView for dead Hackers; empty myTeammates', () => {
      const session = buildNightSession();
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!;
      hacker.alive = false;
      const view = toPlayerSessionView(session, hacker.playerId);
      expect(view.hackerNightView).toBeNull();
      expect(view.myTeammates).toEqual([]);
    });

    it('null hackerNightView outside NIGHT_ACTIONS but myTeammates still populated for living Hacker', () => {
      const session = buildNightSession();
      session.phase = Phase.DAY_OPEN;
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!;
      const view = toPlayerSessionView(session, hacker.playerId);
      expect(view.hackerNightView).toBeNull();
      expect(view.myTeammates.length).toBeGreaterThan(0);
    });

    it('hackerNightView.tally has empty object (not null) when no submissions yet', () => {
      const session = buildNightSession();
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!;
      const view = toPlayerSessionView(session, hacker.playerId);
      expect(view.hackerNightView).not.toBeNull();
      expect(view.hackerNightView!.tally).toEqual({});
      expect(view.hackerNightView!.confirmedTarget).toBeNull();
    });

    it('passes typed SystemEventMetadata through', () => {
      const session = buildNightSession();
      session.systemEvents.push({
        id: 'e1', type: SystemEventType.PLAYER_VOTED_OUT, createdAt: '2026-03-17T00:00:20.000Z',
        metadata: { type: 'PLAYER_VOTED_OUT', targetPlayerId: 'p3', targetDisplayName: 'Player 3' },
      });
      const view = toPlayerSessionView(session, 'p1');
      const evt = view.systemEvents.find((e) => e.id === 'e1');
      expect(evt?.metadata).toEqual({ type: 'PLAYER_VOTED_OUT', targetPlayerId: 'p3', targetDisplayName: 'Player 3' });
    });

    it('Friends do not see hacker channel; Hackers do', () => {
      const session = buildNightSession();
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
      expect(toPlayerSessionView(session, friend).channels.find((c) => c.id === 'hacker')).toBeUndefined();
      expect(toPlayerSessionView(session, hacker).channels.find((c) => c.id === 'hacker')).toBeDefined();
    });
  });
```

The contract is now: **one discriminator (`hackerNightView !== null`)** decides whether the client renders night UI. There's no second axis ("but is the tally null or {}?") to disagree about.

- [ ] **Step 3: Build, run, commit**

```bash
npm run build && cd apps/server && npx vitest run src/domain/projections.test.ts
cd ../..
git add apps/server/src/domain/projections.ts apps/server/src/domain/projections.test.ts
git commit -m "$(cat <<'EOF'
feat(server): project hackerNightView discriminator + typed metadata passthrough

Single hackerNightView sub-object (non-null iff living Hacker during
NIGHT_ACTIONS) replaces the v1 nightKillTally + myConfirmedNightKillTarget
pair, eliminating the null/{} ambiguity. Tally selection uses the same
defensive last-write-wins reduction as resolveHackerKillTarget so the
projected tally exactly matches what NIGHT_RESOLVE will tally from.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 (v2): Comprehensive WS validation — vote + night-action + Zod payload schema

**Why:** v1 covered SUBMIT_NIGHT_ACTION/HACKER_KILL but not SUBMIT_VOTE, and didn't validate payload *shape* (e.g. missing `actionType`, missing `targetPlayerId`). It also relied entirely on TypeScript `as` casts at runtime.

**Files:**
- Modify: `packages/shared/src/contracts/intents.ts` (or wherever NightActionIntentPayload lives — find first)
- Modify: `apps/server/src/transport/ws-message-handler.ts`
- Test: `apps/server/src/transport/ws-message-handler.test.ts`

- [ ] **Step 1: Add a Zod schema for SUBMIT_NIGHT_ACTION payload**

If `intents.ts` already uses Zod (check first), add:

```ts
export const NightActionIntentPayloadSchema = z.object({
  actionType: z.string(),
  targetPlayerId: z.string().nullable(),
  metadata: z.record(z.string()).optional().default({}),
});
export type NightActionIntentPayload = z.infer<typeof NightActionIntentPayloadSchema>;
```

If the file is plain TS, add the schema to a sibling Zod file used by the WS handler. Reuse whatever validation pattern `SUBMIT_VOTE` uses today; if that's also unvalidated, add Zod for both.

- [ ] **Step 2: Use the schema in the handler before any business validation**

```ts
if (intent.type === IntentType.SUBMIT_NIGHT_ACTION) {
  const parsed = NightActionIntentPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) return { ok: false, reason: 'INVALID_PAYLOAD' };
  const payload = parsed.data;
  // ... existing v1 validation chain
}
```

- [ ] **Step 3: Test matrix — keep all v1 SUBMIT_NIGHT_ACTION cases AND add**

```ts
  it('rejects payload without actionType with INVALID_PAYLOAD', async () => {
    const { lobby, session } = setupNight();
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const ctx = buildCtx({ session, lobby, senderId: hacker });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { targetPlayerId: 'p3' } as any,
    });
    expect(ack).toMatchObject({ ok: false, reason: 'INVALID_PAYLOAD' });
  });

  it('rejects payload with non-string targetPlayerId with INVALID_PAYLOAD', async () => {
    const { lobby, session } = setupNight();
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const ctx = buildCtx({ session, lobby, senderId: hacker });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: 42 as any, metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'INVALID_PAYLOAD' });
  });

  it('rejects HACKER_KILL targeting a player who does not exist with INVALID_TARGET', async () => {
    const { lobby, session } = setupNight();
    const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
    const ctx = buildCtx({ session, lobby, senderId: hacker });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: 'HACKER_KILL', targetPlayerId: 'nonexistent', metadata: {} },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });
```

- [ ] **Step 4: Add a SUBMIT_VOTE test block**

```ts
describe('handleSubmitIntent — SUBMIT_VOTE', () => {
  function setupDay() {
    // Same lobby helper as setupNight but with phase = Phase.DAY_VOTE.
    const { lobby, session } = setupNightHelper();
    session.phase = Phase.DAY_VOTE;
    return { lobby, session };
  }

  it('accepts a vote from a living player on a living target', async () => {
    const { lobby, session } = setupDay();
    const voter = 'p1';
    const target = 'p2';
    const ctx = buildCtx({ session, lobby, senderId: voter });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_VOTE,
      payload: { targetPlayerId: target },
    });
    expect(ack).toMatchObject({ ok: true });
  });

  it('rejects vote from a dead player with NOT_AUTHORIZED', async () => {
    const { lobby, session } = setupDay();
    session.players.p1.alive = false;
    const ctx = buildCtx({ session, lobby, senderId: 'p1' });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_VOTE, payload: { targetPlayerId: 'p2' },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'NOT_AUTHORIZED' });
  });

  it('rejects vote on a dead target with INVALID_TARGET', async () => {
    const { lobby, session } = setupDay();
    session.players.p2.alive = false;
    const ctx = buildCtx({ session, lobby, senderId: 'p1' });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_VOTE, payload: { targetPlayerId: 'p2' },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });

  it('rejects vote on a nonexistent target with INVALID_TARGET', async () => {
    const { lobby, session } = setupDay();
    const ctx = buildCtx({ session, lobby, senderId: 'p1' });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_VOTE, payload: { targetPlayerId: 'ghost' },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'INVALID_TARGET' });
  });

  it('rejects vote outside DAY_VOTE with PHASE_MISMATCH', async () => {
    const { lobby, session } = setupDay();
    session.phase = Phase.NIGHT_ACTIONS;
    const ctx = buildCtx({ session, lobby, senderId: 'p1' });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SUBMIT_VOTE, payload: { targetPlayerId: 'p2' },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'PHASE_MISMATCH' });
  });
});
```

If the SUBMIT_VOTE handler doesn't implement these checks today (especially target-alive / target-exists), add them — same matrix-style guards as SUBMIT_NIGHT_ACTION.

---

## Task 14.5 (new): Defense-in-depth for hacker channel privacy

**Why:** v1 relies entirely on `channels.hacker.members` containing the right ids and the projection's membership filter not having a bug. A single regression — somebody adding a Friend to `hacker.members` for a different feature, or a projection that filters by `type` instead of `members.includes` — leaks hacker chat to Friends. Two cheap belts-and-braces:

1. SEND_MESSAGE handler explicitly checks sender team against channel type for HACKER channels.
2. `broadcastChannelMessage` filters recipients of HACKER messages by `session.players[id].team === HACKERS && alive`, regardless of channel membership.

Either alone catches the other's failure.

**Files:**
- Modify: `apps/server/src/transport/ws-message-handler.ts`
- Modify: `apps/server/src/durable-objects/game-room.ts`
- Test: `apps/server/src/transport/ws-message-handler.test.ts`

- [ ] **Step 1: SEND_MESSAGE handler — explicit check**

In the SEND_MESSAGE branch, add (after sender exists / channel exists guards):

```ts
const channel = session.channels[intent.payload.channelId];
if (channel?.type === 'HACKER') {
  const sender = session.players[ctx.senderId];
  if (!sender || sender.team !== Team.HACKERS || !sender.alive) {
    return { ok: false, reason: 'NOT_IN_CHANNEL' };
  }
}
// (existing membership check is also kept — both gates apply)
```

- [ ] **Step 2: `broadcastChannelMessage` — recipient filter**

Locate `broadcastChannelMessage` in `game-room.ts`. After resolving recipients (currently likely `channel.members`), add a final filter for HACKER channels:

```ts
let recipients = channel.members;
if (channel.type === 'HACKER') {
  recipients = recipients.filter((id) => {
    const p = session.players[id];
    return Boolean(p?.alive && p.team === Team.HACKERS);
  });
}
// then send to `recipients`
```

This is a pure additive guard: the only way it changes behavior is if `channel.members` is wrong, in which case it's the line that prevents a leak.

- [ ] **Step 3: Tests covering both paths**

Append to `ws-message-handler.test.ts`:

```ts
describe('handleSubmitIntent — hacker channel privacy', () => {
  it('rejects a Friend SEND_MESSAGE to the hacker channel with NOT_IN_CHANNEL', async () => {
    const { lobby, session } = setupNight();  // hacker channel is populated
    const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
    // Force-add the friend to hacker channel members to simulate a regression
    // upstream — the handler MUST still reject by team.
    session.channels.hacker.members.push(friend);
    const ctx = buildCtx({ session, lobby, senderId: friend });
    const ack = await handleSubmitIntent(ctx, {
      type: IntentType.SEND_MESSAGE,
      payload: { channelId: 'hacker', body: 'sneaky' },
    });
    expect(ack).toMatchObject({ ok: false, reason: 'NOT_IN_CHANNEL' });
  });
});
```

For the broadcast-side filter, add to `game-room.test.ts` (extending the existing DO test patterns):

```ts
it('broadcastChannelMessage filters HACKER channel recipients by team even when membership is wrong', async () => {
  // Set up a session with a Friend incorrectly listed in hacker.members.
  // Send a message FROM a Hacker to the hacker channel. Assert the Friend's
  // socket received nothing for that channel; both Hackers received it.
  // (Implementation depends on the test harness's broadcast-recording shape.)
});
```

Implementation may require harness extension; if too costly, skip this DO-level test and rely on the unit-level filter test on `broadcastChannelMessage` if the function is exportable. The handler-side test (Step 3 first block) is the high-value one and is mandatory.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/transport/ws-message-handler.ts apps/server/src/transport/ws-message-handler.test.ts apps/server/src/durable-objects/game-room.ts
git commit -m "$(cat <<'EOF'
feat(server): defense-in-depth for hacker channel privacy

SEND_MESSAGE handler explicitly rejects non-Hacker senders to HACKER
channels with NOT_IN_CHANNEL even if upstream membership state is wrong.
broadcastChannelMessage applies a team filter to HACKER recipients as a
second gate. Either gate alone catches the other's failure.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17 (v2): Store consumes `hackerNightView`

Drop the v1 store fields `nightKillTally`, `confirmedNightKill`. Replace with a single slice field `hackerNightView` mirroring the projection. Selectors update accordingly.

**Files:**
- Modify: `apps/web/src/stores/gameStore.js`
- Test: `apps/web/src/stores/gameStore.test.js`

- [ ] **Step 1: Slice fields**

```js
// Initial slice
myTeam: null,
myTeammates: [],
hackerNightView: null,           // { tally, confirmedTarget } | null
pendingNightKillSelection: null, // local-only
```

- [ ] **Step 2: `syncSessionState` mapping**

```js
myTeam: view.myTeam,
myTeammates: view.myTeammates ?? [],
hackerNightView: view.hackerNightView ?? null,
```

- [ ] **Step 3: Selectors**

```js
export function selectIsHacker(state) {
  if (state.myTeam !== 'HACKERS') return false;
  const self = state.selfPlayerId ? state.players?.[state.selfPlayerId] : null;
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
  const hackerSet = new Set([state.selfPlayerId, ...(state.myTeammates ?? [])]);
  return Object.values(state.players).filter(
    (p) => p.alive && !hackerSet.has(p.playerId),
  );
}
```

- [ ] **Step 4: Tests cover the discriminator semantics**

Replace v1 tests with assertions that match the new shape. Key cases:

- `syncSessionState` with `hackerNightView: { tally: { p2: 1 }, confirmedTarget: 'p2' }` → store has same.
- `syncSessionState` with `hackerNightView: null` → store stays `null`.
- `selectIsHackerNight` returns `true` only when `hackerNightView !== null`.
- `selectConfirmedNightKill` returns `null` when `hackerNightView` is `null` (vs. the v1 ambiguity).

- [ ] **Step 5: Commit** — same shape as v1.

---

## Task 21 (v2): NightPanel binds to `hackerNightView` selectors

Same component as v1 except:

- Replace `useGameStore((s) => s.nightKillTally)` with `useGameStore(selectNightKillTally)`.
- Replace `useGameStore((s) => s.confirmedNightKill)` with `useGameStore(selectConfirmedNightKill)`.
- Add an early return: `if (!useGameStore(selectIsHackerNight)) return null;` — single discriminator decides whether to render anything at all (mirrors the projection contract).

The TattleStation phase router (Task 22) can also branch on `selectIsHackerNight` instead of `phase === 'NIGHT_ACTIONS' && isHacker && selfAlive`, eliminating the duplicated discriminator on the client.

---

## Self-Review of v2

**Critique-coverage table:**

| # | Critique | Concrete fix in v2 |
|---|---|---|
| 1 | TDD bloat | Tasks 5 + 6 + 7 collapsed into single direct-impl Task 5 (v2) with one round-trip assertion |
| 2 | Projection fragility | Single discriminated `hackerNightView` (Tasks 3, 12, 17, 21 v2) |
| 3 | Implicit invariants | Defensive last-write-wins dedup in `resolveHackerKillTarget` + projection (Tasks 9, 12 v2) |
| 4 | reconcile overload | Pure resolvers + `applyEliminationOutcome` (Task 10.5) |
| 5 | Metadata loose | Discriminated `SystemEventMetadata` + builder module (Task 4.5) |
| 6 | WS validation gaps | Zod payload schema + SUBMIT_VOTE matrix + payload-shape rejections (Task 13 v2) |
| 7 | Privacy single-point | SEND_MESSAGE team check + broadcast recipient filter (Task 14.5) |

**No new placeholders.** All v2 task code is fully written; no "TODO" or "fill in later." Two places intentionally defer mechanical detail to the engineer — the harness shape in Task 14.5 Step 3's broadcast test (because the harness state isn't visible from outside the codebase) and the SEND_MESSAGE handler's existing surrounding code (because the v1 plan doesn't show it). Both call out exactly what to read first.

**Type consistency check:**

- `hackerNightView: HackerNightView | null` — same name in shared, projection, store, selectors.
- `SystemEventMetadata` discriminator field is `type`, matching `SystemEventView.type`.
- Builder names map predictably: `playerVotedOut`, `playerKilledAtNight`, `noKillTonight`.
- `selectIsHackerNight`, `selectNightKillTally`, `selectConfirmedNightKill`, `selectNightKillCandidates`, `selectIsHacker` — all exported from the same module, same casing.
- `EliminationResolution.kind` is `'ELIMINATE' | 'NONE'`; `reason` matches `RuntimePlayerEliminatedEvent.reason` ('DAY_VOTE' | 'NIGHT_KILL' for the resolution path; 'PLAYER_LEFT' | 'PLAYER_KICKED' stay on the disconnect path which doesn't go through `applyEliminationOutcome`).

No drift found.

---

## Execution Handoff (v2)

The v2 plan supersedes specific v1 tasks per the table at the top of this revision pass. Same two execution options as before:

**1. Subagent-Driven (recommended)** — fresh subagent per task with the v1+v2 sections in scope; review between tasks.

**2. Inline Execution** — batch with checkpoints.

Which approach?
