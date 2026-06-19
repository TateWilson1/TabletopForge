import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import pg from "pg";
import Stripe from "stripe";

const { Pool } = pg;

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://tatewilson1.github.io",
  "http://localhost:3000",
  "http://localhost:3001",
];
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const SESSION_DAYS = 30;
const LOGIN_CODE_MINUTES = 15;
const DEFAULT_SUBSCRIPTION_MONTHLY_LIMIT = 10;

const app = express();
const port = Number(process.env.PORT || 3000);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
    })
  : null;

const dailyUsage = {
  day: getCurrentDay(),
  count: 0,
};
let databaseBootstrapStatus = {
  attempted: false,
  ok: false,
  error: "",
};

app.post("/api/billing/stripe-webhook", express.raw({ type: "application/json" }), async (request, response) => {
  try {
    const event = buildStripeEvent(request);
    const isNewEvent = await recordBillingEvent(event);
    if (isNewEvent) {
      await handleStripeEvent(event);
    }
    response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook failed", error);
    response.status(400).json({ error: "Stripe webhook failed." });
  }
});

app.use(express.json({ limit: "512kb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || getAllowedOrigins().includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS."));
    },
    allowedHeaders: ["Content-Type", "Authorization", "x-tabletopforge-ai-access-code"],
  }),
);

app.get("/health", async (request, response) => {
  const includeDeepCheck = request.query.deep === "1";
  const database = includeDeepCheck ? await checkDatabaseHealth() : undefined;

  response.json({
    ok: true,
    service: "tabletopforge-backend",
    databaseConfigured: Boolean(pool),
    database,
    databaseBootstrap: databaseBootstrapStatus,
    stripeConfigured: Boolean(stripe),
    aiFeatureEnabled: isAiFeatureEnabled(),
    authDeliveryMode: getAuthDeliveryMode(),
  });
});

app.post("/api/auth/request-code", async (request, response) => {
  try {
    requireDatabase();
    const email = normalizeEmail(request.body?.email);
    if (!email) {
      response.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    const user = await ensureUser(email);
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + LOGIN_CODE_MINUTES * 60 * 1000);

    await dbQuery(
      `INSERT INTO "login_codes" ("id", "email", "userId", "codeHash", "expiresAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), email, user.id, hashSecret(`${email}:${code}`), expiresAt],
    );

    const deliveryMode = getAuthDeliveryMode();
    await deliverLoginCode(email, code, deliveryMode);

    response.json({
      ok: true,
      deliveryMode,
      expiresAt: expiresAt.toISOString(),
      loginCode: shouldReturnScreenLoginCode(deliveryMode) ? code : undefined,
      message:
        shouldReturnScreenLoginCode(deliveryMode)
          ? "Temporary setup mode is showing the login code on screen."
          : "If this email exists, a login code will be sent.",
    });
  } catch (error) {
    sendApiError(response, error, "Could not start sign in.");
  }
});

app.post("/api/auth/verify-code", async (request, response) => {
  try {
    requireDatabase();
    const email = normalizeEmail(request.body?.email);
    const code = typeof request.body?.code === "string" ? request.body.code.trim() : "";

    if (!email || !code) {
      response.status(400).json({ error: "Email and code are required." });
      return;
    }

    const loginCode = await findUsableLoginCode(email);
    if (!loginCode || loginCode.codeHash !== hashSecret(`${email}:${code}`)) {
      response.status(401).json({ error: "Invalid or expired login code." });
      return;
    }

    const user = await ensureUser(email);
    await dbQuery(`UPDATE "login_codes" SET "usedAt" = NOW() WHERE "id" = $1`, [loginCode.id]);

    const session = await createSession(user.id);
    const signedInUser = await getUserById(user.id);
    response.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      ...(await buildAccountPayload(signedInUser)),
    });
  } catch (error) {
    sendApiError(response, error, "Could not verify sign in.");
  }
});

app.post("/api/auth/password-register", async (request, response) => {
  try {
    requireDatabase();
    const email = normalizeEmail(request.body?.email);
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const code = typeof request.body?.code === "string" ? request.body.code.trim() : "";

    if (!email || !isValidPassword(password) || !code) {
      response.status(400).json({ error: "Enter a valid email, verification code, and a password with at least 10 characters." });
      return;
    }

    const existing = await getUserPasswordRecord(email);
    if (existing?.passwordHash) {
      response.status(409).json({ error: "This account already has a password. Sign in instead." });
      return;
    }

    const loginCode = await findUsableLoginCode(email);
    if (!loginCode || loginCode.codeHash !== hashSecret(`${email}:${code}`)) {
      response.status(401).json({ error: "Invalid or expired verification code." });
      return;
    }

    const user = existing ? await getUserById(existing.id) : await ensureUser(email);
    const passwordRecord = hashPassword(password);
    await dbQuery(
      `UPDATE "users"
       SET "passwordHash" = $1, "passwordSalt" = $2, "passwordIterations" = $3, "updatedAt" = NOW()
       WHERE "id" = $4`,
      [passwordRecord.hash, passwordRecord.salt, passwordRecord.iterations, user.id],
    );
    await dbQuery(`UPDATE "login_codes" SET "usedAt" = NOW() WHERE "id" = $1`, [loginCode.id]);

    const session = await createSession(user.id);
    const signedInUser = await getUserById(user.id);
    response.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      ...(await buildAccountPayload(signedInUser)),
    });
  } catch (error) {
    sendApiError(response, error, "Could not create account.");
  }
});

app.post("/api/auth/password-login", async (request, response) => {
  try {
    requireDatabase();
    const email = normalizeEmail(request.body?.email);
    const password = typeof request.body?.password === "string" ? request.body.password : "";

    if (!email || !password) {
      response.status(400).json({ error: "Email and password are required." });
      return;
    }

    const user = await getUserPasswordRecord(email);
    if (!user?.passwordHash || !verifyPassword(password, user)) {
      response.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const session = await createSession(user.id);
    const signedInUser = await getUserById(user.id);
    response.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      ...(await buildAccountPayload(signedInUser)),
    });
  } catch (error) {
    sendApiError(response, error, "Could not sign in.");
  }
});

app.post("/api/auth/logout", async (request, response) => {
  try {
    const token = getBearerToken(request);
    if (token && pool) {
      await dbQuery(`UPDATE "auth_sessions" SET "revokedAt" = NOW() WHERE "tokenHash" = $1`, [hashSecret(token)]);
    }

    response.json({ ok: true });
  } catch (error) {
    sendApiError(response, error, "Could not sign out.");
  }
});

app.get("/api/me", async (request, response) => {
  try {
    const session = await authenticateRequest(request);
    response.json(await buildAccountPayload(session.user));
  } catch (error) {
    sendAuthError(response, error);
  }
});

app.get("/api/entitlements", async (request, response) => {
  try {
    const session = await authenticateRequest(request);
    const usage = await getUserUsageSummary(session.user.id);
    response.json({
      ...(await buildAccountPayload(session.user)),
      usage,
    });
  } catch (error) {
    sendAuthError(response, error);
  }
});

app.get("/api/admin/overview", async (request, response) => {
  try {
    await authenticateAdminRequest(request);
    const [
      userStats,
      tabletopStats,
      usageStats,
      aiStats,
      recentUsers,
      recentTabletops,
      recentBillingEvents,
      recentAiRuns,
    ] = await Promise.all([
      dbQuery(`SELECT COUNT(*)::int AS "totalUsers" FROM "users"`),
      dbQuery(`SELECT COUNT(*)::int AS "totalTabletops" FROM "tabletops" WHERE "deletedAt" IS NULL`),
      dbQuery(
        `SELECT
           COUNT(*)::int AS "totalGenerations",
           COUNT(*) FILTER (WHERE "createdAt" >= date_trunc('month', NOW()))::int AS "generationsThisMonth"
         FROM "generation_usages"`,
      ),
      dbQuery(
        `SELECT
           COUNT(*)::int AS "totalAiRuns",
           COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failedAiRuns",
           COALESCE(SUM("inputTokens"), 0)::int AS "inputTokens",
           COALESCE(SUM("outputTokens"), 0)::int AS "outputTokens"
         FROM "ai_runs"`,
      ),
      dbQuery(
        `SELECT "id", "email", "freeGenerationsRemaining", "generationCredits", "billingPlan", "subscriptionStatus", "createdAt", "updatedAt"
         FROM "users"
         ORDER BY "createdAt" DESC
         LIMIT 8`,
      ),
      dbQuery(
        `SELECT t."id", t."title", t."industry", t."scenarioType", t."maturityLevel", t."generationSource", t."createdAt", u."email"
         FROM "tabletops" t
         LEFT JOIN "users" u ON u."id" = t."userId"
         WHERE t."deletedAt" IS NULL
         ORDER BY t."createdAt" DESC
         LIMIT 8`,
      ),
      dbQuery(
        `SELECT "id", "eventType", "createdAt"
         FROM "billing_events"
         ORDER BY "createdAt" DESC
         LIMIT 8`,
      ),
      dbQuery(
        `SELECT "id", "model", "promptType", "status", "inputTokens", "outputTokens", "errorMessage", "createdAt"
         FROM "ai_runs"
         ORDER BY "createdAt" DESC
         LIMIT 8`,
      ),
    ]);

    response.json({
      stats: {
        ...userStats.rows[0],
        ...tabletopStats.rows[0],
        ...usageStats.rows[0],
        ...aiStats.rows[0],
        stripeConfigured: Boolean(stripe),
        aiFeatureEnabled: isAiFeatureEnabled(),
        databaseBootstrap: databaseBootstrapStatus,
      },
      recentUsers: recentUsers.rows,
      recentTabletops: recentTabletops.rows,
      recentBillingEvents: recentBillingEvents.rows,
      recentAiRuns: recentAiRuns.rows,
    });
  } catch (error) {
    sendAuthError(response, error);
  }
});

app.get("/api/admin/users", async (request, response) => {
  try {
    await authenticateAdminRequest(request);
    const result = await dbQuery(
      `SELECT
         u."id", u."email", u."freeGenerationsRemaining", u."generationCredits",
         u."billingPlan", u."subscriptionStatus", u."createdAt", u."updatedAt",
         COUNT(DISTINCT t."id")::int AS "tabletopCount",
         COUNT(DISTINCT gu."id")::int AS "generationCount"
       FROM "users" u
       LEFT JOIN "tabletops" t ON t."userId" = u."id" AND t."deletedAt" IS NULL
       LEFT JOIN "generation_usages" gu ON gu."userId" = u."id"
       GROUP BY u."id"
       ORDER BY u."createdAt" DESC
       LIMIT 100`,
    );

    response.json({ users: result.rows });
  } catch (error) {
    sendAuthError(response, error);
  }
});

app.post("/api/admin/grant-credit", async (request, response) => {
  try {
    await authenticateAdminRequest(request);
    const email = normalizeEmail(request.body?.email);
    const credits = Number.parseInt(request.body?.credits, 10);

    if (!email) {
      response.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    if (!Number.isFinite(credits) || credits < 1 || credits > 50) {
      response.status(400).json({ error: "Credits must be between 1 and 50." });
      return;
    }

    const user = await ensureUser(email);
    await dbQuery(
      `UPDATE "users"
       SET "generationCredits" = "generationCredits" + $1, "updatedAt" = NOW()
       WHERE "id" = $2`,
      [credits, user.id],
    );
    await dbQuery(
      `INSERT INTO "paid_credit_ledger" ("id", "userId", "delta", "reason")
       VALUES ($1, $2, $3, 'admin_grant')`,
      [crypto.randomUUID(), user.id, credits],
    );

    response.json({ ok: true, user: publicUser(await getUserById(user.id)) });
  } catch (error) {
    sendAuthError(response, error);
  }
});

app.post("/api/admin/reset-free-generation", async (request, response) => {
  try {
    await authenticateAdminRequest(request);
    const email = normalizeEmail(request.body?.email);

    if (!email) {
      response.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    const user = await ensureUser(email);
    await dbQuery(
      `UPDATE "users"
       SET "freeGenerationsRemaining" = 1, "updatedAt" = NOW()
       WHERE "id" = $1`,
      [user.id],
    );

    response.json({ ok: true, user: publicUser(await getUserById(user.id)) });
  } catch (error) {
    sendAuthError(response, error);
  }
});

app.get("/api/tabletops", async (request, response) => {
  try {
    const session = await authenticateRequest(request);
    const result = await dbQuery(
      `SELECT "id", "title", "status", "generationSource", "industry", "scenarioType", "maturityLevel", "createdAt", "updatedAt"
       FROM "tabletops"
       WHERE "userId" = $1 AND "deletedAt" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      [session.user.id],
    );

    response.json({
      tabletops: result.rows.map((tabletop) => ({
        id: tabletop.id,
        title: tabletop.title,
        status: tabletop.status,
        generationSource: tabletop.generationSource,
        industry: tabletop.industry,
        scenarioType: tabletop.scenarioType,
        maturityLevel: tabletop.maturityLevel,
        createdAt: tabletop.createdAt,
        updatedAt: tabletop.updatedAt,
      })),
    });
  } catch (error) {
    sendAuthError(response, error);
  }
});

