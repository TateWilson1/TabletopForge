import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { GeneratedExercise } from "@/lib/types";

const DEFAULT_MODEL = "gpt-5.4-mini";

export type AiPressureLevel = "low" | "medium" | "high" | "critical";

export interface GenerateInjectInput {
  tabletopId?: string;
  exercise: Pick<GeneratedExercise, "overview" | "scenarioSummary" | "objectives">;
  stepTitle: string;
  knownFacts: string[];
  unknowns: string[];
  decisions: string[];
  previousInjects: string[];
  sessionNotes?: string;
}

export interface GeneratedInject {
  injectTitle: string;
  injectText: string;
  pressureLevel: AiPressureLevel;
  followUpQuestion: string;
  expectedDecision: string;
}

const generatedInjectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["injectTitle", "injectText", "pressureLevel", "followUpQuestion", "expectedDecision"],
  properties: {
    injectTitle: {
      type: "string",
      description: "A short facilitator-facing title for the scenario development.",
    },
    injectText: {
      type: "string",
      description: "One realistic new development to reveal to tabletop participants.",
    },
    pressureLevel: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
      description: "How much pressure this inject should add to the exercise.",
    },
    followUpQuestion: {
      type: "string",
      description: "The next discussion question TabletopForge should ask after revealing the inject.",
    },
    expectedDecision: {
      type: "string",
      description: "The decision the team should try to make after this inject.",
    },
  },
} as const;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to the server environment before using AI features.");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getModel() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export async function generateScenarioInject(input: GenerateInjectInput): Promise<GeneratedInject> {
  const model = getModel();
  const aiRun = input.tabletopId
    ? await prisma.aiRun.create({
        data: {
          tabletopId: input.tabletopId,
          model,
          promptType: "scenario_inject",
          status: "running",
        },
      })
    : null;

  try {
    const response = await getOpenAIClient().responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are TabletopForge, a cybersecurity tabletop exercise facilitator. Create realistic, bounded injects that evolve the exercise without asking for sensitive secrets, credentials, exploit steps, or harmful instructions.",
        },
        {
          role: "user",
          content: JSON.stringify(buildInjectPromptPayload(input)),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tabletop_inject",
          strict: true,
          schema: generatedInjectSchema,
        },
      },
    });

    const inject = parseGeneratedInject(response.output_text);

    if (aiRun) {
      await prisma.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: "completed",
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          resultJson: generatedInjectToJson(inject),
          completedAt: new Date(),
        },
      });
    }

    return inject;
  } catch (error) {
    if (aiRun) {
      await prisma.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown AI generation error",
          completedAt: new Date(),
        },
      });
    }

    throw error;
  }
}

function buildInjectPromptPayload(input: GenerateInjectInput) {
  return {
    task: "Generate one new scenario inject for the current tabletop step.",
    constraints: [
      "Keep it realistic for the selected industry, organization size, maturity, and scenario.",
      "Do not repeat prior injects.",
      "Do not provide malware, exploit, credential theft, or evasion instructions.",
      "Do not ask users to reveal passwords, secrets, API keys, private keys, tokens, or live credentials.",
      "Use plain language for Basic maturity.",
      "Return only the required JSON object.",
    ],
    exercise: {
      organization: input.exercise.overview.organization,
      industry: input.exercise.overview.industry,
      organizationSize: input.exercise.overview.organizationSize,
      scenario: input.exercise.overview.scenario,
      maturityLevel: input.exercise.overview.maturityLevel,
      duration: input.exercise.overview.duration,
      summary: input.exercise.scenarioSummary,
      objectives: input.exercise.objectives,
    },
    currentStep: {
      title: input.stepTitle,
      knownFacts: input.knownFacts,
      unknowns: input.unknowns,
      decisions: input.decisions,
    },
    previousInjects: input.previousInjects,
    sessionNotes: input.sessionNotes?.slice(0, 2000) || "",
  };
}

function parseGeneratedInject(value: string): GeneratedInject {
  const parsed = JSON.parse(value) as Partial<GeneratedInject>;

  if (
    typeof parsed.injectTitle !== "string" ||
    typeof parsed.injectText !== "string" ||
    !isPressureLevel(parsed.pressureLevel) ||
    typeof parsed.followUpQuestion !== "string" ||
    typeof parsed.expectedDecision !== "string"
  ) {
    throw new Error("AI response did not match the expected inject schema.");
  }

  return {
    injectTitle: parsed.injectTitle,
    injectText: parsed.injectText,
    pressureLevel: parsed.pressureLevel,
    followUpQuestion: parsed.followUpQuestion,
    expectedDecision: parsed.expectedDecision,
  };
}

function generatedInjectToJson(inject: GeneratedInject) {
  return {
    injectTitle: inject.injectTitle,
    injectText: inject.injectText,
    pressureLevel: inject.pressureLevel,
    followUpQuestion: inject.followUpQuestion,
    expectedDecision: inject.expectedDecision,
  };
}

function isPressureLevel(value: unknown): value is AiPressureLevel {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}
