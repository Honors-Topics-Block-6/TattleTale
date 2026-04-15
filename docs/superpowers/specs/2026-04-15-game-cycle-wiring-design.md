# Game Cycle Wiring — End-to-End MVP with Hacker Night Kill

**Date:** 2026-04-15
**Branch:** `createGameMaybe`
**Scope:** Make one full cycle playable end-to-end, including a two-team (Hackers vs Friends) night kill mechanic. All other roles are deferred.

## Goal

A player can:

1. Create or join a lobby, wait in the room, and start the game.
2. Play through `DAY_OPEN → DAY_VOTE → DAY_RESOLVE → NIGHT_ACTIONS → NIGHT_RESOLVE → NIGHT_REVEAL` and loop back to `DAY_OPEN` with an incremented cycle.
3. Chat in the global channel throughout. Hackers can chat in a private hacker channel.
4. Vote during `DAY_VOTE`; the plurality target is eliminated at `DAY_RESOLVE` (or no-one on a tie).
5. As a Hacker, pick a kill target during `NIGHT_ACTIONS`; plurality wins at `NIGHT_RESOLVE` and the target is eliminated at night (or no-one on a tie).
6. See readable system-event feed entries for votes-out and night-kills.
7. Reach a terminal state — `FRIENDS_WIN` when all Hackers are eliminated, `HACKERS_WIN` when Hackers reach parity or majority of living players — and see a win screen.

Also lands the in-flight lobby / chat / vote-tally / elimination broadcast work currently sitting uncommitted on the branch.

## Non-Goals

- Other roles (Investigator, Protector, Jammer, Psychic, Troller, Extrovert, Boss, etc.). `roleId` stays `null` for everyone; we use `team` only.
- Enforced minimum player count at game start. Router allows 1+ for testing. Flagged as a required follow-up before real playtests.
- Chat history replay on reconnect. Messages remain ephemeral.
- Rich EliminationSequence visuals. We add exactly one new cause branch (`NIGHT_KILL`); existing VOTED_OUT / PLAYER_LEFT / PLAYER_KICKED variants are left as-is.
- Phase-based channel locks. Per user preference, global and hacker channels are always open to their respective audiences.

## Architecture

Layering stays as-is:

```
Client (React + Zustand + Immer)
     │  WS frames (submitIntent, joinLobby, startGame, rejoinLobby, kickPlayer)
     ▼
GameRoom Durable Object  ◄──── DO alarm (phase deadlines)
     │
     ▼
domain/game/* (pure functions, testable in isolation)
     │  RuntimeEvent[]
     ▼
audit DB + WS broadcasts (sessionState, channelMessage, playerEliminated)
```

The DO alarm drives phase transitions deterministically. `reconcileSessionRuntime` is the single point where phase-boundary resolution happens; it is pure (given `session`, `lobby`, `settings`, `now`) and idempotent past the boundary.

### Data flow: one night kill

1. Alarm fires at NIGHT_ACTIONS start. DO broadcasts per-player `sessionState`. Hacker clients render `NightPanel`; Friend clients render `NightSpectatorView`.
2. Each living Hacker selects a target; client sends `submitIntent` `{type: 'SUBMIT_NIGHT_ACTION', payload: {actionType: 'HACKER_KILL', targetPlayerId}}`.
3. Server validates (phase, team, target alive and not Hacker, target not self). On accept, `appendIntent` dedupes per-player (latest replaces prior). DO broadcasts updated `sessionState`; Hackers see an updated `nightKillTally`, Friends see nothing new.
4. Alarm fires at NIGHT_RESOLVE. `reconcileSessionRuntime` calls `resolveHackerKillTarget`. On a plurality winner, `eliminatePlayer` runs, `applyWinState` runs, and a `PLAYER_KILLED_AT_NIGHT` system event is appended with `{targetPlayerId, targetDisplayName}` metadata. On a tie or no-submission, a `NO_KILL_TONIGHT` system event is appended. DO broadcasts `playerEliminated` (with `cause: 'NIGHT_KILL'`) and the next `sessionState`.
5. Alarm fires at NIGHT_REVEAL. Clients render the new system-feed entry. Next alarm transitions to DAY_OPEN, cycle incremented.