app.post("/api/tabletops/generate", async (request, response) => {
  try {
    const session = await authenticateRequest(request);
    const exercise = sanitizeExercisePayload(request.body?.exercise);
    if (!exercise) {
      response.status(400).json({ error: "Generated tabletop package is required." });
      return;
    }

    const options = request.body?.options && typeof request.body.options === "object" ? request.body.options : {};
    const title = buildTabletopTitle(exercise, options);
    const tabletop = await consumeGenerationEntitlement(session.user.id, {
      title,
      generationSource: exercise ? "local_template" : "server_ai",
      exercise,
      metadata: {
        industry: asLimitedString(exercise?.overview?.industry || options.industry, 120),
        scenarioType: asLimitedString(exercise?.overview?.scenario || options.scenarioType, 160),
        maturityLevel: asLimitedString(exercise?.overview?.maturityLevel || options.maturityLevel, 80),
      },
    });
    const user = await getUserById(session.user.id);

    response.json({
      tabletopId: tabletop.id,
      exercise,
      ...(await buildAccountPayload(user)),
    });
  } catch (error) {
    if (error.statusCode === 402) {
      response.status(402).json({ error: error.message, code: "PAYMENT_REQUIRED" });
      return;
    }

    sendAuthError(response, error);
  }
});

app.post("/api/tabletops/generate-ai", async (request, response) => {
  try {
    const session = await authenticateRequest(request);
    const configError = validateAiConfig();
    if (configError) {
      response.status(503).json({ error: configError, code: "AI_UNAVAILABLE" });
      return;
    }

    if (!consumeDailyRequest()) {
      response.status(429).json({ error: "Daily AI request limit reached." });
      return;
    }

    const options = sanitizeAiGenerationOptions(request.body?.options);
    if (!options) {
      response.status(400).json({ error: "Valid tabletop generation options are required." });
      return;
    }

    await assertGenerationEntitlement(session.user.id);

    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const generatedAt = new Date().toISOString();
    const aiResponse = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are TabletopForge, an expert cybersecurity tabletop exercise designer. Generate a complete, unique, realistic incident response tabletop exercise from the user's organization context, selected scenario, maturity level, duration, optional scenario details, participants, and IRP text. Make the exercise practical and facilitator-ready. Keep raw IRP text out of the final answer. Do not provide malware, exploit, credential theft, evasion, persistence, or harmful operational instructions.",
        },
        {
          role: "user",
          content: JSON.stringify(buildTabletopGenerationPrompt(options)),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tabletop_exercise",
          strict: true,
          schema: tabletopExerciseSchema,
        },
      },
    });

    let exercise = parseAiGeneratedExercise(aiResponse.output_text, options, generatedAt);
    const title = buildTabletopTitle(exercise, options);
    const tabletop = await consumeGenerationEntitlement(session.user.id, {
      title,
      generationSource: "server_ai",
      exercise,
      metadata: {
        industry: exercise.overview.industry,
        scenarioType: exercise.overview.scenario,
        maturityLevel: exercise.overview.maturityLevel,
      },
    });

    exercise = {
      ...exercise,
      id: tabletop.id,
      markdownReport: buildGeneratedExerciseMarkdown({ ...exercise, id: tabletop.id }),
    };

    await dbQuery(`UPDATE "tabletops" SET "exerciseJson" = $1, "updatedAt" = NOW() WHERE "id" = $2`, [exercise, tabletop.id]);
    await recordAiRun({
      tabletopId: tabletop.id,
      userId: session.user.id,
      model,
      promptType: "tabletop_generation",
      status: "completed",
      inputTokens: aiResponse.usage?.input_tokens ?? null,
      outputTokens: aiResponse.usage?.output_tokens ?? null,
      resultJson: {
        scenario: exercise.overview.scenario,
        maturityLevel: exercise.overview.maturityLevel,
        hasIrpAnalysis: Boolean(exercise.irpAnalysis),
      },
    });

    const user = await getUserById(session.user.id);
    response.json({
      tabletopId: tabletop.id,
      exercise,
      usage: {
        inputTokens: aiResponse.usage?.input_tokens ?? null,
        outputTokens: aiResponse.usage?.output_tokens ?? null,
      },
      ...(await buildAccountPayload(user)),
    });
  } catch (error) {
    if (error.statusCode === 402) {
      response.status(402).json({ error: error.message, code: "PAYMENT_REQUIRED" });
      return;
    }

    console.error("AI tabletop generation failed", error);
    sendAuthError(response, error);
  }
});

app.post("/api/tabletops/consume-generation", async (request, response) => {
  try {
    const session = await authenticateRequest(request);
    const title = asLimitedString(request.body?.title || request.body?.organization || "Untitled tabletop", 160);
    const tabletop = await consumeGenerationEntitlement(session.user.id, {
      title,
      generationSource: "local",
      exercise: null,
      metadata: {
        industry: asLimitedString(request.body?.industry, 120),
        scenarioType: asLimitedString(request.body?.scenarioType, 160),
        maturityLevel: asLimitedString(request.body?.maturityLevel, 80),
      },
    });
    const user = await getUserById(session.user.id);

    response.json({
      tabletopId: tabletop.id,
      ...(await buildAccountPayload(user)),
    });
  } catch (error) {
    if (error.statusCode === 402) {
      response.status(402).json({ error: error.message, code: "PAYMENT_REQUIRED" });
      return;
    }

    sendAuthError(response, error);
  }
});

app.post("/api/billing/create-checkout-session", async (request, response) => {
  try {
    const session = await authenticateRequest(request);
    if (!stripe) {
      response.status(503).json({ error: "Stripe is not configured yet." });
      return;
    }

    const purchaseType = request.body?.purchaseType === "subscription" ? "subscription" : "tabletop";
    const priceId = purchaseType === "subscription" ? process.env.STRIPE_PRICE_SUBSCRIPTION : process.env.STRIPE_PRICE_TABLETOP;
    if (!priceId) {
      response.status(503).json({ error: `Missing Stripe price for ${purchaseType}.` });
      return;
    }

    const customerId = await getOrCreateStripeCustomer(session.user);
    const appUrl = getPublicAppUrl(request);
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: purchaseType === "subscription" ? "subscription" : "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?checkout=success`,
      cancel_url: `${appUrl}/account?checkout=cancelled`,
      metadata: {
        userId: session.user.id,
        purchaseType,
      },
    });

    response.json({ url: checkoutSession.url });
  } catch (error) {
    sendAuthError(response, error);
  }
});

app.post("/api/ai/generate-inject", async (request, response) => {
  const configError = validateAiConfig();
  if (configError) {
    response.status(503).json({ error: configError });
    return;
  }

  const authContext = await authenticateAiRequest(request);
  if (!authContext.ok) {
    response.status(authContext.statusCode).json({ error: authContext.error });
    return;
  }

  if (!consumeDailyRequest()) {
    response.status(429).json({ error: "Daily AI request limit reached." });
    return;
  }

  const validationError = validateInjectRequest(request.body);
  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  try {
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const aiResponse = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are TabletopForge, a cybersecurity tabletop exercise facilitator. Generate one short, realistic scenario inject that evolves the discussion like a presentation slide reveal. Keep it digestible for live participants. Do not provide exploit steps, malware instructions, credential theft guidance, evasion guidance, or requests for secrets.",
        },
        {
          role: "user",
          content: JSON.stringify(buildPromptPayload(request.body)),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tabletop_inject",
          strict: true,
          schema: injectSchema,
        },
      },
    });

    const inject = normalizeInjectForReveal(parseInject(aiResponse.output_text), request.body?.exercise?.industry);

    response.json({
      model,
      inject,
      usage: {
        inputTokens: aiResponse.usage?.input_tokens ?? null,
        outputTokens: aiResponse.usage?.output_tokens ?? null,
      },
    });
  } catch (error) {
    console.error("AI inject generation failed", error);
    response.status(500).json({ error: "AI inject generation failed." });
  }
});

