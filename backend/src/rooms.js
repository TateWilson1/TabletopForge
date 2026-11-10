// Live exercise rooms: multi-user, role-based simulations with an authoritative server state.
//
// Transport is deliberately boring: clients poll a cheap versioned endpoint. It needs no sticky
// sessions, websockets, or extra infrastructure, works across instances, and a room of 30 people
// costs a handful of primary-key lookups per second.

import crypto from "node:crypto";
import { SimError, applyAction, buildView, createInitialState, normalizeSimulation } from "./sim/engine.js";
import { buildAfterActionReport, buildReportMarkdown } from "./sim/report.js";
import {
  CURVEBALL_SYSTEM_PROMPT,
  NARRATIVE_SYSTEM_PROMPT,
  buildCurveballPrompt,
  buildNarrativePrompt,
  curveballSchema,
  narrativeSchema,
  parseNarrative,
} from "./sim/ai.js";
import { rateLimit } from "./security.js";

const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_JOIN_DAYS = 14;
const PARTICIPANT_ACTIONS = new Set(["vote", "commit", "note", "setRole"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROOM_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "exercise_rooms" (
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
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "exercise_rooms_joinCode_key" ON "exercise_rooms"("joinCode")`,
  `CREATE INDEX IF NOT EXISTS "exercise_rooms_ownerUserId_idx" ON "exercise_rooms"("ownerUserId")`,
  `CREATE TABLE IF NOT EXISTS "room_participants" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_participants_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "room_participants_tokenHash_key" ON "room_participants"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "room_participants_roomId_idx" ON "room_participants"("roomId")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercise_rooms_ownerUserId_fkey') THEN
      ALTER TABLE "exercise_rooms" ADD CONSTRAINT "exercise_rooms_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_participants_roomId_fkey') THEN
      ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "exercise_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
];

export function registerRoomRoutes(app, deps) {
  const { getPool, authenticateRequest, hashSecret, getBearerToken, getRoomParticipantLimit, ai } = deps;

  const createLimiter = rateLimit("room-create", { limit: 20, windowMs: 60 * 60 * 1000 });
  const joinLimiter = rateLimit("room-join", { limit: 40, windowMs: 10 * 60 * 1000 });
  const pollLimiter = rateLimit("room-poll", { limit: 240, windowMs: 60 * 1000, keyFn: actorKey });
  const actionLimiter = rateLimit("room-action", { limit: 90, windowMs: 60 * 1000, keyFn: actorKey });
  const aiLimiter = rateLimit("room-ai", { limit: 20, windowMs: 60 * 60 * 1000, keyFn: actorKey });

  function actorKey(request) {
    const token = request.get("x-room-token") || getBearerToken(request);
    return token ? crypto.createHash("sha256").update(token).digest("hex").slice(0, 24) : "";
  }

  const route = (handler) => async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode === 500) {
        console.error("Room request failed", error);
      }
      response.status(statusCode).json({ error: statusCode === 500 ? "Request failed." : error.message, code: error.code });
    }
  };

  const fail = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

  function requirePool() {
    const pool = getPool();
    if (!pool) {
      throw fail(503, "DATABASE_URL is not configured.");
    }
    return pool;
  }

  function requireRoomId(request) {
    if (!UUID_PATTERN.test(request.params.id)) {
      throw fail(404, "Exercise room not found.");
    }
    return request.params.id;
  }

  // Works out who is calling: the facilitator (account session) or a participant (room token).
  async function resolveViewer(request, room) {
    const roomToken = request.get("x-room-token");
    if (roomToken) {
      const result = await requirePool().query(
        `SELECT "id" FROM "room_participants" WHERE "tokenHash" = $1 AND "roomId" = $2 LIMIT 1`,
        [hashSecret(`room:${roomToken}`), room.id],
      );
      if (result.rowCount === 0) {
        throw fail(401, "Your seat in this exercise is no longer valid. Rejoin with the room code.");
      }
      return { kind: "participant", id: result.rows[0].id };
    }

    const session = await authenticateRequest(request);
    if (session.user.id !== room.ownerUserId) {
      throw fail(403, "Only the facilitator who created this room can do that.");
    }
    return { kind: "facilitator", userId: session.user.id };
  }

  async function loadRoom(roomId, client = requirePool(), { forUpdate = false } = {}) {
    const result = await client.query(
      `SELECT "id", "joinCode", "ownerUserId", "title", "status", "simulationJson", "stateJson", "reportJson",
              "version", "maxParticipants", "aiCalls", "createdAt"
       FROM "exercise_rooms" WHERE "id" = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
      [roomId],
    );
    if (result.rowCount === 0) {
      throw fail(404, "Exercise room not found.");
    }
    return result.rows[0];
  }

  // Applies one reducer action under a row lock so concurrent votes never clobber each other.
  async function mutateRoom(roomId, mutate) {
    const client = await requirePool().connect();
    try {
      await client.query("BEGIN");
      const room = await loadRoom(roomId, client, { forUpdate: true });
      const outcome = await mutate(room, client);
      const state = outcome.state;
      const report = state.status === "ended" && !room.reportJson
        ? buildAfterActionReport(room.simulationJson, state, { exerciseId: room.id })
        : room.reportJson;
      const updated = await client.query(
        `UPDATE "exercise_rooms"
         SET "stateJson" = $2, "status" = $3, "reportJson" = $4, "version" = "version" + 1, "updatedAt" = NOW(),
             "endedAt" = CASE WHEN $3 = 'ended' AND "endedAt" IS NULL THEN NOW() ELSE "endedAt" END
         WHERE "id" = $1
         RETURNING "version"`,
        [roomId, JSON.stringify(state), state.status, report ? JSON.stringify(report) : null],
      );
      await client.query("COMMIT");
      return { room: { ...room, stateJson: state, reportJson: report, status: state.status, version: updated.rows[0].version }, extra: outcome.extra };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error instanceof SimError ? fail(error.statusCode, error.message) : error;
    } finally {
      client.release();
    }
  }

  function roomSummary(room) {
    return { id: room.id, joinCode: room.joinCode, title: room.title, status: room.status, maxParticipants: room.maxParticipants };
  }

  function respondWithView(response, room, viewer) {
    response.json({
      room: roomSummary(room),
      version: room.version,
      view: buildView(room.simulationJson, room.stateJson, viewer),
    });
  }

  // --- create / list / delete ----------------------------------------------

  app.post(
    "/api/rooms",
    createLimiter,
    route(async (request, response) => {
      const session = await authenticateRequest(request);
      let simulation;
      try {
        simulation = normalizeSimulation(request.body?.simulation);
      } catch (error) {
        throw fail(400, error.message);
      }

      const facilitatorName =
        typeof request.body?.facilitatorName === "string" && request.body.facilitatorName.trim()
          ? request.body.facilitatorName.trim().slice(0, 60)
          : "Facilitator";
      const tabletopId = UUID_PATTERN.test(request.body?.tabletopId ?? "") ? request.body.tabletopId : null;
      const state = createInitialState(simulation, { facilitatorName });
      const maxParticipants = await getRoomParticipantLimit(session.user);
      const pool = requirePool();

      // A tabletop id is only linked when it belongs to the caller.
      const owned = tabletopId
        ? await pool.query(`SELECT 1 FROM "tabletops" WHERE "id" = $1 AND "userId" = $2`, [tabletopId, session.user.id])
        : { rowCount: 0 };

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const roomId = crypto.randomUUID();
        const joinCode = Array.from({ length: 6 }, () => JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)]).join("");
        const inserted = await pool.query(
          `INSERT INTO "exercise_rooms" ("id", "joinCode", "ownerUserId", "tabletopId", "title", "simulationJson", "stateJson", "maxParticipants")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT ("joinCode") DO NOTHING
           RETURNING "id"`,
          [roomId, joinCode, session.user.id, owned.rowCount ? tabletopId : null, simulation.title, JSON.stringify(simulation), JSON.stringify(state), maxParticipants],
        );
        if (inserted.rowCount > 0) {
          const room = await loadRoom(roomId);
          response.status(201);
          respondWithView(response, room, { kind: "facilitator" });
          return;
        }
      }
      throw fail(503, "Could not allocate a room code. Try again.");
    }),
  );

  app.get(
    "/api/rooms",
    route(async (request, response) => {
      const session = await authenticateRequest(request);
      const result = await requirePool().query(
        `SELECT "id", "joinCode", "title", "status", "createdAt", "endedAt",
                "reportJson"->'overall'->>'score' AS "score",
                "reportJson"->'overall'->>'tier' AS "tier",
                "simulationJson"->>'scenarioType' AS "scenarioType",
                "simulationJson"->>'organization' AS "organization",
                (SELECT COUNT(*)::int FROM "room_participants" p WHERE p."roomId" = r."id") AS "participantCount"
         FROM "exercise_rooms" r
         WHERE "ownerUserId" = $1
         ORDER BY "createdAt" DESC
         LIMIT 50`,
        [session.user.id],
      );
      response.json({
        rooms: result.rows.map((row) => ({ ...row, score: row.score === null ? null : Number(row.score) })),
      });
    }),
  );

  app.delete(
    "/api/rooms/:id",
    route(async (request, response) => {
      const session = await authenticateRequest(request);
      const result = await requirePool().query(`DELETE FROM "exercise_rooms" WHERE "id" = $1 AND "ownerUserId" = $2`, [
        requireRoomId(request),
        session.user.id,
      ]);
      if (result.rowCount === 0) {
        throw fail(404, "Exercise room not found.");
      }
      response.json({ ok: true });
    }),
  );

  // --- join ------------------------------------------------------------------

  async function findRoomByCode(rawCode, client = requirePool(), lock = "") {
    const code = typeof rawCode === "string" ? rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : "";
    if (code.length !== 6) {
      throw fail(400, "Enter the 6-character room code.");
    }
    const result = await client.query(
      `SELECT "id", "joinCode", "ownerUserId", "title", "status", "simulationJson", "stateJson", "reportJson", "version", "maxParticipants", "createdAt"
       FROM "exercise_rooms"
       WHERE "joinCode" = $1 AND "createdAt" > NOW() - INTERVAL '${ROOM_JOIN_DAYS} days' ${lock}`,
      [code],
    );
    if (result.rowCount === 0) {
      throw fail(404, "No exercise found for that code. Check it with your facilitator.");
    }
    return result.rows[0];
  }

  app.get(
    "/api/rooms/lookup",
    joinLimiter,
    route(async (request, response) => {
      const room = await findRoomByCode(request.query.code);
      const sim = room.simulationJson;
      const taken = Object.values(room.stateJson.participants ?? {});
      response.json({
        room: roomSummary(room),
        organization: sim.organization,
        scenarioType: sim.scenarioType,
        facilitatorName: room.stateJson.facilitatorName,
        roles: sim.roles.map((role) => ({ ...role, takenBy: taken.filter((participant) => participant.roleId === role.id).map((participant) => participant.name) })),
        full: taken.length >= room.maxParticipants,
      });
    }),
  );

  app.post(
    "/api/rooms/join",
    joinLimiter,
    route(async (request, response) => {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const room = await findRoomByCode(request.body?.code, client, "FOR UPDATE");
        if (room.status === "ended") {
          throw fail(409, "This exercise has already ended.");
        }
        if (Object.keys(room.stateJson.participants ?? {}).length >= room.maxParticipants) {
          throw fail(409, `This exercise is full (${room.maxParticipants} participants on the facilitator's plan).`, "ROOM_FULL");
        }

        const participantId = crypto.randomUUID();
        const token = `rm_${crypto.randomBytes(24).toString("base64url")}`;
        const viewer = { kind: "participant", id: participantId };
        const state = applyAction(room.simulationJson, room.stateJson, { type: "join", name: request.body?.name, roleId: request.body?.roleId }, viewer);

        await client.query(`INSERT INTO "room_participants" ("id", "roomId", "tokenHash") VALUES ($1, $2, $3)`, [
          participantId,
          room.id,
          hashSecret(`room:${token}`),
        ]);
        const updated = await client.query(
          `UPDATE "exercise_rooms" SET "stateJson" = $2, "version" = "version" + 1, "updatedAt" = NOW() WHERE "id" = $1 RETURNING "version"`,
          [room.id, JSON.stringify(state)],
        );
        await client.query("COMMIT");

        response.status(201).json({
          room: roomSummary(room),
          participantToken: token,
          version: updated.rows[0].version,
          view: buildView(room.simulationJson, state, viewer),
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error instanceof SimError ? fail(error.statusCode, error.message) : error;
      } finally {
        client.release();
      }
    }),
  );

  // --- live state ------------------------------------------------------------

  app.get(
    "/api/rooms/:id/state",
    pollLimiter,
    route(async (request, response) => {
      const roomId = requireRoomId(request);
      const knownVersion = Number.parseInt(request.query.v, 10);

      // Fast path: nothing changed since the client's last poll.
      if (Number.isFinite(knownVersion)) {
        const head = await requirePool().query(`SELECT "version", "ownerUserId" FROM "exercise_rooms" WHERE "id" = $1`, [roomId]);
        if (head.rowCount === 0) {
          throw fail(404, "Exercise room not found.");
        }
        if (head.rows[0].version === knownVersion) {
          await resolveViewer(request, { id: roomId, ownerUserId: head.rows[0].ownerUserId });
          response.json({ version: knownVersion, unchanged: true });
          return;
        }
      }

      const room = await loadRoom(roomId);
      const viewer = await resolveViewer(request, room);
      respondWithView(response, room, viewer);
    }),
  );

  app.post(
    "/api/rooms/:id/actions",
    actionLimiter,
    route(async (request, response) => {
      const roomId = requireRoomId(request);
      const action = request.body?.action;
      if (!action || typeof action.type !== "string" || action.type === "join") {
        throw fail(400, "A valid action is required.");
      }

      const head = await loadRoom(roomId);
      const viewer = await resolveViewer(request, head);
      if (viewer.kind === "participant" && !PARTICIPANT_ACTIONS.has(action.type)) {
        throw fail(403, "Only the facilitator can do that.");
      }

      const { room } = await mutateRoom(roomId, (locked) => ({
        state: applyAction(locked.simulationJson, locked.stateJson, action, viewer),
      }));

      if (action.type === "removeParticipant" && UUID_PATTERN.test(action.participantId ?? "")) {
        await requirePool().query(`DELETE FROM "room_participants" WHERE "id" = $1 AND "roomId" = $2`, [action.participantId, roomId]);
      }

      respondWithView(response, room, viewer);
    }),
  );

  // --- after-action report ---------------------------------------------------

  app.get(
    "/api/rooms/:id/report",
    route(async (request, response) => {
      const room = await loadRoom(requireRoomId(request));
      await resolveViewer(request, room);
      if (!room.reportJson) {
        throw fail(409, "The after-action report is available once the facilitator ends the exercise.");
      }
      response.json({ room: roomSummary(room), report: room.reportJson, markdown: buildReportMarkdown(room.reportJson) });
    }),
  );

  // --- AI assists (facilitator only, capped per room) ------------------------

  async function reserveAiCall(request, promptType) {
    const roomId = requireRoomId(request);
    const configError = ai.validateConfig();
    if (configError) {
      throw fail(503, configError, "AI_UNAVAILABLE");
    }
    const head = await loadRoom(roomId);
    const viewer = await resolveViewer(request, head);
    if (viewer.kind !== "facilitator") {
      throw fail(403, "Only the facilitator can use AI assists.");
    }
    if (!ai.consumeDailyRequest()) {
      throw fail(429, "Daily AI request limit reached.");
    }
    const reserved = await requirePool().query(
      `UPDATE "exercise_rooms" SET "aiCalls" = "aiCalls" + 1 WHERE "id" = $1 AND "aiCalls" < $2 RETURNING "aiCalls"`,
      [roomId, ai.maxCallsPerRoom],
    );
    if (reserved.rowCount === 0) {
      throw fail(429, `This exercise has used its ${ai.maxCallsPerRoom} AI assists.`);
    }
    return { roomId, viewer, room: head, promptType };
  }

  async function runAi({ viewer, promptType }, system, payload, schemaName, schema) {
    try {
      const result = await ai.complete({ system, payload, schemaName, schema });
      // Usage logging must never cost the facilitator a result they already paid for.
      await ai
        .recordRun({ userId: viewer.userId, promptType, status: "completed", model: result.model, usage: result.usage })
        .catch((error) => console.error("Could not record AI run", error));
      return result.outputText;
    } catch (error) {
      console.error(`AI ${promptType} failed`, error);
      await ai.recordRun({ userId: viewer.userId, promptType, status: "failed", errorMessage: String(error?.message ?? error).slice(0, 300) }).catch(() => {});
      throw fail(502, "The AI assist failed. The exercise is unaffected — try again or continue without it.");
    }
  }

  app.post(
    "/api/rooms/:id/curveball",
    aiLimiter,
    route(async (request, response) => {
      const context = await reserveAiCall(request, "room_curveball");
      const view = buildView(context.room.simulationJson, context.room.stateJson, { kind: "facilitator" });
      if (view.status !== "running") {
        throw fail(409, "Curveballs can only be added while the exercise is running.");
      }
      const outputText = await runAi(context, CURVEBALL_SYSTEM_PROMPT, buildCurveballPrompt(view, request.body?.hint), "tabletop_curveball", curveballSchema);
      const inject = JSON.parse(outputText);
      const { room } = await mutateRoom(context.roomId, (locked) => ({
        state: applyAction(locked.simulationJson, locked.stateJson, { type: "curveball", inject }, { kind: "facilitator" }),
      }));
      respondWithView(response, room, { kind: "facilitator" });
    }),
  );

  app.post(
    "/api/rooms/:id/report/narrative",
    aiLimiter,
    route(async (request, response) => {
      const context = await reserveAiCall(request, "room_report_narrative");
      if (!context.room.reportJson) {
        throw fail(409, "End the exercise before generating the AI narrative.");
      }
      const outputText = await runAi(context, NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(context.room.reportJson), "after_action_narrative", narrativeSchema);
      const report = { ...context.room.reportJson, narrative: parseNarrative(outputText) };
      await requirePool().query(`UPDATE "exercise_rooms" SET "reportJson" = $2, "updatedAt" = NOW() WHERE "id" = $1`, [
        context.roomId,
        JSON.stringify(report),
      ]);
      response.json({ report, markdown: buildReportMarkdown(report) });
    }),
  );
}
