-- Live exercise rooms, login-code attempt counter, and room-level AI runs.
-- Mirrors the idempotent bootstrap in backend/src/server.js (ensureSaasSchema).

ALTER TABLE "login_codes" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ai_runs" ALTER COLUMN "tabletopId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "exercise_rooms" (
  "id" UUID NOT NULL,
  "joinCode" TEXT NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "tabletopId" UUID,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'lobby',
  "simulationJson" JSONB NOT NULL,
  "stateJson" JSONB NOT NULL,
  "reportJson" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "maxParticipants" INTEGER NOT NULL DEFAULT 5,
  "aiCalls" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "exercise_rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exercise_rooms_joinCode_key" ON "exercise_rooms"("joinCode");

CREATE INDEX IF NOT EXISTS "exercise_rooms_ownerUserId_idx" ON "exercise_rooms"("ownerUserId");

CREATE TABLE IF NOT EXISTS "room_participants" (
  "id" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "room_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "room_participants_tokenHash_key" ON "room_participants"("tokenHash");

CREATE INDEX IF NOT EXISTS "room_participants_roomId_idx" ON "room_participants"("roomId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercise_rooms_ownerUserId_fkey') THEN
    ALTER TABLE "exercise_rooms" ADD CONSTRAINT "exercise_rooms_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_participants_roomId_fkey') THEN
    ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "exercise_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