## Server Changes

### Shared contracts (`packages/shared/src/`)

`enums.ts`:

- `SystemEventType` gains `PLAYER_VOTED_OUT`, `PLAYER_KILLED_AT_NIGHT`, `NO_KILL_TONIGHT`.
- `ChannelType` gains `HACKER`.
- No new `RoleId` enum.

`contracts/events.ts`:

- `PlayerEliminatedPayload.cause` union gains `'NIGHT_KILL'`.

`contracts/views.ts`:

- `SystemEventView` gains `metadata?: Record<string, string>` (optional, backward compatible).
- `PlayerSessionView` gains `nightKillTally: Record<string, number> | null`, `myTeammates: string[]`, and `myConfirmedNightKillTarget: string | null` (the viewing Hacker's own current-cycle HACKER_KILL target, if any).
- `PlayerSessionView.myTeam` already exists as `Team` (non-null) on views.ts:110 — no change, but noted here so downstream sections can refer to it.

### Game types (`apps/server/src/domain/game/types.ts`)

- `SystemEventState` mirrors `SystemEventView`: add `metadata?: Record<string, string>`.
- `NightActionIntentPayload` unchanged (`actionType: string` already handles `'HACKER_KILL'`).

### `session-domain.ts` — `buildSessionFromLobby`

Add a `hacker` channel alongside `global` and `system`, with empty members (populated by `initializeSessionRuntime` after team assignment):

```ts
channels: {
  global: { id: 'global', type: ChannelType.GLOBAL, members: <all living>, locked: false, expiresAt: null },
  system: { id: 'system', type: ChannelType.SYSTEM, members: <all living>, locked: false, expiresAt: null },
  hacker: { id: 'hacker', type: ChannelType.HACKER, members: [], locked: false, expiresAt: null },
}
```

### `runtime-domain.ts` — `initializeSessionRuntime`

After `assignTeams`, populate hacker channel:

```ts
const hackerIds = Object.values(session.players)
  .filter(p => p.team === Team.HACKERS)
  .map(p => p.playerId);
if (session.channels.hacker) {
  session.channels.hacker.members = hackerIds;
}
```

### `runtime-domain.ts` — night-kill resolution

- Extend `RuntimePlayerEliminatedEvent.reason` union with `'NIGHT_KILL'`.
- Add a private `resolveHackerKillTarget(session: GameState): string | null` structurally parallel to `resolveDayVoteEliminationTarget`:
  - Consider only living Hackers as voters.
  - Consider only current-cycle `SUBMIT_NIGHT_ACTION` intents whose `payload.actionType === 'HACKER_KILL'`.
  - Validate target at resolution time: must exist, be alive, and **not** be on `Team.HACKERS`. Invalid targets collapse to abstain.
  - Tally (ABSTAIN key for null/invalid). Strict plurality; tie returns `null`.
- Update `reconcileSessionRuntime` NIGHT_ACTIONS branch:

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
      events.push({ type: 'GAME_ENDED', winnerTeam, status: session.status, at: transitionAt });
    }
  } else {
    appendSystemEvent(session, SystemEventType.NO_KILL_TONIGHT, transitionAt);
  }
}
```

- Update the existing DAY_VOTE branch to also append a `PLAYER_VOTED_OUT` system event after a successful elimination, with `{targetPlayerId, targetDisplayName}` metadata.

### `runtime-domain.ts` — `appendSystemEvent` helper

```ts
const SYSTEM_EVENT_CAP = 50;

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
```

Trim-on-append bounds in-memory state, not just the projection.

### `isIntentAllowedInPhase`

No change. Per-team / per-role authorization moves to the WS handler where player identity is available.

### `ws-message-handler.ts` — SUBMIT_NIGHT_ACTION validation

In the `submitIntent` dispatcher branch for `SUBMIT_NIGHT_ACTION`:

1. Phase must be `NIGHT_ACTIONS` (already enforced by `isIntentAllowedInPhase`) → else `PHASE_MISMATCH`.
2. `(payload as NightActionIntentPayload).actionType === 'HACKER_KILL'` → else `UNSUPPORTED_ACTION`.
3. Sender is alive and `team === Team.HACKERS` → else `NOT_AUTHORIZED`.
4. `targetPlayerId !== senderPlayerId`, target exists, target is alive, target is **not** a Hacker → else `INVALID_TARGET`.

Then call `appendIntent`. Broadcast sessionState follows existing flow.

### `ws-message-handler.ts` — elimination cause mapping

Extend the existing `reason → cause` map in `broadcastPlayerEliminated`:

```ts
'DAY_VOTE' → 'VOTED_OUT'
'NIGHT_KILL' → 'NIGHT_KILL'
'PLAYER_LEFT' → 'PLAYER_LEFT'
'PLAYER_KICKED' → 'PLAYER_KICKED'
```

### `projections.ts` — `toPlayerSessionView`

Add hacker-scoped night tally, teammate roster, and own-target rehydration field:

```ts
let nightKillTally: Record<string, number> | null = null;
let myTeammates: string[] = [];
let myConfirmedNightKillTarget: string | null = null;