app.post("/api/ai/assist", async (request, response) => {
  const configError = validateAiConfig();
  if (configError) {
    response.status(503).json({ error: configError });
    return;
  }

  const authContext = await authenticateAiRequest(request);
  if (!authContext.ok) {
    response.status(authContext.statusCode).json({ error: authContext.error });
    return;
  }

  if (!consumeDailyRequest()) {
    response.status(429).json({ error: "Daily AI request limit reached." });
    return;
  }

  const validationError = validateAssistRequest(request.body);
  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  try {
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const aiResponse = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are TabletopForge, a calm cybersecurity tabletop exercise facilitator. Answer the user's exercise question using only the provided scenario, current step, notes, and IRP findings. If the IRP does not include the needed call tree, vendor list, authority, or evidence requirement, say that clearly and recommend a practical tabletop next step. Do not ask for secrets or provide exploit, malware, evasion, credential theft, or persistence instructions.",
        },
        {
          role: "user",
          content: JSON.stringify(buildAssistPromptPayload(request.body)),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tabletop_assistance",
          strict: true,
          schema: assistSchema,
        },
      },
    });

    response.json({
      model,
      ...parseAssist(aiResponse.output_text),
      usage: {
        inputTokens: aiResponse.usage?.input_tokens ?? null,
        outputTokens: aiResponse.usage?.output_tokens ?? null,
      },
    });
  } catch (error) {
    console.error("AI assistance failed", error);
    response.status(500).json({ error: "AI assistance failed." });
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found." });
});

await ensureSaasSchema();

app.listen(port, () => {
  console.log(`TabletopForge backend listening on port ${port}`);
});

const injectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["injectTitle", "injectText", "pressureLevel", "followUpQuestion", "expectedDecision"],
  properties: {
    injectTitle: { type: "string", description: "A short title for the scenario development." },
    injectText: {
      type: "string",
      description: "One short realistic event to reveal to tabletop participants. Use 2 to 3 sentences maximum.",
    },
    pressureLevel: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
      description: "How much pressure the inject should add.",
    },
    followUpQuestion: { type: "string", description: "The next question the website should ask the participants." },
    expectedDecision: { type: "string", description: "The decision the group should try to make after the inject." },
  },
};

const assistSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "irpFinding", "recommendedNextStep", "missingInfo"],
  properties: {
    answer: {
      type: "string",
      description: "A concise, actionable answer to the user's tabletop question.",
    },
    irpFinding: {
      type: "string",
      description: "What the IRP context supports or fails to support. Empty string if not relevant.",
    },
    recommendedNextStep: {
      type: "string",
      description: "The next facilitation step the group should take.",
    },
    missingInfo: {
      type: "array",
      items: { type: "string" },
      description: "Facts, owners, contacts, or plan details that are missing.",
    },
  },
};

const tabletopExerciseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "purpose",
    "scenarioSummary",
    "objectives",
    "suggestedParticipants",
    "discussionQuestions",
    "gapDiscoveryQuestions",
    "expectedDecisions",
    "facilitatorNotes",
    "executiveSummary",
    "irpAnalysis",
    "starterIrpTemplate",
    "lessonsLearnedTemplate",
  ],
  properties: {
    purpose: { type: "string" },
    scenarioSummary: { type: "string" },
    objectives: { type: "array", items: { type: "string" } },
    suggestedParticipants: { type: "array", items: { type: "string" } },
    discussionQuestions: { type: "array", items: { type: "string" } },
    gapDiscoveryQuestions: { type: "array", items: { type: "string" } },
    expectedDecisions: { type: "array", items: { type: "string" } },
    facilitatorNotes: { type: "array", items: { type: "string" } },
    executiveSummary: { type: "string" },
    irpAnalysis: {
      type: "object",
      additionalProperties: false,
      required: ["sourceName", "wordCount", "overallSummary", "strengths", "findings"],
      properties: {
        sourceName: { type: "string" },
        wordCount: { type: "number" },
        overallSummary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "status", "summary", "evidence", "tailoredQuestions", "improvement"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              status: { type: "string", enum: ["found", "weak", "missing"] },
              summary: { type: "string" },
              evidence: { type: "array", items: { type: "string" } },
              tailoredQuestions: { type: "array", items: { type: "string" } },
              improvement: { type: "string" },
            },
          },
        },
      },
    },
    starterIrpTemplate: {
      type: "object",
      additionalProperties: false,
      required: ["generatedBecause", "sections", "missingInputs", "nextSteps"],
      properties: {
        generatedBecause: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "purpose", "draftText", "fillIn"],
            properties: {
              title: { type: "string" },
              purpose: { type: "string" },
              draftText: { type: "string" },
              fillIn: { type: "array", items: { type: "string" } },
            },
          },
        },
        missingInputs: { type: "array", items: { type: "string" } },
        nextSteps: { type: "array", items: { type: "string" } },
      },
    },
    lessonsLearnedTemplate: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "owner", "dueDate", "priority"],
        properties: {
          prompt: { type: "string" },
          owner: { type: "string" },
          dueDate: { type: "string" },
          priority: { type: "string" },
        },
      },
    },
  },
};

async function authenticateAiRequest(request) {
  const bearerToken = getBearerToken(request);
  if (bearerToken) {
    try {
      const session = await authenticateRequest(request);
      return { ok: true, user: session.user };
    } catch {
      return { ok: false, statusCode: 401, error: "Invalid session." };
    }
  }

  if (isValidAccessCode(getRequestAccessCode(request))) {
    return { ok: true, user: null };
  }

  return { ok: false, statusCode: 401, error: "Sign in or provide a valid access code." };
}

async function authenticateRequest(request) {
  requireDatabase();
  const token = getBearerToken(request);
  if (!token) {
    const error = new Error("Sign in is required.");
    error.statusCode = 401;
    throw error;
  }

  const result = await dbQuery(
    `SELECT
       u."id", u."email", u."createdAt", u."updatedAt", u."freeGenerationsRemaining",
       u."generationCredits", u."billingPlan", u."subscriptionStatus", u."stripeCustomerId"
     FROM "auth_sessions" s
     INNER JOIN "users" u ON u."id" = s."userId"
     WHERE s."tokenHash" = $1 AND s."revokedAt" IS NULL AND s."expiresAt" > NOW()
     LIMIT 1`,
    [hashSecret(token)],
  );

  if (result.rowCount === 0) {
    const error = new Error("Session expired. Sign in again.");
    error.statusCode = 401;
    throw error;
  }

  return { user: result.rows[0] };
}

async function authenticateAdminRequest(request) {
  const session = await authenticateRequest(request);
  const adminEmails = getAdminEmails();

  if (adminEmails.length === 0) {
    const error = new Error("Admin access is not configured.");
    error.statusCode = 403;
    throw error;
  }

  if (!adminEmails.includes(normalizeEmail(session.user.email))) {
    const error = new Error("Admin access is required.");
    error.statusCode = 403;
    throw error;
  }

  return session;
}

