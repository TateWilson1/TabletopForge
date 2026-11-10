// Integration tests against a real PostgreSQL database.
// Run with: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/ttf_test npm test
// The target database's public schema is dropped and recreated. Never point this at real data.

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import pg from "pg";
import { buildLibrarySimulation } from "../src/sim/library.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe("TabletopForge API", { skip: TEST_DATABASE_URL ? false : "TEST_DATABASE_URL is not set" }, () => {
  let server;
  let baseUrl;
  let app;
  let pool;
  let resetRateLimits;

  async function api(method, path, { token, roomToken, body, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(roomToken ? { "x-room-token": roomToken } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => ({})), headers: response.headers };
  }

  let userCounter = 0;
  async function createUser() {
    userCounter += 1;
    const email = `user${userCounter}-${Date.now()}@example.com`;
    const code = (await api("POST", "/api/auth/request-code", { body: { email } })).data.loginCode;
    const registered = await api("POST", "/api/auth/password-register", { body: { email, code, password: "correct horse battery" } });
    assert.equal(registered.status, 200);
    return { email, token: registered.data.token, id: registered.data.user.id };
  }

  const sampleExercise = (organization = "Acme Clinic") => ({
    id: "local-1",
    overview: { organization, industry: "Healthcare", scenario: "Ransomware", maturityLevel: "Basic" },
    scenarioSummary: "Summary",
  });

  before(async () => {
    const admin = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    await admin.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await admin.end();

    Object.assign(process.env, {
      DATABASE_URL: TEST_DATABASE_URL,
      TABLETOPFORGE_AUTH_SECRET: "test-secret",
      TABLETOPFORGE_AUTH_DELIVERY_MODE: "screen",
      TABLETOPFORGE_ALLOW_SCREEN_CODES: "true",
      TABLETOPFORGE_AI_FEATURE_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
      STRIPE_SECRET_KEY: "sk_test_placeholder",
    });
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.WEBSITE_SITE_NAME;

    const module = await import("../src/server.js");
    ({ resetRateLimits } = await import("../src/security.js"));
    app = module.app;
    pool = module.pool;
    await module.ensureSaasSchema();
    await module.ensureSaasSchema(); // bootstrap must be idempotent
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await pool?.end();
  });

  beforeEach(() => {
    resetRateLimits();
    app.locals.openai = null;
  });

  test("health reports a bootstrapped database and sends security headers", async () => {
    const { status, data, headers } = await api("GET", "/health?deep=1");
    assert.equal(status, 200);
    assert.equal(data.databaseBootstrap.ok, true, data.databaseBootstrap.error);
    assert.equal(data.database.ok, true);
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("x-powered-by"), null);
  });

  test("unknown routes and malformed JSON return JSON errors without stack traces", async () => {
    assert.equal((await api("GET", "/nope")).status, 404);
    const response = await fetch(`${baseUrl}/api/auth/password-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(await response.json()), ["error"]);
  });

  test("register, sign in, sign out", async () => {
    const user = await createUser();
    const me = await api("GET", "/api/me", { token: user.token });
    assert.equal(me.data.user.email, user.email);
    assert.equal(me.data.entitlements.freeGenerationsRemaining, 1);
    assert.equal(me.data.entitlements.maxRoomParticipants, 5);

    assert.equal((await api("POST", "/api/auth/password-login", { body: { email: user.email, password: "wrong password!" } })).status, 401);
    const login = await api("POST", "/api/auth/password-login", { body: { email: user.email, password: "correct horse battery" } });
    assert.equal(login.status, 200);

    await api("POST", "/api/auth/logout", { token: login.data.token });
    assert.equal((await api("GET", "/api/me", { token: login.data.token })).status, 401);
    assert.equal((await api("GET", "/api/me")).status, 401);
  });

  test("a login code dies after five wrong guesses", async () => {
    const email = `bruteforce-${Date.now()}@example.com`;
    const code = (await api("POST", "/api/auth/request-code", { body: { email } })).data.loginCode;
    const wrong = code === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await api("POST", "/api/auth/verify-code", { body: { email, code: wrong } })).status, 401);
    }
    assert.equal((await api("POST", "/api/auth/verify-code", { body: { email, code } })).status, 401, "correct code must be rejected after lockout");
  });

  test("auth endpoints are rate limited per email", async () => {
    const email = `limited-${Date.now()}@example.com`;
    const statuses = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      statuses.push((await api("POST", "/api/auth/request-code", { body: { email } })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
    assert.equal(statuses[6], 429);
  });

  test("one free generation, then payment required; stored tabletops are private to their owner", async () => {
    const user = await createUser();
    const other = await createUser();
    const first = await api("POST", "/api/tabletops/generate", { token: user.token, body: { exercise: sampleExercise(), options: {} } });
    assert.equal(first.status, 200);
    assert.equal(first.data.entitlements.canGenerate, false);

    const second = await api("POST", "/api/tabletops/generate", { token: user.token, body: { exercise: sampleExercise(), options: {} } });
    assert.equal(second.status, 402);
    assert.equal(second.data.code, "PAYMENT_REQUIRED");

    const fetched = await api("GET", `/api/tabletops/${first.data.tabletopId}`, { token: user.token });
    assert.equal(fetched.data.exercise.overview.organization, "Acme Clinic");
    assert.equal((await api("GET", `/api/tabletops/${first.data.tabletopId}`, { token: other.token })).status, 404);
    assert.equal((await api("GET", "/api/tabletops/not-a-uuid", { token: user.token })).status, 404);
  });

  test("unsigned Stripe webhooks are rejected in production", async () => {
    const user = await createUser();
    const event = { id: `evt_${Date.now()}`, type: "checkout.session.completed", data: { object: { id: "cs_1", metadata: { userId: user.id, purchaseType: "tabletop" } } } };

    process.env.WEBSITE_SITE_NAME = "tabletopforge-api";
    try {
      assert.equal((await api("POST", "/api/billing/stripe-webhook", { body: event })).status, 400);
    } finally {
      delete process.env.WEBSITE_SITE_NAME;
    }
    assert.equal((await api("GET", "/api/me", { token: user.token })).data.user.generationCredits, 0);

    // Local development without a webhook secret still works, and replays are ignored.
    assert.equal((await api("POST", "/api/billing/stripe-webhook", { body: event })).status, 200);
    assert.equal((await api("POST", "/api/billing/stripe-webhook", { body: event })).status, 200);
    assert.equal((await api("GET", "/api/me", { token: user.token })).data.user.generationCredits, 1);
  });

  test("AI generation attaches an AI simulation, falls back to the library, and never double-spends", async () => {
    const baseExercise = {
      purpose: "p", scenarioSummary: "s", objectives: ["o"], suggestedParticipants: ["IT Lead"], discussionQuestions: ["q"],
      gapDiscoveryQuestions: ["g"], expectedDecisions: ["d"], facilitatorNotes: ["n"], executiveSummary: "e",
      irpAnalysis: { sourceName: "", wordCount: 0, overallSummary: "", strengths: [], findings: [] },
      starterIrpTemplate: { generatedBecause: "", sections: [], missingInputs: [], nextSteps: [] },
      lessonsLearnedTemplate: [],
    };
    const options = { organizationName: "Harbor Clinic", industry: "Healthcare", organizationSize: "26-100", scenarioType: "Ransomware", maturityLevel: "Basic", exerciseDuration: "60 minutes" };
    const aiSim = buildLibrarySimulation(options);
    aiSim.title = "AI-authored outbreak";

    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = [];
    app.locals.openai = {
      responses: {
        async create(parameters) {
          calls.push(parameters.text.format.name);
          if (parameters.text.format.name === "tabletop_exercise") {
            await gate;
            return { output_text: JSON.stringify(baseExercise), usage: { input_tokens: 10, output_tokens: 20 } };
          }
          return { output_text: JSON.stringify(aiSim), usage: { input_tokens: 5, output_tokens: 7 } };
        },
      },
    };

    const user = await createUser();
    const firstRequest = api("POST", "/api/tabletops/generate-ai", { token: user.token, body: { options } });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const concurrent = await api("POST", "/api/tabletops/generate-ai", { token: user.token, body: { options } });
    assert.equal(concurrent.status, 409, "parallel generation must not share one credit");
    release();
    const first = await firstRequest;
    assert.equal(first.status, 200);
    assert.equal(first.data.exercise.simulation.source, "ai");
    assert.equal(first.data.exercise.simulation.title, "AI-authored outbreak");
    assert.deepEqual(calls, ["tabletop_exercise", "tabletop_simulation"]);
    assert.equal((await api("POST", "/api/tabletops/generate-ai", { token: user.token, body: { options } })).status, 402);

    // Simulation call fails: the paid generation still succeeds with the curated library simulation.
    const second = await createUser();
    app.locals.openai = {
      responses: {
        async create(parameters) {
          if (parameters.text.format.name === "tabletop_exercise") {
            return { output_text: JSON.stringify(baseExercise), usage: {} };
          }
          throw new Error("model overloaded");
        },
      },
    };
    const fallback = await api("POST", "/api/tabletops/generate-ai", { token: second.token, body: { options } });
    assert.equal(fallback.status, 200);
    assert.equal(fallback.data.exercise.simulation.source, "library");
    assert.ok(fallback.data.exercise.simulation.injects.length >= 5);
  });

  test("live room: create, join, role-restricted views, voting, authority, report", async () => {
    const facilitator = await createUser();
    const stranger = await createUser();
    const simulation = buildLibrarySimulation({ organizationName: "Harbor Clinic", scenarioType: "Ransomware", industry: "Healthcare", exerciseDuration: "30 minutes" });

    assert.equal((await api("POST", "/api/rooms", { body: { simulation } })).status, 401);
    assert.equal((await api("POST", "/api/rooms", { token: facilitator.token, body: { simulation: { nope: true } } })).status, 400);

    const created = await api("POST", "/api/rooms", { token: facilitator.token, body: { simulation, facilitatorName: "Dana" } });
    assert.equal(created.status, 201);
    const { id: roomId, joinCode } = created.data.room;
    assert.match(joinCode, /^[A-Z2-9]{6}$/);
    assert.equal(created.data.view.status, "lobby");

    const lookup = await api("GET", `/api/rooms/lookup?code=${joinCode.toLowerCase()}`);
    assert.equal(lookup.data.organization, "Harbor Clinic");
    assert.equal(lookup.data.roles.length, simulation.roles.length);
    assert.equal((await api("GET", "/api/rooms/lookup?code=ZZZZZZ")).status, 404);

    const it = await api("POST", "/api/rooms/join", { body: { code: joinCode, name: "Ivy", roleId: "it" } });
    const comms = await api("POST", "/api/rooms/join", { body: { code: joinCode, name: "Cam", roleId: "comms" } });
    assert.equal(it.status, 201);
    assert.equal((await api("POST", "/api/rooms/join", { body: { code: joinCode, name: "" } })).status, 400);

    // Access control.
    assert.equal((await api("GET", `/api/rooms/${roomId}/state`)).status, 401);
    assert.equal((await api("GET", `/api/rooms/${roomId}/state`, { token: stranger.token })).status, 403);
    assert.equal((await api("GET", `/api/rooms/${roomId}/state`, { roomToken: "rm_forged" })).status, 401);
    assert.equal((await api("POST", `/api/rooms/${roomId}/actions`, { roomToken: it.data.participantToken, body: { action: { type: "start" } } })).status, 403);

    const started = await api("POST", `/api/rooms/${roomId}/actions`, { token: facilitator.token, body: { action: { type: "start" } } });
    assert.equal(started.data.view.status, "running");
    const version = started.data.version;

    // Polling: unchanged fast path, then role-specific views.
    const unchanged = await api("GET", `/api/rooms/${roomId}/state?v=${version}`, { roomToken: it.data.participantToken });
    assert.deepEqual(unchanged.data, { version, unchanged: true });
    const itView = (await api("GET", `/api/rooms/${roomId}/state`, { roomToken: it.data.participantToken })).data.view;
    const commsView = (await api("GET", `/api/rooms/${roomId}/state`, { roomToken: comms.data.participantToken })).data.view;
    assert.equal(itView.feed[0].canRead, true);
    assert.equal(commsView.feed[0].canRead, false);
    assert.ok(!JSON.stringify(commsView).includes("lockd"), "restricted inject must not leak to other roles");
    assert.ok(!JSON.stringify(itView).includes('"quality"'), "option quality must not leak before commit");

    // Concurrent votes must both land.
    const inject = itView.feed[0];
    const [optionA, optionB] = inject.decision.options;
    const votes = await Promise.all([
      api("POST", `/api/rooms/${roomId}/actions`, { roomToken: it.data.participantToken, body: { action: { type: "vote", injectId: inject.id, optionId: optionA.id, rationale: "Stop the spread." } } }),
      api("POST", `/api/rooms/${roomId}/actions`, { roomToken: comms.data.participantToken, body: { action: { type: "vote", injectId: inject.id, optionId: optionB.id } } }),
    ]);
    assert.deepEqual(votes.map((vote) => vote.status), [200, 200]);

    // Comms does not own this decision; IT does.
    assert.equal((await api("POST", `/api/rooms/${roomId}/actions`, { roomToken: comms.data.participantToken, body: { action: { type: "commit", injectId: inject.id } } })).status, 403);
    const committed = await api("POST", `/api/rooms/${roomId}/actions`, { roomToken: it.data.participantToken, body: { action: { type: "commit", injectId: inject.id } } });
    assert.equal(committed.status, 200);
    assert.equal(committed.data.view.feed[0].decision.outcome.optionId, optionA.id, "owner's vote breaks the tie");
    assert.equal(committed.data.view.feed[0].decision.outcome.committedBy, "Ivy");

    assert.equal((await api("GET", `/api/rooms/${roomId}/report`, { token: facilitator.token })).status, 409);

    // Facilitator drives the rest of the exercise.
    let view = (await api("POST", `/api/rooms/${roomId}/actions`, { token: facilitator.token, body: { action: { type: "note", kind: "gap", text: "No printed call tree." } } })).data.view;
    for (let guard = 0; guard < 40 && view.status === "running"; guard += 1) {
      const open = view.feed.find((item) => item.id === view.openDecisionId);
      const action = open
        ? { type: "commit", injectId: open.id, optionId: open.decision.options.find((option) => option.quality === "strong").id }
        : view.canAdvance ? { type: "advance" } : { type: "end" };
      view = (await api("POST", `/api/rooms/${roomId}/actions`, { token: facilitator.token, body: { action } })).data.view;
    }
    assert.equal(view.status, "ended");

    const report = await api("GET", `/api/rooms/${roomId}/report`, { roomToken: comms.data.participantToken });
    assert.equal(report.status, 200);
    assert.equal(report.data.report.exercise.organization, "Harbor Clinic");
    assert.ok(report.data.report.overall.score > 0);
    assert.equal(report.data.report.participants.length, 2);
    assert.ok(report.data.report.findings.some((finding) => finding.title === "No printed call tree."));
    assert.match(report.data.markdown, /# After-Action Report/);

    assert.equal((await api("POST", "/api/rooms/join", { body: { code: joinCode, name: "Late" } })).status, 409);

    const list = await api("GET", "/api/rooms", { token: facilitator.token });
    assert.equal(list.data.rooms[0].id, roomId);
    assert.equal(list.data.rooms[0].participantCount, 2);
    assert.equal(typeof list.data.rooms[0].score, "number");
    assert.equal((await api("GET", "/api/rooms", { token: stranger.token })).data.rooms.length, 0);

    assert.equal((await api("DELETE", `/api/rooms/${roomId}`, { token: stranger.token })).status, 404);
    assert.equal((await api("DELETE", `/api/rooms/${roomId}`, { token: facilitator.token })).status, 200);
    assert.equal((await api("GET", `/api/rooms/${roomId}/state`, { token: facilitator.token })).status, 404);
  });

  test("rooms enforce the plan's participant limit", async () => {
    const facilitator = await createUser();
    const simulation = buildLibrarySimulation({ scenarioType: "Insider Threat" });
    const { room } = (await api("POST", "/api/rooms", { token: facilitator.token, body: { simulation } })).data;
    assert.equal(room.maxParticipants, 5);
    for (let seat = 0; seat < 5; seat += 1) {
      assert.equal((await api("POST", "/api/rooms/join", { body: { code: room.joinCode, name: `P${seat}` } })).status, 201);
    }
    const overflow = await api("POST", "/api/rooms/join", { body: { code: room.joinCode, name: "One too many" } });
    assert.equal(overflow.status, 409);
    assert.equal(overflow.data.code, "ROOM_FULL");
  });

  test("AI curveball and narrative are facilitator-only, capped, and logged", async () => {
    const facilitator = await createUser();
    const simulation = buildLibrarySimulation({ scenarioType: "Ransomware", exerciseDuration: "30 minutes" });
    const { room } = (await api("POST", "/api/rooms", { token: facilitator.token, body: { simulation } })).data;
    const seat = await api("POST", "/api/rooms/join", { body: { code: room.joinCode, name: "Ivy", roleId: "it" } });
    await api("POST", `/api/rooms/${room.id}/actions`, { token: facilitator.token, body: { action: { type: "start" } } });

    app.locals.openai = {
      responses: {
        async create(parameters) {
          const name = parameters.text.format.name;
          if (name === "tabletop_curveball") {
            return { output_text: JSON.stringify({ channel: "phone", sender: "Insurer", title: "Insurer hotline calls back", body: "They need a policy number.", facilitatorNotes: ["Who has it?"] }), usage: { input_tokens: 1, output_tokens: 1 } };
          }
          return { output_text: JSON.stringify({ executiveSummary: "The team performed well.", whatWentWell: ["Fast escalation"], keyRisks: ["No call tree"], coachingNotes: ["Aligned quickly"], nextExercise: "Try BEC next." }), usage: {} };
        },
      },
    };

    assert.equal((await api("POST", `/api/rooms/${room.id}/curveball`, { roomToken: seat.data.participantToken, body: {} })).status, 403);
    // AI assists are a subscription feature.
    assert.equal((await api("POST", `/api/rooms/${room.id}/curveball`, { token: facilitator.token, body: {} })).status, 402);
    await pool.query(`UPDATE "users" SET "subscriptionStatus" = 'active', "billingPlan" = 'subscription' WHERE "id" = $1`, [facilitator.id]);
    assert.equal((await api("GET", "/api/me", { token: facilitator.token })).data.entitlements.maxRoomParticipants, 30);
    const curveball = await api("POST", `/api/rooms/${room.id}/curveball`, { token: facilitator.token, body: { hint: "insurance" } });
    assert.equal(curveball.status, 200);
    assert.equal(curveball.data.view.feed.at(-1).title, "Insurer hotline calls back");
    assert.equal(curveball.data.view.feed.at(-1).custom, true);

    assert.equal((await api("POST", `/api/rooms/${room.id}/report/narrative`, { token: facilitator.token })).status, 409);
    const first = curveball.data.view.feed[0];
    await api("POST", `/api/rooms/${room.id}/actions`, { token: facilitator.token, body: { action: { type: "skipDecision", injectId: first.id } } });
    await api("POST", `/api/rooms/${room.id}/actions`, { token: facilitator.token, body: { action: { type: "end" } } });
    const narrative = await api("POST", `/api/rooms/${room.id}/report/narrative`, { token: facilitator.token });
    assert.equal(narrative.status, 200);
    assert.equal(narrative.data.report.narrative.executiveSummary, "The team performed well.");
    assert.match(narrative.data.markdown, /The team performed well\./);

    const runs = await pool.query(`SELECT "promptType", "status" FROM "ai_runs" WHERE "userId" = $1 ORDER BY "createdAt"`, [facilitator.id]);
    assert.deepEqual(runs.rows.map((row) => row.promptType), ["room_curveball", "room_report_narrative"]);

    await pool.query(`UPDATE "exercise_rooms" SET "aiCalls" = 8 WHERE "id" = $1`, [room.id]);
    assert.equal((await api("POST", `/api/rooms/${room.id}/report/narrative`, { token: facilitator.token })).status, 429);
  });
});
