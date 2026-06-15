import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://tatewilson1.github.io",
  "http://localhost:3000",
  "http://localhost:3001",
];

const app = express();
const port = Number(process.env.PORT || 3000);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const dailyUsage = {
  day: getCurrentDay(),
  count: 0,
};

app.use(express.json({ limit: "64kb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || getAllowedOrigins().includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS."));
    },
  }),
);

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "tabletopforge-backend",
  });
});

app.post("/api/ai/generate-inject", async (request, response) => {
  const configError = validateServerConfig();
  if (configError) {
    response.status(503).json({ error: configError });
    return;
  }

  if (!isValidAccessCode(getRequestAccessCode(request))) {
    response.status(401).json({ error: "Invalid access code." });
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
            "You are TabletopForge, a cybersecurity tabletop exercise facilitator. Generate one realistic scenario inject that evolves the discussion. Do not provide exploit steps, malware instructions, credential theft guidance, evasion guidance, or requests for secrets.",
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

    response.json({
      model,
      inject: parseInject(aiResponse.output_text),
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

app.use((_request, response) => {
  response.status(404).json({ error: "Not found." });
});

app.listen(port, () => {
  console.log(`TabletopForge backend listening on port ${port}`);
});

const injectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["injectTitle", "injectText", "pressureLevel", "followUpQuestion", "expectedDecision"],
  properties: {
    injectTitle: {
      type: "string",
      description: "A short title for the scenario development.",
    },
    injectText: {
      type: "string",
      description: "One new realistic event to reveal to the tabletop participants.",
    },
    pressureLevel: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
      description: "How much pressure the inject should add.",
    },
    followUpQuestion: {
      type: "string",
      description: "The next question the website should ask the participants.",
    },
    expectedDecision: {
      type: "string",
      description: "The decision the group should try to make after the inject.",
    },
  },
};

function validateServerConfig() {
  if (!process.env.OPENAI_API_KEY) {
    return "OPENAI_API_KEY is not configured.";
  }

  if (!process.env.TABLETOPFORGE_AI_ACCESS_CODE) {
    return "TABLETOPFORGE_AI_ACCESS_CODE is not configured.";
  }

  return "";
}

function getAllowedOrigins() {
  return (process.env.TABLETOPFORGE_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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

function buildPromptPayload(body) {
  return {
    task: "Generate one new scenario inject for the current tabletop step.",
    constraints: [
      "Keep it realistic for the selected industry, organization size, maturity, and scenario.",
      "Do not repeat prior injects.",
      "Do not provide malware, exploit, credential theft, evasion, or persistence instructions.",
      "Do not ask users to reveal passwords, secrets, API keys, private keys, tokens, or live credentials.",
      "Use plain language for Basic maturity.",
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
    },
    previousInjects: asStringArray(body.previousInjects, 12),
    sessionNotes: asLimitedString(body.sessionNotes, 2000),
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

  return value.filter((item) => typeof item === "string").slice(0, maxItems).map((item) => item.slice(0, 500));
}