function getAdminEmails() {
  return (process.env.TABLETOPFORGE_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

async function consumeGenerationEntitlement(userId, { title, generationSource, exercise, metadata = {} }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `SELECT "id", "freeGenerationsRemaining", "generationCredits", "subscriptionStatus"
       FROM "users"
       WHERE "id" = $1
       FOR UPDATE`,
      [userId],
    );

    if (userResult.rowCount === 0) {
      throw Object.assign(new Error("User not found."), { statusCode: 404 });
    }

    const user = userResult.rows[0];
    const hasSubscription = ACTIVE_SUBSCRIPTION_STATUSES.has(user.subscriptionStatus);
    const hasPurchasedCredit = user.generationCredits > 0;
    const hasFreeCredit = user.freeGenerationsRemaining > 0;
    let entitlementType = "subscription";

    if (hasSubscription) {
      const subscriptionLimit = getSubscriptionMonthlyLimit();
      const subscriptionUsage = await getSubscriptionUsageThisMonth(userId, client);
      if (subscriptionUsage >= subscriptionLimit) {
        throw Object.assign(
          new Error(`Your subscription has reached its monthly generation limit of ${subscriptionLimit}.`),
          { statusCode: 402 },
        );
      }
    }

    if (!hasSubscription && !hasPurchasedCredit && !hasFreeCredit) {
      throw Object.assign(new Error("You have used your free tabletop. Buy one tabletop or start a subscription to generate more."), {
        statusCode: 402,
      });
    }

    if (!hasSubscription && hasPurchasedCredit) {
      entitlementType = "paid_credit";
      await client.query(
        `UPDATE "users" SET "generationCredits" = "generationCredits" - 1, "updatedAt" = NOW() WHERE "id" = $1`,
        [userId],
      );
      await client.query(
        `INSERT INTO "paid_credit_ledger" ("id", "userId", "delta", "reason")
         VALUES ($1, $2, -1, 'generation_redeemed')`,
        [crypto.randomUUID(), userId],
      );
    } else if (!hasSubscription && hasFreeCredit) {
      entitlementType = "free";
      await client.query(
        `UPDATE "users" SET "freeGenerationsRemaining" = "freeGenerationsRemaining" - 1, "updatedAt" = NOW() WHERE "id" = $1`,
        [userId],
      );
    }

    const tabletopId = crypto.randomUUID();
    await client.query(
      `INSERT INTO "tabletops" (
         "id", "userId", "title", "status", "generationSource", "exerciseJson",
         "industry", "scenarioType", "maturityLevel", "updatedAt"
       )
       VALUES ($1, $2, $3, 'generated', $4, $5, $6, $7, $8, NOW())`,
      [
        tabletopId,
        userId,
        title || "Untitled tabletop",
        generationSource,
        exercise,
        metadata.industry || null,
        metadata.scenarioType || null,
        metadata.maturityLevel || null,
      ],
    );
    await client.query(
      `INSERT INTO "generation_usages" ("id", "userId", "tabletopId", "entitlementType")
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), userId, tabletopId, entitlementType],
    );

    await client.query("COMMIT");
    return { id: tabletopId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function assertGenerationEntitlement(userId) {
  const user = await getUserById(userId);
  const subscriptionGenerationsUsedThisMonth = await getSubscriptionUsageThisMonth(userId);
  const entitlements = buildEntitlements(user, subscriptionGenerationsUsedThisMonth);

  if (!entitlements.canGenerate) {
    throw Object.assign(new Error("You have used your free tabletop. Buy one tabletop or start a subscription to generate more."), {
      statusCode: 402,
    });
  }
}

async function ensureUser(email) {
  const existing = await dbQuery(
    `SELECT
       "id", "email", "createdAt", "updatedAt", "freeGenerationsRemaining",
       "generationCredits", "billingPlan", "subscriptionStatus", "stripeCustomerId"
     FROM "users"
     WHERE "email" = $1
     LIMIT 1`,
    [email],
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const inserted = await dbQuery(
    `INSERT INTO "users" ("id", "email", "updatedAt")
     VALUES ($1, $2, NOW())
     RETURNING "id", "email", "createdAt", "updatedAt", "freeGenerationsRemaining",
       "generationCredits", "billingPlan", "subscriptionStatus", "stripeCustomerId"`,
    [crypto.randomUUID(), email],
  );

  return inserted.rows[0];
}

async function getUserById(userId) {
  const result = await dbQuery(
    `SELECT
       "id", "email", "createdAt", "updatedAt", "freeGenerationsRemaining",
       "generationCredits", "billingPlan", "subscriptionStatus", "stripeCustomerId"
     FROM "users"
     WHERE "id" = $1
     LIMIT 1`,
    [userId],
  );

  if (result.rowCount === 0) {
    throw Object.assign(new Error("User not found."), { statusCode: 404 });
  }

  return result.rows[0];
}

async function getUserPasswordRecord(email) {
  const result = await dbQuery(
    `SELECT
       "id", "email", "passwordHash", "passwordSalt", "passwordIterations"
     FROM "users"
     WHERE "email" = $1
     LIMIT 1`,
    [email],
  );

  return result.rows[0] ?? null;
}

async function getUserUsageSummary(userId) {
  const result = await dbQuery(
    `SELECT "entitlementType", COUNT(*)::int AS "count"
     FROM "generation_usages"
     WHERE "userId" = $1
     GROUP BY "entitlementType"`,
    [userId],
  );

  return {
    totalGenerations: result.rows.reduce((total, row) => total + Number(row.count), 0),
    byEntitlement: result.rows.reduce((summary, row) => {
      summary[row.entitlementType] = Number(row.count);
      return summary;
    }, {}),
  };
}

async function getSubscriptionUsageThisMonth(userId, client = pool) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS "count"
     FROM "generation_usages"
     WHERE "userId" = $1
       AND "entitlementType" = 'subscription'
       AND "createdAt" >= date_trunc('month', NOW())`,
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function buildAccountPayload(user) {
  const subscriptionGenerationsUsedThisMonth = await getSubscriptionUsageThisMonth(user.id);
  return {
    user: publicUser(user),
    entitlements: buildEntitlements(user, subscriptionGenerationsUsedThisMonth),
  };
}

async function findUsableLoginCode(email) {
  const result = await dbQuery(
    `SELECT "id", "email", "userId", "codeHash", "expiresAt"
     FROM "login_codes"
     WHERE "email" = $1 AND "usedAt" IS NULL AND "expiresAt" > NOW()
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [email],
  );

  return result.rows[0] ?? null;
}

async function createSession(userId) {
  const token = `ttf_${crypto.randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await dbQuery(
    `INSERT INTO "auth_sessions" ("id", "userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), userId, hashSecret(token), expiresAt],
  );

  return { token, expiresAt };
}

async function getOrCreateStripeCustomer(user) {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });

  await dbQuery(`UPDATE "users" SET "stripeCustomerId" = $1, "updatedAt" = NOW() WHERE "id" = $2`, [
    customer.id,
    user.id,
  ]);

  return customer.id;
}

function buildStripeEvent(request) {
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return JSON.parse(request.body.toString("utf8"));
  }

  return stripe.webhooks.constructEvent(request.body, request.get("stripe-signature"), webhookSecret);
}

async function handleStripeEvent(event) {
  if (!pool) {
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const purchaseType = session.metadata?.purchaseType;
    if (!userId) {
      return;
    }

    if (purchaseType === "subscription") {
      await dbQuery(
        `UPDATE "users"
         SET "billingPlan" = 'subscription', "subscriptionStatus" = 'active', "stripeCustomerId" = COALESCE("stripeCustomerId", $2), "updatedAt" = NOW()
         WHERE "id" = $1`,
        [userId, session.customer],
      );
      await dbQuery(
        `INSERT INTO "subscriptions" ("id", "userId", "stripeSubscriptionId", "status", "updatedAt")
         VALUES ($1, $2, $3, 'active', NOW())
         ON CONFLICT ("stripeSubscriptionId") DO UPDATE
         SET "status" = 'active', "updatedAt" = NOW()`,
        [crypto.randomUUID(), userId, session.subscription || null],
      );
      return;
    }

    await dbQuery(
      `UPDATE "users"
       SET "generationCredits" = "generationCredits" + 1, "stripeCustomerId" = COALESCE("stripeCustomerId", $2), "updatedAt" = NOW()
       WHERE "id" = $1`,
      [userId, session.customer],
    );
    await dbQuery(
      `INSERT INTO "paid_credit_ledger" ("id", "userId", "delta", "reason", "stripeSessionId")
       VALUES ($1, $2, 1, 'stripe_checkout_completed', $3)`,
      [crypto.randomUUID(), userId, session.id || null],
    );
  }

  if (event.type?.startsWith("customer.subscription.")) {
    const subscription = event.data.object;
    await dbQuery(
      `UPDATE "users"
       SET "billingPlan" = CASE WHEN $2 = ANY($3::text[]) THEN 'subscription' ELSE 'free' END,
           "subscriptionStatus" = $2,
           "updatedAt" = NOW()
       WHERE "stripeCustomerId" = $1`,
      [subscription.customer, subscription.status, Array.from(ACTIVE_SUBSCRIPTION_STATUSES)],
    );
    await dbQuery(
      `UPDATE "subscriptions"
       SET "status" = $2, "currentPeriodEnd" = $3, "canceledAt" = CASE WHEN $2 = 'canceled' THEN NOW() ELSE "canceledAt" END, "updatedAt" = NOW()
       WHERE "stripeSubscriptionId" = $1`,
      [
        subscription.id,
        subscription.status,
        subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
      ],
    );
  }
}

async function recordBillingEvent(event) {
  if (!pool) {
    return true;
  }

  const userId = event.data?.object?.metadata?.userId || null;
  const result = await dbQuery(
    `INSERT INTO "billing_events" ("id", "userId", "stripeEventId", "eventType", "payloadJson")
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ("stripeEventId") DO NOTHING
     RETURNING "id"`,
    [crypto.randomUUID(), userId, event.id || null, event.type || "unknown", event],
  );

  return result.rowCount > 0;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    freeGenerationsRemaining: Number(user.freeGenerationsRemaining ?? 0),
    generationCredits: Number(user.generationCredits ?? 0),
    billingPlan: user.billingPlan ?? "free",
    subscriptionStatus: user.subscriptionStatus ?? "none",
    createdAt: user.createdAt,
  };
}

function buildEntitlements(user, subscriptionGenerationsUsedThisMonth = 0) {
  const freeGenerationsRemaining = Number(user.freeGenerationsRemaining ?? 0);
  const generationCredits = Number(user.generationCredits ?? 0);
  const subscriptionStatus = user.subscriptionStatus ?? "none";
  const hasActiveSubscription = ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus);
  const subscriptionMonthlyLimit = getSubscriptionMonthlyLimit();
  const subscriptionGenerationsRemainingThisMonth = hasActiveSubscription
    ? Math.max(0, subscriptionMonthlyLimit - subscriptionGenerationsUsedThisMonth)
    : 0;

  return {
    canGenerate: subscriptionGenerationsRemainingThisMonth > 0 || generationCredits > 0 || freeGenerationsRemaining > 0,
    freeGenerationsRemaining,
    generationCredits,
    subscriptionMonthlyLimit,
    subscriptionGenerationsUsedThisMonth,
    subscriptionGenerationsRemainingThisMonth,
    subscriptionStatus,
    billingPlan: user.billingPlan ?? "free",
  };
}

function sanitizeExercisePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > 350_000) {
    const error = new Error("Generated tabletop package is too large to store.");
    error.statusCode = 400;
    throw error;
  }

  return JSON.parse(serialized);
}

function buildTabletopTitle(exercise, options) {
  const organization = asLimitedString(exercise?.overview?.organization || options.organizationName || options.organization, 120);
  return organization ? `${organization} Tabletop Exercise` : "Untitled tabletop";
}

async function dbQuery(sql, params = []) {
  requireDatabase();
  return pool.query(sql, params);
}

async function ensureSaasSchema() {
  if (!pool || process.env.TABLETOPFORGE_AUTO_MIGRATE === "false") {
    return;
  }

  databaseBootstrapStatus = { attempted: true, ok: false, error: "" };

  const statements = [
    `CREATE TABLE IF NOT EXISTS "users" (
      "id" UUID NOT NULL,
      "email" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "freeGenerationsRemaining" INTEGER NOT NULL DEFAULT 1,
      "generationCredits" INTEGER NOT NULL DEFAULT 0,
      "billingPlan" TEXT NOT NULL DEFAULT 'free',
      "subscriptionStatus" TEXT NOT NULL DEFAULT 'none',
      "stripeCustomerId" TEXT,
      "passwordHash" TEXT,
      "passwordSalt" TEXT,
      "passwordIterations" INTEGER,
      CONSTRAINT "users_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "tabletops" (
      "id" UUID NOT NULL,
      "userId" UUID,
      "title" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "generationSource" TEXT NOT NULL DEFAULT 'local',
      "exerciseJson" JSONB,
      "scenarioType" TEXT,
      "industry" TEXT,
      "maturityLevel" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deletedAt" TIMESTAMP(3),
      CONSTRAINT "tabletops_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "uploaded_files" (
      "id" UUID NOT NULL,
      "tabletopId" UUID NOT NULL,
      "blobContainer" TEXT NOT NULL,
      "blobPath" TEXT NOT NULL,
      "originalFilename" TEXT NOT NULL,
      "contentType" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deletedAt" TIMESTAMP(3),
      "deleteStatus" TEXT NOT NULL DEFAULT 'active',
      CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "ai_runs" (
      "id" UUID NOT NULL,
      "tabletopId" UUID NOT NULL,
      "userId" UUID,
      "model" TEXT NOT NULL,
      "promptType" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "inputTokens" INTEGER,
      "outputTokens" INTEGER,
      "costEstimateUsd" DECIMAL(10,6),
      "resultJson" JSONB,
      "errorMessage" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "deletion_logs" (
      "id" UUID NOT NULL,
      "tabletopId" UUID NOT NULL,
      "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL,
      "notes" TEXT,
      CONSTRAINT "deletion_logs_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email")`,
    `CREATE INDEX IF NOT EXISTS "tabletops_userId_idx" ON "tabletops"("userId")`,
    `CREATE INDEX IF NOT EXISTS "tabletops_status_idx" ON "tabletops"("status")`,
    `CREATE INDEX IF NOT EXISTS "tabletops_deletedAt_idx" ON "tabletops"("deletedAt")`,
    `CREATE INDEX IF NOT EXISTS "uploaded_files_tabletopId_idx" ON "uploaded_files"("tabletopId")`,
    `CREATE INDEX IF NOT EXISTS "uploaded_files_deleteStatus_idx" ON "uploaded_files"("deleteStatus")`,
    `CREATE INDEX IF NOT EXISTS "uploaded_files_deletedAt_idx" ON "uploaded_files"("deletedAt")`,
    `CREATE INDEX IF NOT EXISTS "ai_runs_tabletopId_idx" ON "ai_runs"("tabletopId")`,
    `CREATE INDEX IF NOT EXISTS "ai_runs_promptType_idx" ON "ai_runs"("promptType")`,
    `CREATE INDEX IF NOT EXISTS "ai_runs_status_idx" ON "ai_runs"("status")`,
    `CREATE INDEX IF NOT EXISTS "deletion_logs_tabletopId_idx" ON "deletion_logs"("tabletopId")`,
    `CREATE INDEX IF NOT EXISTS "deletion_logs_status_idx" ON "deletion_logs"("status")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tabletops_userId_fkey') THEN
        ALTER TABLE "tabletops" ADD CONSTRAINT "tabletops_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uploaded_files_tabletopId_fkey') THEN
        ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_tabletopId_fkey" FOREIGN KEY ("tabletopId") REFERENCES "tabletops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_runs_tabletopId_fkey') THEN
        ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tabletopId_fkey" FOREIGN KEY ("tabletopId") REFERENCES "tabletops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deletion_logs_tabletopId_fkey') THEN
        ALTER TABLE "deletion_logs" ADD CONSTRAINT "deletion_logs_tabletopId_fkey" FOREIGN KEY ("tabletopId") REFERENCES "tabletops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billingPlan" TEXT NOT NULL DEFAULT 'free'`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "freeGenerationsRemaining" INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "generationCredits" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordSalt" TEXT`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordIterations" INTEGER`,
    `ALTER TABLE "tabletops" ADD COLUMN IF NOT EXISTS "generationSource" TEXT NOT NULL DEFAULT 'local'`,
    `ALTER TABLE "tabletops" ADD COLUMN IF NOT EXISTS "exerciseJson" JSONB`,
    `ALTER TABLE "tabletops" ADD COLUMN IF NOT EXISTS "scenarioType" TEXT`,
    `ALTER TABLE "tabletops" ADD COLUMN IF NOT EXISTS "industry" TEXT`,
    `ALTER TABLE "tabletops" ADD COLUMN IF NOT EXISTS "maturityLevel" TEXT`,
    `ALTER TABLE "ai_runs" ADD COLUMN IF NOT EXISTS "userId" UUID`,
    `CREATE TABLE IF NOT EXISTS "auth_sessions" (
      "id" UUID NOT NULL,
      "userId" UUID NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "revokedAt" TIMESTAMP(3),
      CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "login_codes" (
      "id" UUID NOT NULL,
      "email" TEXT NOT NULL,
      "userId" UUID,
      "codeHash" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "usedAt" TIMESTAMP(3),
      CONSTRAINT "login_codes_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "billing_events" (
      "id" UUID NOT NULL,
      "userId" UUID,
      "stripeEventId" TEXT,
      "eventType" TEXT NOT NULL,
      "payloadJson" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "generation_usages" (
      "id" UUID NOT NULL,
      "userId" UUID NOT NULL,
      "tabletopId" UUID,
      "entitlementType" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "generation_usages_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "paid_credit_ledger" (
      "id" UUID NOT NULL,
      "userId" UUID NOT NULL,
      "delta" INTEGER NOT NULL,
      "reason" TEXT NOT NULL,
      "stripeSessionId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "paid_credit_ledger_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "subscriptions" (
      "id" UUID NOT NULL,
      "userId" UUID NOT NULL,
      "provider" TEXT NOT NULL DEFAULT 'stripe',
      "stripeSubscriptionId" TEXT,
      "status" TEXT NOT NULL,
      "currentPeriodEnd" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "canceledAt" TIMESTAMP(3),
      CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "users_stripeCustomerId_key" ON "users"("stripeCustomerId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash")`,
    `CREATE INDEX IF NOT EXISTS "auth_sessions_userId_idx" ON "auth_sessions"("userId")`,
    `CREATE INDEX IF NOT EXISTS "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt")`,
    `CREATE INDEX IF NOT EXISTS "auth_sessions_revokedAt_idx" ON "auth_sessions"("revokedAt")`,
    `CREATE INDEX IF NOT EXISTS "login_codes_email_idx" ON "login_codes"("email")`,
    `CREATE INDEX IF NOT EXISTS "login_codes_userId_idx" ON "login_codes"("userId")`,
    `CREATE INDEX IF NOT EXISTS "login_codes_expiresAt_idx" ON "login_codes"("expiresAt")`,
    `CREATE INDEX IF NOT EXISTS "login_codes_usedAt_idx" ON "login_codes"("usedAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "billing_events_stripeEventId_key" ON "billing_events"("stripeEventId")`,
    `CREATE INDEX IF NOT EXISTS "billing_events_userId_idx" ON "billing_events"("userId")`,
    `CREATE INDEX IF NOT EXISTS "billing_events_eventType_idx" ON "billing_events"("eventType")`,
    `CREATE INDEX IF NOT EXISTS "generation_usages_userId_idx" ON "generation_usages"("userId")`,
    `CREATE INDEX IF NOT EXISTS "generation_usages_tabletopId_idx" ON "generation_usages"("tabletopId")`,
    `CREATE INDEX IF NOT EXISTS "generation_usages_entitlementType_idx" ON "generation_usages"("entitlementType")`,
    `CREATE INDEX IF NOT EXISTS "paid_credit_ledger_userId_idx" ON "paid_credit_ledger"("userId")`,
    `CREATE INDEX IF NOT EXISTS "paid_credit_ledger_reason_idx" ON "paid_credit_ledger"("reason")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId")`,
    `CREATE INDEX IF NOT EXISTS "subscriptions_userId_idx" ON "subscriptions"("userId")`,
    `CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status")`,
    `CREATE INDEX IF NOT EXISTS "ai_runs_userId_idx" ON "ai_runs"("userId")`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_userId_fkey') THEN
        ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'login_codes_userId_fkey') THEN
        ALTER TABLE "login_codes" ADD CONSTRAINT "login_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_runs_userId_fkey') THEN
        ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_events_userId_fkey') THEN
        ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generation_usages_userId_fkey') THEN
        ALTER TABLE "generation_usages" ADD CONSTRAINT "generation_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generation_usages_tabletopId_fkey') THEN
        ALTER TABLE "generation_usages" ADD CONSTRAINT "generation_usages_tabletopId_fkey" FOREIGN KEY ("tabletopId") REFERENCES "tabletops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paid_credit_ledger_userId_fkey') THEN
        ALTER TABLE "paid_credit_ledger" ADD CONSTRAINT "paid_credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_userId_fkey') THEN
        ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
  ];

  try {
    for (const statement of statements) {
      await pool.query(statement);
    }
    databaseBootstrapStatus = { attempted: true, ok: true, error: "" };
  } catch (error) {
    databaseBootstrapStatus = { attempted: true, ok: false, error: getSafeErrorMessage(error) };
    console.error("Database bootstrap failed. Account endpoints may be unavailable until migrations run.", error);
  }
}

async function checkDatabaseHealth() {
  if (!pool) {
    return { ok: false, error: "DATABASE_URL is not configured." };
  }

  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getSafeErrorMessage(error) };
  }
}

function requireDatabase() {
  if (!pool) {
    const error = new Error("DATABASE_URL is not configured.");
    error.statusCode = 503;
    throw error;
  }
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    return "";
  }

  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function getBearerToken(request) {
  const header = request.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : "";
}

function hashSecret(value) {
  const key = process.env.TABLETOPFORGE_AUTH_SECRET || process.env.OPENAI_API_KEY || process.env.TABLETOPFORGE_AI_ACCESS_CODE || "dev-only";
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 10 && password.length <= 256;
}

function hashPassword(password) {
  const iterations = 210_000;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return { hash, salt, iterations };
}

function verifyPassword(password, user) {
  if (!user?.passwordHash || !user.passwordSalt || !user.passwordIterations) {
    return false;
  }

  const candidate = crypto
    .pbkdf2Sync(password, user.passwordSalt, Number(user.passwordIterations), 32, "sha256")
    .toString("hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(candidate, "hex");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function getAllowedOrigins() {
  return (process.env.TABLETOPFORGE_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getPublicAppUrl(request) {
  const configuredUrl = process.env.PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const origin = request.get("origin")?.replace(/\/$/, "");
  if (origin === "https://tatewilson1.github.io") {
    return `${origin}/TabletopForge`;
  }

  return (origin || "https://tatewilson1.github.io/TabletopForge").replace(/\/$/, "");
}

function getAuthDeliveryMode() {
  if (process.env.TABLETOPFORGE_AUTH_DELIVERY_MODE === "screen" && allowScreenAuthCodes()) {
    return "screen";
  }

  if (!isHostedProduction() && process.env.TABLETOPFORGE_AUTH_DELIVERY_MODE !== "email") {
    return "screen";
  }

  return "email";
}

function isHostedProduction() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.WEBSITE_SITE_NAME);
}

function allowScreenAuthCodes() {
  return process.env.TABLETOPFORGE_ALLOW_SCREEN_CODES === "true";
}

function shouldReturnScreenLoginCode(deliveryMode) {
  return deliveryMode === "screen";
}

async function deliverLoginCode(email, code, deliveryMode) {
  if (deliveryMode === "screen") {
    return;
  }

  await sendLoginCodeEmail(email, code);
}

async function sendLoginCodeEmail(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.TABLETOPFORGE_AUTH_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw Object.assign(new Error("Email verification is not configured. Set RESEND_API_KEY and TABLETOPFORGE_AUTH_FROM_EMAIL."), {
      statusCode: 503,
    });
  }

  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: email,
      subject: "Your TabletopForge verification code",
      text: `Your TabletopForge verification code is ${code}. It expires in ${LOGIN_CODE_MINUTES} minutes.`,
      html: `<p>Your TabletopForge verification code is <strong>${code}</strong>.</p><p>It expires in ${LOGIN_CODE_MINUTES} minutes.</p>`,
    }),
  });

  if (!result.ok) {
    const detail = await result.text().catch(() => "");
    throw Object.assign(new Error(`Could not send verification email.${detail ? ` ${detail.slice(0, 180)}` : ""}`), {
      statusCode: 502,
    });
  }
}

