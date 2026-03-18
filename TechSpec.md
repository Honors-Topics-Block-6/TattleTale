**TATTLE TALE - TECHNICAL SPECIFICATION**

## 0\. Design Invariants (Non-Negotiable)

- **Server-authoritative truth**
- **Clients submit intents, never outcomes**
- **All hidden information is intentional**

## 1\. Product Scope

### 1.1 Supported Platforms

- Web (desktop + mobile browsers)
- Progressive Web App (PWA)-capable
- No native apps aka no downloads (v1)

### 1.2 Session Parameters

- Players: 7-20
- Session length: 10-20 minutes
- Join-in-progress: ❌
- Reconnect-in-progress: ✅ (alive players only)

## 2\. Technology Stack

### Client

- TypeScript
- React (Next.js)
- Zustand (local state)
- Tailwind CSS (CSS but with some nice things)
- WebSocket transport (For all the real-time device-to-device communication)
- No canvas, no game engine

### Server

- Node.js + TypeScript
- Fastify (Sponsored by Mercedes)
- WebSocket (Socket.IO)
- Redis (active game cache + timers)

### Persistence

- PostgreSQL  
    - Prisma ORM
    - Neon

## 2.1 Hosting & Deployment (v1)

### Goals

- **Production-like behavior on a $0 budget**, compatible with long-lived WebSocket sessions.
- **Single origin** to minimize CORS complexity: one domain serves the web client, API, and Socket.IO transport.

### Provider

- **Oracle Cloud Infrastructure (OCI) Always Free** provides the compute host (a VM) for the game server and Redis.
  - Rationale: most “free tier” PaaS hosts suspend/sleep instances, which breaks or degrades real-time Socket.IO sessions.

### Topology (Single-Origin)

- **One public domain** terminates TLS and forwards to the Node server.
- **Node (Fastify) serves:**
  - Static web client build (SPA assets)
  - Operational endpoints (`/health`, `/ready`)
  - Socket.IO transport (WebSocket)

### Persistence + Cache

- **PostgreSQL**: Neon (managed). Configure via `DATABASE_URL`.
- **Redis**: runs on the OCI VM (local/private network). Configure via `REDIS_URL`.

### Environment Variables (Minimum)

- `NODE_ENV` = `production`
- `HOST` = `0.0.0.0`
- `PORT` = provider-assigned port (or `3001` behind a reverse proxy)
- `WEB_ORIGIN` = the production site origin (same domain in single-origin topology)
- `DATABASE_URL` = Neon connection string
- `REDIS_URL` = Redis connection string (usually local to VM)

### Operational Notes (Free-Tier Reality)

- “Always Free” is not the same as a paid SLA: compute capacity and instance lifecycle policies can affect uptime.
- This hosting plan is for **v1 launch/testing**; if uptime guarantees become required, move to paid compute or managed Redis.

## 3\. Authoritative Game Model

### 3.1 GameState (Server Only)

GameState {

id: UUID

phase: Phase

cycle: number

players: Map&lt;PlayerId, PlayerState&gt;

channels: Map&lt;ChannelId, ChannelState&gt;

pendingActions: Action\[\]

settings: GameSettings

}

**GameState is never serialized whole to clients.**

**4\. Phase System (Deterministic)**

### Phase Enum

enum Phase {

DAY_OPEN,

DAY_VOTE,

DAY_RESOLVE,

NIGHT_ACTIONS,

NIGHT_RESOLVE,

NIGHT_REVEAL

}

### Rules

- Phase timers live only on server
- Client clocks are advisory
- Inputs received outside phase window are rejected  

## 5\. Player Model

PlayerState {

id: UUID

name: string

roleId: RoleId

team: Team

alive: boolean

permissions: PermissionSet

}

## 6\. Intent → Resolution Model (Critical)

### 6.1 Player Intent (Client → Server)

PlayerIntent {

playerId

type: IntentType

payload

timestamp

}

Examples:

- SEND_MESSAGE
- SUBMIT_VOTE
- SUBMIT_NIGHT_ACTION

Clients **never** specify:

- success
- failure
- visibility
- side effects

### 6.2 Server Resolution (Server Only)

- Validates intent
- Applies modifiers
- Updates GameState
- Emits events

##

## 7\. Communication System (Primary Game Mechanic)

### 7.1 Channel Types

enum ChannelType {

GLOBAL,

PRIVATE,

ROLE,

TEMP,

SYSTEM

}

### 7.2 ChannelState

ChannelState {

id: UUID

type: ChannelType

members: PlayerId\[\]

locked: boolean

expiresAt?: Phase

}

## 8\. Message Processing Pipeline

**Every message follows this exact pipeline:**

- Permission check
- Phase legality check
- Role modifiers applied
- Integrity flag assigned
- Logged (raw + modified)
- Delivered to recipients
- System events emitted (if applicable)

## 9\. System Event Feed (Separate UI)

### Purpose

Explain _that_ something happened without revealing _who_ caused it.

### Properties

- Read-only
- Non-chat
- Ordered
- Visible to all players

### Example Events

- CHANNEL_LOCKED
- COMMUNICATION_JAMMED
- MESSAGE_INTEGRITY_COMPROMISED
- TEMP_CHANNEL_CREATED
- PSYCHIC_SIGNAL_RECEIVED

## 10\. Role System

### 10.1 Role Interface

interface Role {

id: RoleId

team: Team

nightAction?: ActionType

uses?: number

}

Roles **cannot**:

- modify GameState directly
- send messages directly
- override resolution order

They emit _Actions only_.

## 11\. Action Resolution Engine

### Resolution Order (Immutable)

- Protection
- Investigation
- Communication interference
- Message mutation
- Elimination
- Channel mutation  

Resolution is:

- deterministic
- server-only

## 12\. Voting System

### Rules

- One vote per alive player
- Abstain is a vote type
- Tie results in no elimination
- Votes are secret
- Option with most votes (including abstain option) is resolved  

### Failure Handling

- Missing vote = abstain
- Disconnect during vote = abstain

## 13\. Information Contract (This Is New & Important)

| **Information** | **Who Can Know** | **When** |
| --- | --- | --- |
| Your role | You | Game start |
| --- | --- | --- |
| Other roles | Nobody | Ever (unless investigated) |
| --- | --- | --- |
| Channel locks | Everyone | Immediately |
| --- | --- | --- |
| Message alteration | Recipient only (flagged) | On receipt |
| --- | --- | --- |
| Psychic signals | Psychic only | Day start |
| --- | --- | --- |
| Hacker identities | Hackers | Game start |
| --- | --- | --- |

**If it's not in this table, it's hidden.**

## 14\. Hard-to-implement Roles

### Troller

- Syntax-only corruption
- Integrity warning required
- Never alters names or intent  

### Imitator

- Uses system-generated alias
- Never impersonates real usernames  

### Psychic

- Receives server-generated summaries
- No raw data
- Bounded entropy  

## 15\. Neutral Role Constraint

**The Jealous**

- Swap occurs at Night
- Target players reset to default role
- All role state wiped
- Permissions recalculated

## 16\. Win Condition Engine

if hackers >= ceil(alive / 2) → Hackers win

if hackers == 0 → Friends win

Checked after every elimination.

## 17\. Persistence Model (Minimal, Sufficient)

- Users
- Games
- GamePlayers
- Message
- No replays (v1)  

## 18\. Failure & Reconnect Rules

- Disconnect ≠ death
- Reconnect restores:
  - current phase
  - accessible channels
- Missed messages not replayed
- No phase rollback
