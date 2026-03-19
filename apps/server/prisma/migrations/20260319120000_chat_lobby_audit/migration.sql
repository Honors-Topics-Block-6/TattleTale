ALTER TABLE "message_audit_events"
ADD COLUMN "lobby_code" TEXT;

UPDATE "message_audit_events" AS mae
SET "lobby_code" = g."lobby_code"
FROM "games" AS g
WHERE mae."game_id" = g."id";

UPDATE "message_audit_events"
SET "lobby_code" = 'UNKNOWN'
WHERE "lobby_code" IS NULL;

ALTER TABLE "message_audit_events"
ALTER COLUMN "lobby_code" SET NOT NULL;

ALTER TABLE "message_audit_events"
ALTER COLUMN "game_id" DROP NOT NULL;

ALTER TABLE "message_audit_events"
DROP CONSTRAINT "message_audit_events_game_id_fkey";

ALTER TABLE "message_audit_events"
ADD CONSTRAINT "message_audit_events_game_id_fkey"
FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "message_audit_events_lobby_code_created_at_idx"
ON "message_audit_events"("lobby_code", "created_at");