function isAiFeatureEnabled() {
  return process.env.TABLETOPFORGE_AI_FEATURE_ENABLED === "true";
}

function getSubscriptionMonthlyLimit() {
  const configuredLimit = Number.parseInt(process.env.TABLETOPFORGE_SUBSCRIPTION_MONTHLY_LIMIT || "", 10);
  return Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : DEFAULT_SUBSCRIPTION_MONTHLY_LIMIT;
}

function validateAiConfig() {
  if (!isAiFeatureEnabled()) {
    return "AI features are disabled until OpenAI billing and production controls are ready.";
  }

  if (!process.env.OPENAI_API_KEY) {
    return "OPENAI_API_KEY is not configured.";
  }

  if (!process.env.TABLETOPFORGE_AI_ACCESS_CODE && !pool) {
    return "Configure TABLETOPFORGE_AI_ACCESS_CODE or DATABASE_URL-backed user sessions.";
  }

  return "";
}

function getRequestAccessCode(request) {
  const headerCode = request.get("x-tabletopforge-ai-access-code");
  if (headerCode) {
    return headerCode;
  }

  return typeof request.body?.accessCode === "string" ? request.body.accessCode : "";
}

function isValidAccessCode(candidate) {
  const expected = process.env.TABLETOPFORGE_AI_ACCESS_CODE || "";
  if (!candidate || !expected || candidate.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

function consumeDailyRequest() {
  const currentDay = getCurrentDay();
  if (dailyUsage.day !== currentDay) {
    dailyUsage.day = currentDay;
    dailyUsage.count = 0;
  }

  const dailyLimit = Number.parseInt(process.env.TABLETOPFORGE_AI_DAILY_LIMIT || "50", 10);
  const safeLimit = Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : 50;

  if (dailyUsage.count >= safeLimit) {
    return false;
  }

  dailyUsage.count += 1;
  return true;
}

function getCurrentDay() {
  return new Date().toISOString().slice(0, 10);
}

function validateInjectRequest(body) {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object.";
  }

  if (!body.exercise || typeof body.exercise !== "object") {
    return "Request body must include exercise context.";
  }

  if (!body.currentStep || typeof body.currentStep !== "object") {
    return "Request body must include currentStep context.";
  }

  if (typeof body.currentStep.title !== "string" || body.currentStep.title.trim().length === 0) {
    return "currentStep.title is required.";
  }

  return "";
}

function validateAssistRequest(body) {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object.";
  }

  if (typeof body.question !== "string" || body.question.trim().length === 0) {
    return "question is required.";
  }

  if (!body.exercise || typeof body.exercise !== "object") {
    return "Request body must include exercise context.";
  }

  if (!body.currentStep || typeof body.currentStep !== "object") {
    return "Request body must include currentStep context.";
  }

  if (typeof body.currentStep.title !== "string" || body.currentStep.title.trim().length === 0) {
    return "currentStep.title is required.";
  }

  return "";
}

function sanitizeAiGenerationOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const organizationName = asLimitedString(value.organizationName, 120);
  const industry = asLimitedString(value.industry, 80);
  const organizationSize = asLimitedString(value.organizationSize, 40);
  const scenarioType = asLimitedString(value.scenarioType, 120);
  const maturityLevel = asLimitedString(value.maturityLevel, 40);
  const exerciseDuration = asLimitedString(value.exerciseDuration, 40);

  if (!organizationName || !industry || !organizationSize || !scenarioType || !maturityLevel || !exerciseDuration) {
    return null;
  }

  return {
    organizationName,
    industry,
    organizationSize,
    scenarioType,
    maturityLevel,
    exerciseDuration,
    includeExecutiveQuestions: value.includeExecutiveQuestions !== false,
    includeTechnicalQuestions: value.includeTechnicalQuestions === true,
    includeComplianceQuestions: value.includeComplianceQuestions !== false,
    includeLessonsLearned: value.includeLessonsLearned !== false,
    hasHumanFacilitator: false,
    customScenarioDetails: asLimitedString(value.customScenarioDetails, 2500),
    organizationStructure: asLimitedString(value.organizationStructure, 2500),
    noIrp: value.noIrp === true,
    irpText: asLimitedString(value.irpText, 40_000),
    irpFileName: asLimitedString(value.irpFileName, 200),
  };
}

function buildTabletopGenerationPrompt(options) {
  return {
    task: "Generate a complete TabletopForge incident response tabletop exercise package.",
    constraints: [
      "Make this unique to the exact organization context, scenario type, industry, organization size, maturity level, duration, optional details, and IRP text.",
      "Do not use generic hard-coded questions when a more specific question can be generated from the provided context.",
      "If IRP text is provided, identify strengths and gaps from the IRP and tailor questions, expected decisions, and scenario pressure toward those gaps.",
      "If IRP text includes a role/contact/command structure, use that structure. Do not invent role titles that are not listed in the IRP. If a role seems needed but is absent, call it out as a gap or ask who owns it.",
      "If a CFO, legal counsel, HR, communications, compliance, or other common role is not present in the IRP or supplied organizationStructure, do not name that role as a participant or decision owner.",
      "If noIrp is true, do not pretend an IRP exists. Build the exercise to help the user draft a starter incident response plan from decisions made during the tabletop.",
      "If noIrp is true and organizationStructure is provided, use only those supplied roles/teams when naming participants and owners.",
      "If noIrp is true, starterIrpTemplate must include practical draft sections for purpose/scope, roles/contact tree, severity/escalation, reporting, evidence preservation, containment/recovery, communications, and post-incident review.",
      "If noIrp is false, starterIrpTemplate should still be present but may contain empty arrays and a short generatedBecause note.",
      "Do not store, quote, or reproduce long raw IRP passages. Summarize plan coverage and use short evidence keywords only.",
      "For Basic maturity, write for non-technical participants with plain language, clear ownership, and handholding.",
      "For Intermediate maturity, mix business impact, ownership, escalation, containment, and moderate technical detail.",
      "For Advanced maturity, push hard on IRP gaps, evidence preservation, authority, legal/compliance decisions, communications approval, business continuity, and coordination pressure.",
      "For 1-25 organizations, emphasize thin staffing, backups, outside vendors, and decision coverage.",
      "For 1000+ organizations, emphasize enterprise command, regions, business units, vendors, legal, communications, and formal governance.",
      "If industry is MSP / IT Provider, the organization is the service provider for client companies. Do not invent a partner MSP or external MSP for them to call. Use affected clients, client account owners, upstream software vendors, RMM/PSA vendors, cyber insurer, legal, or cloud providers instead.",
      "Use optional scenario details as first-class facts when present.",
      "Return concise but complete content. Discussion and gap questions should be actionable, not academic.",
      "Do not provide malware, exploit, credential theft, evasion, persistence, or harmful operational instructions.",
      "Return only the required JSON object.",
    ],
    requestedOutputShape: {
      questionTargets: {
        discussionQuestions: "12 to 18 context-specific questions",
        gapDiscoveryQuestions: "8 to 14 IRP and process gap questions",
        expectedDecisions: "8 to 14 concrete decisions",
        objectives: "5 to 8 measurable objectives",
      },
    },
    options: {
      organizationName: options.organizationName,
      industry: options.industry,
      organizationSize: options.organizationSize,
      scenarioType: options.scenarioType,
      maturityLevel: options.maturityLevel,
      exerciseDuration: options.exerciseDuration,
      includeExecutiveQuestions: options.includeExecutiveQuestions,
      includeTechnicalQuestions: options.includeTechnicalQuestions,
      includeComplianceQuestions: options.includeComplianceQuestions,
      includeLessonsLearned: options.includeLessonsLearned,
      customScenarioDetails: options.customScenarioDetails,
      organizationStructure: options.organizationStructure,
      noIrp: options.noIrp,
      irpFileName: options.irpFileName,
      irpText: options.irpText,
    },
  };
}

function buildPromptPayload(body) {
  return {
    task: "Generate one new scenario inject for the current tabletop step.",
    constraints: [
      "Keep it realistic for the selected industry, organization size, maturity, and scenario.",
      "Use the IRP findings to pressure-test weak or missing plan areas when provided.",
      "For Basic maturity, use plain language and helpful handholding.",
      "For Intermediate maturity, mix practical business decisions with moderate technical context.",
      "For Advanced maturity, create sharper pressure around authority, evidence, legal/compliance, communications, and business continuity gaps.",
      "Reflect organization size: small teams have coverage and vendor-dependency problems, while enterprise teams have coordination and authority problems.",
      "Keep injectText to 2 or 3 sentences, 75 words maximum, and one clear new development.",
      "Do not include analysis, multiple branches, long evidence lists, or the full answer inside injectText.",
      "Put the next discussion prompt in followUpQuestion and the decision in expectedDecision instead of stuffing them into injectText.",
      "If currentStep.selectedDecision is provided, evolve the scenario as a consequence of that response path. Make the consequence realistic and educational, not punitive for every choice.",
      "If industry is MSP / IT Provider, the organization is the provider serving client companies. Do not say they contact an external MSP, partner MSP, or their MSP. Realistic parties are affected clients, client account owners, upstream software vendors, RMM/PSA vendors, cloud providers, legal, insurer, and internal service desk/escalation leads.",
      "Do not repeat prior injects.",
      "Do not provide malware, exploit, credential theft, evasion, or persistence instructions.",
      "Do not ask users to reveal passwords, secrets, API keys, private keys, tokens, or live credentials.",
      "Return only the required JSON object.",
    ],
    exercise: {
      organization: asShortString(body.exercise.organization),
      industry: asShortString(body.exercise.industry),
      organizationSize: asShortString(body.exercise.organizationSize),
      scenario: asShortString(body.exercise.scenario),
      maturityLevel: asShortString(body.exercise.maturityLevel),
      duration: asShortString(body.exercise.duration),
      summary: asLimitedString(body.exercise.summary, 2000),
      objectives: asStringArray(body.exercise.objectives, 12),
    },
    irpAnalysis: buildAssistIrpContext(body.irpAnalysis),
    currentStep: {
      title: asShortString(body.currentStep.title),
      knownFacts: asStringArray(body.currentStep.knownFacts, 12),
      unknowns: asStringArray(body.currentStep.unknowns, 12),
      decisions: asStringArray(body.currentStep.decisions, 12),
      selectedDecision: asLimitedString(body.currentStep.selectedDecision, 600),
    },
    previousInjects: asStringArray(body.previousInjects, 12),
    sessionNotes: asLimitedString(body.sessionNotes, 2000),
  };
}

function buildAssistPromptPayload(body) {
  return {
    task: "Answer one in-session facilitator assistance question.",
    question: asLimitedString(body.question, 800),
    constraints: [
      "Give one clear recommendation first.",
      "If the IRP has a relevant call tree, vendor list, authority path, or evidence rule, cite that in plain language.",
      "If the IRP is missing or weak, state the gap and suggest what to do during the exercise.",
      "Keep the answer concise and non-alarming.",
      "Do not ask for passwords, secrets, API keys, private keys, tokens, or live credentials.",
      "Do not provide malware, exploit, credential theft, evasion, or persistence instructions.",
      "Return only the required JSON object.",
    ],
    exercise: {
      organization: asShortString(body.exercise.organization),
      industry: asShortString(body.exercise.industry),
      organizationSize: asShortString(body.exercise.organizationSize),
      scenario: asShortString(body.exercise.scenario),
      maturityLevel: asShortString(body.exercise.maturityLevel),
      duration: asShortString(body.exercise.duration),
      summary: asLimitedString(body.exercise.summary, 2000),
      objectives: asStringArray(body.exercise.objectives, 12),
    },
    currentStep: {
      title: asShortString(body.currentStep.title),
      knownFacts: asStringArray(body.currentStep.knownFacts, 12),
      unknowns: asStringArray(body.currentStep.unknowns, 12),
      decisions: asStringArray(body.currentStep.decisions, 12),
      activeDecision: asLimitedString(body.currentStep.activeDecision, 600),
      activePrompt: asLimitedString(body.currentStep.activePrompt, 600),
    },
    irpAnalysis: buildAssistIrpContext(body.irpAnalysis),
    previousInjects: asStringArray(body.previousInjects, 12),
    sessionNotes: asLimitedString(body.sessionNotes, 2000),
    actionItems: asLimitedString(body.actionItems, 2000),
  };
}