if (player?.alive && player?.team === Team.HACKERS) {
  myTeammates = Object.values(session.players)
    .filter(p => p.alive && p.team === Team.HACKERS && p.playerId !== playerId)
    .map(p => p.playerId);

  if (session.phase === Phase.NIGHT_ACTIONS) {
    nightKillTally = tallyCurrentCycleNightKillIntents(session);

    // The viewer's own current-cycle HACKER_KILL target, if submitted.
    // Lets a reconnecting Hacker rehydrate `confirmedNightKill` reliably.
    const ownIntent = session.pendingIntents.find(i =>
      i.playerId === playerId
      && i.type === IntentType.SUBMIT_NIGHT_ACTION
      && i.cycle === session.cycle
      && (i.payload as NightActionIntentPayload).actionType === 'HACKER_KILL'
    );
    myConfirmedNightKillTarget =
      (ownIntent?.payload as NightActionIntentPayload | undefined)?.targetPlayerId ?? null;
  }
}
```

`nightKillTally` and `myConfirmedNightKillTarget` are both `null` for Friends, for dead Hackers, and outside NIGHT_ACTIONS. Friends never see the hacker tally in server traffic.

`myTeam` is already in the projection (projections.ts:63, defaulting to `FRIENDS` when `player` is undefined). No change to that field here.

The existing day-vote `voteTally` remains public to all viewers (no change).

Also pass through `metadata` on `systemEvents`.

### `router.ts`

No change.

### `game-room.ts`

No structural change. `sessionState` broadcasts already flow the new `systemEvents.metadata`, `nightKillTally`, `myTeammates`, and `myConfirmedNightKillTarget`. The `broadcastPlayerEliminated` helper just needs the extended cause map above.

## Client Changes

### Store (`apps/web/src/stores/gameStore.js`)

Session slice adds:

- `myTeam: 'HACKERS' | 'FRIENDS'` — sourced from `PlayerSessionView.myTeam` (always non-null once sessionState has arrived; before that, the slice is uninitialized rather than `null`).
- `myTeammates: string[]`
- `nightKillTally: Record<string, number> | null`
- `confirmedNightKill: string | null` — sourced from `PlayerSessionView.myConfirmedNightKillTarget`. Server-authoritative; rehydrates correctly on reconnect.
- `pendingNightKillSelection: string | null` — local-only optimistic selection before confirm, analogous to day-vote `pendingSelection`.

System-events slice: pass-through of `metadata` (no schema change in the store).

Selectors:

- `selectIsHacker(state)` — true iff `myTeam === 'HACKERS'` and self is alive.
- `selectNightKillCandidates(state)` — living players whose team is not `HACKERS` and who are not self.

### Socket hook (`apps/web/src/hooks/useGameSocket.js`)

Extend `syncSessionState` to copy `myTeam`, `myTeammates`, `nightKillTally`, and `myConfirmedNightKillTarget` (→ store `confirmedNightKill`) into the store. No new message types.

`playerEliminated` handler is unchanged in shape; now receives `cause: 'NIGHT_KILL'` in some cases. `EliminationSequence` branches on cause.

### `NightPanel.jsx` (new)

Structural twin of `VotePanel.jsx`.

- Rendered during `phase === 'NIGHT_ACTIONS'` for living Hackers. For non-Hackers / dead, render `NightSpectatorView` instead.
- Candidates from `selectNightKillCandidates`.
- Select-then-confirm flow. Confirm dispatches `{type: 'SUBMIT_NIGHT_ACTION', payload: {actionType: 'HACKER_KILL', targetPlayerId}}`.
- Displays `nightKillTally` (per-target count) and the Hacker roster (`myTeammates`).
- Ack errors (`NOT_AUTHORIZED`, `INVALID_TARGET`, `PHASE_MISMATCH`, `UNSUPPORTED_ACTION`) surface as inline error state, reusing whatever pattern VotePanel uses.

### `NightSpectatorView.jsx` (new)

Simple: "Night has fallen. The Hackers are choosing…" with a muted ambient treatment. Global chat below stays usable.

### TattleStation phase-to-panel mapping

| Phase | Non-Hacker view | Hacker view |
|---|---|---|
| DAY_OPEN | ChatPanel | ChatPanel |
| DAY_VOTE | ChatPanel + VotePanel | ChatPanel + VotePanel |
| DAY_RESOLVE | ChatPanel + SystemEventFeed | same |
| NIGHT_ACTIONS | ChatPanel + NightSpectatorView | ChatPanel + NightPanel |
| NIGHT_RESOLVE | ChatPanel + SystemEventFeed | same |
| NIGHT_REVEAL | ChatPanel + SystemEventFeed | same |

### `SystemEventFeed.jsx` (new or extracted)

Lightweight component rendering the last N `systemEvents` entries with per-type templates:

```js
const TEMPLATES = {
  GAME_STARTED: () => 'The game has begun.',
  PLAYER_VOTED_OUT: ({ targetDisplayName }) => `${targetDisplayName} was voted out.`,
  PLAYER_KILLED_AT_NIGHT: ({ targetDisplayName }) => `${targetDisplayName} was hacked in the night.`,
  NO_KILL_TONIGHT: () => 'The night passed without incident.',
  // CHANNEL_LOCKED, COMMUNICATION_JAMMED, etc. kept for future.
};
```

Graceful fallback when `metadata` is absent (render type tag only).

### Hacker channel window

Independent OS window (DMWindow-style), registered in `OS.jsx` when `myTeam === 'HACKERS'` and `channels['hacker']` exists. Renders a `ChatPanel` bound to `channelId='hacker'` with cycle dividers. Auto-opens once for Hackers on game start. Non-Hackers never see it because the channel is filtered out of their projection.

### Elimination visual treatment

Extend `EliminationSequence` variant switch:

- `cause === 'VOTED_OUT'` — existing treatment.
- `cause === 'NIGHT_KILL'` — variant (glitch-heavy + "CONNECTION TERMINATED" text).
- `cause === 'PLAYER_LEFT' | 'PLAYER_KICKED'` — existing treatment.

### Win screen

`WinScreen` already reads `status` and `winnerTeam` from projection. No new data; confirm it renders on `status !== ACTIVE`.

## Error Handling & Edge Cases

### Intent validation errors

Reasons returned on rejected `submitIntent`:

| Reason | When |
|---|---|
| `PHASE_MISMATCH` | Vote in non-DAY_VOTE; night action in non-NIGHT_ACTIONS. |
| `NOT_AUTHORIZED` | SUBMIT_NIGHT_ACTION from a non-Hacker or dead Hacker. |
| `INVALID_TARGET` | Night target dead, is a Hacker, or is sender. Day target dead. |
| `UNSUPPORTED_ACTION` | `actionType` other than `'HACKER_KILL'`. |
| `DUPLICATE_VOTE` | Day-only (existing). Night dedupes by replace-latest, never returns this. |
| `NOT_IN_CHANNEL` | SEND_MESSAGE to a channel the sender isn't in (e.g., Friend → `hacker`). |

Clients surface these on the originating panel.

### Hacker leaves / disconnects during NIGHT_ACTIONS

- **Disconnect:** player stays alive; intent (if submitted) stays in `pendingIntents` and still counts. Rejoin loads current state.
- **Explicit leave / kick:** `processElimination` fires with cause `PLAYER_LEFT` / `PLAYER_KICKED`. `eliminatePlayer` removes the player's intents and channel memberships. `applyWinState` runs — if that was the last Hacker, Friends win mid-night. `reconcileSessionRuntime` early-exits on `status !== ACTIVE`; no further phase advance.

### All Hackers dead mid-game

`applyWinState` sets `FRIENDS_WIN`, nulls the phase deadline, skips alarm rescheduling. Clients transition to WinScreen on the next `sessionState`.

### Mutual targeting

Blocked by `INVALID_TARGET` (Hackers can't target Hackers; no self-target).

### No Hacker submits

`resolveHackerKillTarget` returns `null`. `NO_KILL_TONIGHT` system event appended. Game continues.

### Tied Hacker vote

Same as no-submit: plurality with tie → null → `NO_KILL_TONIGHT`.

### Target dies between submission and NIGHT_RESOLVE

Possible only via disconnect/kick during NIGHT_ACTIONS. `resolveHackerKillTarget` revalidates at resolution time; stale target becomes abstain for tally purposes.

### Win at NIGHT_RESOLVE

Night kill can bring `hackersAlive ≥ ceil(aliveCount/2)` → `HACKERS_WIN`. `applyWinState` sets terminal status, `GAME_ENDED` event emitted, no next alarm.

### Alarm skew / replay

Phase-boundary resolution is idempotent by construction, enforced jointly by the deadline check inside `reconcileSessionRuntime` and by Durable Object storage transactionality. The reasoning:

- `reconcileSessionRuntime` early-returns when `Date.parse(session.timers.currentPhaseEndsAt) > nowMs`. A successful reconcile advances the deadline to the next phase's `deadline + durationSeconds`, so an immediate re-invocation with the same `now` sees the new deadline in the future and exits without touching state.
- Cloudflare DO storage commits transactionally when the alarm handler returns cleanly. If the handler throws partway through (e.g., after `eliminatePlayer` but before phase advance), the reactive runtime discards all uncommitted changes. The next alarm invocation sees pre-reconcile state and replays the full resolution — deterministically, because the same inputs (deadline passed, same intents, same players) yield the same events. `appendSystemEvent` will produce the same record with the same type and metadata. `eliminatePlayer` is no-op on already-dead targets — but post-rollback the target is alive again, so the re-run eliminates them once.
- The only way to double-append the same boundary's system event is a scenario where the DO runtime re-invokes a handler whose storage already committed, which the platform doesn't do for a single alarm. Alarms may be scheduled at-least-once, but once a handler commits, the deadline has moved, and the deadline check gates the second invocation.

Defensive follow-up (not required for MVP): add a test that calls `alarm()` twice at the same `now` (first with unreached deadline, then with reached deadline, then a third time with reached deadline again) and asserts exactly one `PhaseAdvanced`, one elimination, and one system event.

### Reconnect during night

`PlayerSessionView` returns phase, deadline, hacker-scoped tally (if applicable), `systemEvents`, membership-filtered channels, and — new in this spec — `myConfirmedNightKillTarget`. On reconnect a Hacker's `NightPanel` rehydrates `confirmedNightKill` directly from the projection, so they see which target they've locked in and the panel correctly suppresses resubmission.

Day-vote `confirmedVote` still has the older "I know I voted but not for whom on reconnect" limitation. Tightening that is symmetric to what we do here and is a cheap follow-up, but it's pre-existing behavior and not part of this scope.

Chat history on reconnect remains out of scope (see Follow-ups).

### Lobby → game start with < 5 players

Router minimum is 1 for testing. `chooseHackerCount(n)` degenerates gracefully for small `n`. One-player games end immediately on first vote resolution (HACKERS_WIN) since 1 Hacker of 1 living meets the majority test. Acceptable for development. **Before first playtest, add a `livingPlayers < 5` guard to `handleStartGame` returning `NOT_ENOUGH_PLAYERS`.**

### System-event feed overflow

Bounded at 50 via trim-on-append in `appendSystemEvent`. Revisit retention only if playtesting reveals the cap is too tight.

## Testing Strategy

Test the things we touch. Skip visuals and untouched features.

### Domain unit tests — `runtime-domain.ts`

- `resolveHackerKillTarget`:
  - plurality winner returned
  - tie returns null
  - all-abstain returns null
  - dead-target-at-resolution treated as abstain
  - Hacker target rejected (treated as abstain)
  - self-target rejected (can't be submitted, but belt-and-suspenders at resolver)
  - no intents returns null
- `reconcileSessionRuntime` NIGHT_ACTIONS → NIGHT_RESOLVE branch:
  - applies kill on majority, emits `PLAYER_ELIMINATED` with `reason: 'NIGHT_KILL'`
  - appends `PLAYER_KILLED_AT_NIGHT` system event with correct `{targetPlayerId, targetDisplayName}`
  - triggers `GAME_ENDED` when kill ends the game
  - appends `NO_KILL_TONIGHT` on tie / no submission
- `reconcileSessionRuntime` DAY_VOTE → DAY_RESOLVE branch: appends `PLAYER_VOTED_OUT` system event on successful elimination (extend existing coverage).
- `initializeSessionRuntime`: hacker channel members equal assigned Team.HACKERS after team assignment; global/system unchanged.
- `appendSystemEvent`: 50-cap enforced, oldest dropped first.

Determinism: pass seeded `random` to `assignTeams`.

### WS handler tests — `ws-message-handler.ts`

For `SUBMIT_NIGHT_ACTION` with `actionType='HACKER_KILL'`:

- Hacker sender + valid target → `ok: true`, intent appended.
- Non-Hacker sender → `NOT_AUTHORIZED`.
- Dead Hacker sender → `NOT_AUTHORIZED`.
- Target is Hacker → `INVALID_TARGET`.
- Dead target → `INVALID_TARGET`.
- Self-target → `INVALID_TARGET`.
- During DAY_VOTE → `PHASE_MISMATCH`.
- `actionType !== 'HACKER_KILL'` → `UNSUPPORTED_ACTION`.

For `SEND_MESSAGE`:

- Friend targeting `channelId='hacker'` → `NOT_IN_CHANNEL`.

### Projection tests — `projections.ts`

- `nightKillTally` is populated only for living Hackers during NIGHT_ACTIONS; null otherwise (Friends, dead Hackers, other phases).
- `myTeammates` populated for Hackers only (empty for Friends).
- `myConfirmedNightKillTarget` matches the viewer's own current-cycle HACKER_KILL target if submitted; null if not submitted, if viewer is a Friend, if viewer is a dead Hacker, or outside NIGHT_ACTIONS.
- Channels filtered by membership — Friends don't see `hacker`.
- `systemEvents` pass through `metadata`.

### DO integration test — `game-room.ts`

Using Miniflare / vitest-pool-workers, run a single room through a full cycle with 5 players (seeded random: 2 Hackers, 3 Friends):

1. Start game, fast-forward alarm through DAY_OPEN.
2. Submit day votes, fast-forward to DAY_RESOLVE. Assert `playerEliminated` broadcast (cause `VOTED_OUT`) and `PLAYER_VOTED_OUT` system event in next `sessionState`.
3. Fast-forward through NIGHT_ACTIONS. Both Hackers submit `HACKER_KILL` on same Friend. Fast-forward to NIGHT_RESOLVE. Assert kill applied, `PLAYER_KILLED_AT_NIGHT` system event, `playerEliminated` broadcast with `cause: 'NIGHT_KILL'`.
4. Continue until win state. Assert `GAME_ENDED` event, terminal `status`, no further alarms scheduled.

Additional: "hacker disconnects mid-night" — disconnected Hacker's intent cleared only on elimination, not disconnect. Verify behavior.

Additional: **alarm replay idempotency** — at a phase boundary, invoke `reconcileSessionRuntime` (or the DO `alarm()` wrapper) twice at the same `now`. Assert exactly one `PhaseAdvanced` event, exactly one elimination (if applicable), exactly one matching system event, and that `currentPhaseEndsAt` advances only once.

### Client tests

Only where non-trivial logic lives:

- `NightPanel`: renders only when `isHacker`; candidate list excludes Hackers, self, dead; confirm dispatches correct intent envelope; displays tally from store.
- `SystemEventFeed`: templates render correctly per type; missing `metadata` handled without throwing.
- Selectors `selectIsHacker`, `selectNightKillCandidates`: boundary cases (dead self, no Hackers alive, etc.).

### Manual smoke checklist

Player counts below reflect what `chooseHackerCount(n)` actually produces (n ≤ 10 → 2 Hackers; n ≥ 11 → 3 Hackers; n ≥ 16 → 4 Hackers). Tests assume seeded randomness or explicit role assertion in-client; without that, re-run until the desired split lands.

1. **HACKERS_WIN via night kill path.** 5 tabs, 5-player lobby. `chooseHackerCount(5) = 2` → 2 Hackers + 3 Friends. Script:
   - DAY_VOTE: all 5 abstain (or no majority) → `NO_VOTE_OUT`-style outcome (abstain plurality → null target, no elimination). Still alive: 2H + 3F.
   - NIGHT_ACTIONS: both Hackers submit `HACKER_KILL` on the same Friend → plurality of 2 → Friend eliminated at NIGHT_RESOLVE. State: 2H + 2F. `applyWinState`: hackersAlive=2, aliveCount=4, ceil(4/2)=2, 2≥2 → `HACKERS_WIN`. WinScreen renders on next `sessionState`.
   - Assert: `PLAYER_KILLED_AT_NIGHT` system event visible with the Friend's display name; `playerEliminated` broadcast carries `cause: 'NIGHT_KILL'`; session.status terminal; no further alarm.
2. **FRIENDS_WIN via day vote path.** Restart; same 5-player setup. Script:
   - DAY_VOTE 1: all 3 Friends coordinate to vote Hacker A; Hackers split their votes or vote for Friends. Tally: Hacker A with 3 votes (majority) → eliminated. State: 1H + 3F.
   - NIGHT_ACTIONS 1: remaining Hacker kills any Friend → 1H + 2F (aliveCount=3, ceil=2, 1<2, game continues).
   - DAY_VOTE 2: remaining 2 Friends + remaining 1 Hacker vote. If both Friends vote the Hacker: tally 2-1, Hacker eliminated → 0H + 2F → `FRIENDS_WIN`.
   - Assert: `PLAYER_VOTED_OUT` system events at each day vote; final status `FRIENDS_WIN`.
3. **`NO_KILL_TONIGHT` path.** 5-player lobby. In NIGHT_ACTIONS, one Hacker picks Friend A, the other Hacker picks Friend B (or abstains). Tally ties (or only one vote exists and splits against abstains) → `resolveHackerKillTarget` returns null → system event `NO_KILL_TONIGHT` in the feed; no `playerEliminated` broadcast; game continues.
4. **Reconnect mid-night (Hacker).** 5-player lobby. During NIGHT_ACTIONS, Hacker A picks a target, then force-closes their tab and reopens. On rejoin, their `NightPanel` shows the target already selected (via `myConfirmedNightKillTarget`) and resubmission is suppressed.

Item 4 confirms the issue-1 fix empirically.

### Out of scope for testing

- Cross-DO routing (lobby → game-room).
- WS reconnect timing behavior.
- Visual effects (elimination animations, theme changes, OS windowing).
- Any untouched feature.

## Follow-ups

Logged, not in this spec:

1. **Remaining roles** — all other roles from `DesignDoc.md`. When added, refactor `resolveHackerKillTarget` into a priority-ordered night-action dispatch table. `roleId` becomes load-bearing.
2. **Minimum player count** — `handleStartGame` guard rejecting `livingPlayers < 5` with `NOT_ENOUGH_PLAYERS` before first playtest.
3. **Chat history on reconnect** — persisted per-channel message buffer, memory bounds, replay envelope. Separate design; hacker-channel privacy on state flips is non-trivial.
4. **System-event retention** — if 50 proves too tight, revisit with summarization or per-type retention.
5. **Hacker-channel phase locks** — currently always-on; add if gameplay pacing needs it.
6. **Night-kill variants** — Boss override, protection, silencing. Reachable by the same refactor as #1.
7. **EliminationSequence per-role variants** — richer death animations once roles exist.
8. **Audit DB migration for `NIGHT_KILL`** — verify the Drizzle schema for the audit table accepts the new reason; add a migration if enum-constrained.
