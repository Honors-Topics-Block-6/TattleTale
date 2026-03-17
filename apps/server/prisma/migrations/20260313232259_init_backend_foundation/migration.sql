-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "lobby_code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_phase" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "is_host" BOOLEAN NOT NULL DEFAULT false,
    "role_id" TEXT,
    "team" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_audit_events" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_audit_events" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "sender_player_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "delivered_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_lobby_code_key" ON "games"("lobby_code");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_game_id_player_id_key" ON "game_players"("game_id", "player_id");

-- CreateIndex
CREATE INDEX "session_audit_events_game_id_created_at_idx" ON "session_audit_events"("game_id", "created_at");

-- CreateIndex
CREATE INDEX "message_audit_events_game_id_created_at_idx" ON "message_audit_events"("game_id", "created_at");

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_audit_events" ADD CONSTRAINT "session_audit_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_audit_events" ADD CONSTRAINT "message_audit_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