function buildAssistIrpContext(irpAnalysis) {
  if (!irpAnalysis || typeof irpAnalysis !== "object") {
    return null;
  }

  return {
    overallSummary: asLimitedString(irpAnalysis.overallSummary, 1200),
    strengths: asStringArray(irpAnalysis.strengths, 8),
    findings: Array.isArray(irpAnalysis.findings)
      ? irpAnalysis.findings.slice(0, 12).map((finding) => ({
          label: asShortString(finding?.label),
          status: asShortString(finding?.status),
          summary: asLimitedString(finding?.summary, 800),
          evidence: asStringArray(finding?.evidence, 4),
          improvement: asLimitedString(finding?.improvement, 800),
        }))
      : [],
    organizationStructure:
      irpAnalysis.organizationStructure && typeof irpAnalysis.organizationStructure === "object"
        ? {
            source: asShortString(irpAnalysis.organizationStructure.source),
            detectedRoles: asStringArray(irpAnalysis.organizationStructure.detectedRoles, 14),
            guidance: asLimitedString(irpAnalysis.organizationStructure.guidance, 500),
          }
        : null,
  };
}

function parseInject(value) {
  const parsed = JSON.parse(value);
  const allowedPressureLevels = new Set(["low", "medium", "high", "critical"]);

  if (
    typeof parsed.injectTitle !== "string" ||
    typeof parsed.injectText !== "string" ||
    !allowedPressureLevels.has(parsed.pressureLevel) ||
    typeof parsed.followUpQuestion !== "string" ||
    typeof parsed.expectedDecision !== "string"
  ) {
    throw new Error("OpenAI response did not match the expected inject schema.");
  }

  return {
    injectTitle: parsed.injectTitle,
    injectText: parsed.injectText,
    pressureLevel: parsed.pressureLevel,
    followUpQuestion: parsed.followUpQuestion,
    expectedDecision: parsed.expectedDecision,
  };
}

function normalizeInjectForReveal(inject, industry) {
  const isMsp = industry === "MSP / IT Provider";
  const realisticText = isMsp ? fixMspInjectLanguage(inject.injectText) : inject.injectText;

  return {
    ...inject,
    injectTitle: asLimitedString(inject.injectTitle, 80),
    injectText: compactRevealText(realisticText, 420, 75),
    followUpQuestion: compactRevealText(inject.followUpQuestion, 180, 28),
    expectedDecision: compactRevealText(inject.expectedDecision, 180, 28),
  };
}

function fixMspInjectLanguage(value) {
  return String(value)
    .replace(/\bexternal MSP partner\b/gi, "upstream software vendor")
    .replace(/\bpartner MSP\b/gi, "upstream software vendor")
    .replace(/\bexternal MSP\b/gi, "upstream software vendor")
    .replace(/\btheir MSP\b/gi, "their escalation lead")
    .replace(/\byour MSP\b/gi, "your escalation lead")
    .replace(/\bMSP partner\b/gi, "upstream software vendor");
}

function compactRevealText(value, maxChars, maxWords) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized];
  let compact = sentences.slice(0, 3).join(" ").trim();
  const words = compact.split(/\s+/).filter(Boolean);

  if (words.length > maxWords) {
    compact = `${words.slice(0, maxWords).join(" ").replace(/[,.!?;:]+$/, "")}.`;
  }

  if (compact.length > maxChars) {
    compact = `${compact.slice(0, maxChars - 1).trim().replace(/[,.!?;:]+$/, "")}.`;
  }

  return compact;
}

function parseAssist(value) {
  const parsed = JSON.parse(value);

  if (
    typeof parsed.answer !== "string" ||
    typeof parsed.irpFinding !== "string" ||
    typeof parsed.recommendedNextStep !== "string" ||
    !Array.isArray(parsed.missingInfo) ||
    !parsed.missingInfo.every((item) => typeof item === "string")
  ) {
    throw new Error("OpenAI response did not match the expected assistance schema.");
  }

  return {
    answer: parsed.answer,
    irpFinding: parsed.irpFinding,
    recommendedNextStep: parsed.recommendedNextStep,
    missingInfo: parsed.missingInfo.slice(0, 6),
  };
}

function parseAiGeneratedExercise(value, options, generatedAt) {
  const parsed = JSON.parse(value);
  const suppliedStructureRoles = extractStructureRoles(options.organizationStructure || options.irpText);
  const exercise = {
    id: crypto.randomUUID(),
    generatedAt,
    overview: {
      organization: options.organizationName,
      industry: options.industry,
      organizationSize: options.organizationSize,
      scenario: options.scenarioType,
      duration: options.exerciseDuration,
      maturityLevel: options.maturityLevel,
      hasHumanFacilitator: false,
      purpose: asLimitedString(parsed.purpose, 1200),
    },
    scenarioSummary: asLimitedString(parsed.scenarioSummary, 5000),
    customScenarioDetails: options.customScenarioDetails || undefined,
    objectives: asStringArray(parsed.objectives, 10),
    suggestedParticipants: suppliedStructureRoles.length > 0 ? suppliedStructureRoles : asStringArray(parsed.suggestedParticipants, 18),
    discussionQuestions: asStringArray(parsed.discussionQuestions, 24),
    gapDiscoveryQuestions: asStringArray(parsed.gapDiscoveryQuestions, 20),
    expectedDecisions: asStringArray(parsed.expectedDecisions, 20),
    facilitatorNotes: asStringArray(parsed.facilitatorNotes, 14),
    irpAnalysis: normalizeAiIrpAnalysis(parsed.irpAnalysis, options, generatedAt),
    starterIrpTemplate: normalizeStarterIrpTemplate(parsed.starterIrpTemplate, options),
    lessonsLearnedTemplate: normalizeLessonsLearnedTemplate(parsed.lessonsLearnedTemplate, options.includeLessonsLearned),
    executiveSummary: asLimitedString(parsed.executiveSummary, 3000),
    markdownReport: "",
  };

  const requiredArrays = [
    ["objectives", exercise.objectives],
    ["suggestedParticipants", exercise.suggestedParticipants],
    ["discussionQuestions", exercise.discussionQuestions],
    ["gapDiscoveryQuestions", exercise.gapDiscoveryQuestions],
    ["expectedDecisions", exercise.expectedDecisions],
    ["facilitatorNotes", exercise.facilitatorNotes],
  ];
  const missing = requiredArrays.find(([, items]) => items.length === 0);
  if (!exercise.overview.purpose || !exercise.scenarioSummary || !exercise.executiveSummary || missing) {
    throw new Error(`AI tabletop response was incomplete${missing ? `: ${missing[0]}` : ""}.`);
  }

  return {
    ...exercise,
    markdownReport: buildGeneratedExerciseMarkdown(exercise),
  };
}

function extractStructureRoles(value) {
  const source = String(value ?? "");
  const normalized = source.toLowerCase();
  const detected = [
    [/\bincident commander\b|\bincident lead\b|\bincident coordinator\b/, "Incident Commander"],
    [/\bit lead\b|\bit manager\b|\bsystems administrator\b|\bsysadmin\b/, "IT Lead"],
    [/\bsecurity lead\b|\bsecurity officer\b|\bciso\b|\binformation security\b/, "Security Lead"],
    [/\bexecutive sponsor\b|\bceo\b|\bexecutive director\b|\btown administrator\b/, "Executive Sponsor"],
    [/\bcfo\b|\bchief financial officer\b|\bfinance director\b|\bcontroller\b|\bpayment approver\b/, "Finance Lead"],
    [/\blegal counsel\b|\bgeneral counsel\b|\boutside counsel\b|\blegal\b/, "Legal Counsel"],
    [/\bcompliance officer\b|\bprivacy officer\b|\bdata protection officer\b/, "Compliance Lead"],
    [/\bcommunications lead\b|\bpublic information officer\b|\bpio\b|\bspokesperson\b/, "Communications Lead"],
    [/\bhuman resources\b|\bhr manager\b|\bhr lead\b/, "HR Lead"],
    [/\boperations lead\b|\boperations manager\b|\bbusiness owner\b|\bdepartment manager\b/, "Operations Lead"],
    [/\bvendor owner\b|\bvendor manager\b|\bprocurement\b|\bthird-party risk\b/, "Vendor Owner"],
    [/\bcyber insurance\b|\binsurance contact\b|\bbreach coach\b/, "Cyber Insurance Contact"],
  ]
    .filter(([pattern]) => pattern.test(normalized))
    .map(([, label]) => label);

  const freeTextRoles = source
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter((item) => /\b(lead|manager|director|owner|officer|counsel|commander|coordinator|administrator|admin|approver|contact)\b/i.test(item));

  return uniqueRoleStrings([...detected, ...freeTextRoles]);
}

function uniqueRoleStrings(items) {
  return asStringArray(
    items.filter((item, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index),
    14,
  );
}

function normalizeAiIrpAnalysis(value, options, generatedAt) {
  if (options.noIrp) {
    return undefined;
  }

  const hasIrp = Boolean(options.irpText?.trim());
  if (!value || typeof value !== "object") {
    if (!hasIrp) {
      return undefined;
    }

    return {
      sourceName: options.irpFileName || "Provided IRP text",
      analyzedAt: generatedAt,
      wordCount: countWords(options.irpText),
      overallSummary: "The AI generation did not return a structured IRP analysis.",
      strengths: [],
      findings: [],
    };
  }

  const findings = Array.isArray(value.findings)
    ? value.findings.slice(0, 12).map((finding, index) => ({
        id: asLimitedString(finding?.id, 80) || `ai-finding-${index + 1}`,
        label: asLimitedString(finding?.label, 160) || "IRP finding",
        status: ["found", "weak", "missing"].includes(finding?.status) ? finding.status : "weak",
        summary: asLimitedString(finding?.summary, 1000),
        evidence: asStringArray(finding?.evidence, 5),
        tailoredQuestions: asStringArray(finding?.tailoredQuestions, 5),
        improvement: asLimitedString(finding?.improvement, 1000),
      }))
    : [];

  if (!hasIrp && findings.length === 0 && !asLimitedString(value.overallSummary, 1000)) {
    return undefined;
  }

  return {
    sourceName: asLimitedString(value.sourceName, 200) || options.irpFileName || (hasIrp ? "Provided IRP text" : "No IRP uploaded"),
    analyzedAt: generatedAt,
    wordCount: Number.isFinite(value.wordCount) ? Number(value.wordCount) : countWords(options.irpText),
    overallSummary:
      asLimitedString(value.overallSummary, 1500) ||
      (hasIrp ? "The AI reviewed the provided IRP text for exercise-relevant gaps." : "No IRP was uploaded."),
    strengths: asStringArray(value.strengths, 8),
    findings,
  };
}

function normalizeStarterIrpTemplate(value, options) {
  if (!options.noIrp) {
    const sections = Array.isArray(value?.sections) ? value.sections : [];
    if (sections.length === 0) {
      return undefined;
    }
  }

  const fallback = buildStarterIrpTemplate(options);
  const sections = Array.isArray(value?.sections)
    ? value.sections.slice(0, 10).map((section) => ({
        title: asLimitedString(section?.title, 120),
        purpose: asLimitedString(section?.purpose, 300),
        draftText: asLimitedString(section?.draftText, 1200),
        fillIn: asStringArray(section?.fillIn, 8),
      })).filter((section) => section.title && section.draftText)
    : [];

  return {
    generatedBecause:
      asLimitedString(value?.generatedBecause, 600) ||
      fallback.generatedBecause,
    sections: sections.length > 0 ? sections : fallback.sections,
    missingInputs: asStringArray(value?.missingInputs, 12).length > 0 ? asStringArray(value?.missingInputs, 12) : fallback.missingInputs,
    nextSteps: asStringArray(value?.nextSteps, 8).length > 0 ? asStringArray(value?.nextSteps, 8) : fallback.nextSteps,
  };
}

function buildStarterIrpTemplate(options) {
  const organization = options.organizationName;
  const scenario = String(options.scenarioType || "cybersecurity incident").toLowerCase();
  const industry = String(options.industry || "organization").toLowerCase();

  return {
    generatedBecause: "No incident response plan was uploaded. This starter outline should be completed and reviewed after the tabletop; it is not a substitute for legal, regulatory, or security review.",
    sections: [
      {
        title: "Purpose and Scope",
        purpose: "Define what the plan covers and when it applies.",
        draftText: `${organization} will use this incident response plan to prepare for, detect, coordinate, contain, recover from, and learn from cybersecurity incidents affecting its people, systems, data, clients, vendors, or operations.`,
        fillIn: ["Covered systems, locations, data, and business processes", `Industry-specific obligations for a ${industry} organization`, "Plan owner and review cadence"],
      },
      {
        title: "Incident Roles and Contact Tree",
        purpose: "Make ownership obvious before pressure starts.",
        draftText: "The organization should name a primary incident coordinator, backup coordinator, technical lead, business owner, communications owner, executive approver, legal/compliance contact, and outside support contacts.",
        fillIn: ["Primary and backup names with phone/email", "Vendor, insurer, legal, law enforcement, and regulator contacts", "After-hours approval path"],
      },
      {
        title: "Severity Levels and Escalation",
        purpose: "Help the team decide when an event becomes a formal incident.",
        draftText: "Incidents should be classified by operational impact, data sensitivity, number of affected users or clients, legal/compliance exposure, financial impact, and public/customer visibility.",
        fillIn: ["Low, medium, high, and critical definitions", "Who can declare each level", "What each level activates"],
      },
      {
        title: "Detection, Reporting, and First 30 Minutes",
        purpose: "Give staff a simple path to report concerns.",
        draftText: `For a suspected ${scenario} event, staff should report what they saw, when it happened, who is affected, screenshots or message details if safe, and any business impact. The team should avoid deleting evidence or taking unapproved disruptive action.`,
        fillIn: ["Report intake channel", "Minimum facts to collect", "What staff should not do"],
      },
      {
        title: "Evidence Preservation",
        purpose: "Balance fast containment with preserving facts needed later.",
        draftText: "The response team should document timeline, affected accounts/systems, logs reviewed, screenshots, communications, actions taken, approvals, and custody of exported evidence.",
        fillIn: ["Log sources and retention periods", "Who may collect/export evidence", "Where evidence is stored"],
      },
      {
        title: "Containment, Recovery, and Communications",
        purpose: "Define who can act and who must approve messaging.",
        draftText: "Containment and recovery actions should be approved based on severity, business impact, evidence risk, and legal/compliance needs. Communications should separate confirmed facts from assumptions.",
        fillIn: ["Containment actions allowed without approval", "Recovery validation steps", "Internal, customer/client, regulator, media, and leadership update owners"],
      },
      {
        title: "Post-Incident Review and Improvement",
        purpose: "Turn lessons learned into plan updates.",
        draftText: "After each incident or tabletop, the organization should document what happened, what decisions were made, what was unclear, what slowed response, and which plan updates are needed.",
        fillIn: ["After-action meeting owner", "Action item tracker", "Retest schedule"],
      },
    ],
    missingInputs: [
      "Named incident coordinator and backup",
      "Severity definitions and declaration authority",
      "Vendor, legal, insurer, regulator, and leadership contact list",
      "Evidence locations and retention expectations",
      "Communication approval path",
      "Recovery validation steps",
    ],
    nextSteps: [
      "Use the tabletop notes to fill the starter IRP sections.",
      "Have leadership, legal/compliance, IT/security, and business owners review the draft.",
      "Run a shorter follow-up tabletop against the completed draft within 30 to 90 days.",
    ],
  };
}

function normalizeLessonsLearnedTemplate(value, includeLessonsLearned) {
  if (!includeLessonsLearned) {
    return undefined;
  }

  const items = Array.isArray(value) ? value : [];
  const normalized = items.slice(0, 10).map((item) => ({
    prompt: asLimitedString(item?.prompt, 300),
    owner: asLimitedString(item?.owner, 120),
    dueDate: asLimitedString(item?.dueDate, 80),
    priority: asLimitedString(item?.priority, 80),
  })).filter((item) => item.prompt);

  return normalized.length > 0
    ? normalized
    : [
        { prompt: "What worked well?", owner: "", dueDate: "", priority: "" },
        { prompt: "What was unclear?", owner: "", dueDate: "", priority: "" },
        { prompt: "What needs to improve before the next incident?", owner: "", dueDate: "", priority: "" },
        { prompt: "Action item", owner: "", dueDate: "", priority: "" },
      ];
}

function buildGeneratedExerciseMarkdown(exercise) {
  const lines = [
    `# ${exercise.overview.organization} Tabletop Exercise`,
    "",
    "## Exercise Overview",
    `- Organization: ${exercise.overview.organization}`,
    `- Industry: ${exercise.overview.industry}`,
    `- Organization size: ${exercise.overview.organizationSize}`,
    `- Scenario: ${exercise.overview.scenario}`,
    `- Duration: ${exercise.overview.duration}`,
    `- Maturity level: ${exercise.overview.maturityLevel}`,
    "- Session mode: TabletopForge facilitated",
    `- Purpose: ${exercise.overview.purpose}`,
    "",
    "## Scenario Summary",
    exercise.scenarioSummary,
    "",
    ...(exercise.customScenarioDetails ? ["## Custom Scenario Details", exercise.customScenarioDetails, ""] : []),
    markdownList("Exercise Objectives", exercise.objectives),
    markdownList("Suggested Participants", exercise.suggestedParticipants),
    exercise.irpAnalysis ? buildIrpMarkdown(exercise.irpAnalysis) : "",
    exercise.starterIrpTemplate ? buildStarterIrpMarkdown(exercise.starterIrpTemplate) : "",
    markdownList("Discussion Questions", exercise.discussionQuestions),
    markdownList("IRP Gap Discovery Questions", exercise.gapDiscoveryQuestions),
    markdownList("Expected Decisions", exercise.expectedDecisions),
    markdownList("Facilitator Notes", exercise.facilitatorNotes),
    "## Executive Summary",
    exercise.executiveSummary,
    "",
  ];

  if (exercise.lessonsLearnedTemplate) {
    lines.push("## Lessons Learned Template");
    lines.push("| Prompt | Owner | Due date | Priority |");
    lines.push("| --- | --- | --- | --- |");
    exercise.lessonsLearnedTemplate.forEach((item) => {
      lines.push(`| ${item.prompt} | ${item.owner || ""} | ${item.dueDate || ""} | ${item.priority || ""} |`);
    });
    lines.push("");
  }

  return lines.filter((line) => line !== "").join("\n");
}

function markdownList(title, items) {
  return [`## ${title}`, ...items.map((item) => `- ${item}`), ""].join("\n");
}

function buildIrpMarkdown(analysis) {
  return [
    "## IRP Gap Analysis",
    analysis.overallSummary,
    "",
    ...(analysis.strengths.length ? markdownList("IRP Strengths", analysis.strengths).split("\n") : []),
    ...(analysis.findings.length
      ? [
          "## IRP Findings",
          ...analysis.findings.map((finding) => `- ${finding.label} (${finding.status}): ${finding.summary} ${finding.improvement}`),
          "",
        ]
      : []),
  ].join("\n");
}

function buildStarterIrpMarkdown(template) {
  const lines = [
    "## Starter IRP Template",
    template.generatedBecause,
    "",
  ];

  (template.sections ?? []).forEach((section) => {
    lines.push(`### ${section.title}`);
    lines.push(`Purpose: ${section.purpose}`);
    lines.push("");
    lines.push(section.draftText);
    lines.push("");
    lines.push("Fill in:");
    (section.fillIn ?? []).forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  });

  lines.push("### Missing Inputs To Collect");
  (template.missingInputs ?? []).forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("### Next Steps");
  (template.nextSteps ?? []).forEach((item) => lines.push(`- ${item}`));
  lines.push("");

  return lines.join("\n");
}

function countWords(value) {
  return typeof value === "string" ? (value.trim().match(/\S+/g) ?? []).length : 0;
}

async function recordAiRun({
  tabletopId,
  userId,
  model,
  promptType,
  status,
  inputTokens,
  outputTokens,
  resultJson,
  errorMessage = null,
}) {
  await dbQuery(
    `INSERT INTO "ai_runs" (
       "id", "tabletopId", "userId", "model", "promptType", "status",
       "inputTokens", "outputTokens", "resultJson", "errorMessage", "completedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [
      crypto.randomUUID(),
      tabletopId,
      userId,
      model,
      promptType,
      status,
      inputTokens,
      outputTokens,
      resultJson,
      errorMessage,
    ],
  );
}

function asShortString(value) {
  return asLimitedString(value, 200);
}

function asLimitedString(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function asStringArray(value, maxItems) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string")
    .slice(0, maxItems)
    .map((item) => item.slice(0, 500));
}

function sendAuthError(response, error) {
  const statusCode = error.statusCode || 500;
  response.status(statusCode).json({ error: statusCode === 500 ? "Request failed." : error.message });
}

function sendApiError(response, error, fallbackMessage) {
  console.error(fallbackMessage, error);
  const statusCode = error.statusCode || 500;
  response.status(statusCode).json({ error: statusCode === 500 ? fallbackMessage : error.message });
}

function getSafeErrorMessage(error) {
  if (!(error instanceof Error)) {
    return "Unknown database error.";
  }

  return `${error.name}: ${error.message}`.slice(0, 300);
}
