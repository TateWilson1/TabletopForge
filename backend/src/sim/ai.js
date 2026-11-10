// Prompts, JSON schemas and parsers for AI-authored simulation content.
// No network calls live here: server.js owns the OpenAI client, cost controls and logging.

import { CAPABILITIES, CHANNELS, METER_IDS, QUALITIES, normalizeSimulation } from "./engine.js";

const str = { type: "string" };
const strArray = { type: "array", items: str };
const obj = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const effectsSchema = obj(Object.fromEntries(METER_IDS.map((meter) => [meter, { type: "integer" }])));

export const simulationSchema = obj({
  title: str,
  briefing: str,
  roles: { type: "array", items: obj({ id: str, title: str, focus: str }) },
  phases: { type: "array", items: obj({ id: str, name: str, objective: str }) },
  injects: {
    type: "array",
    items: obj({
      id: str,
      phaseId: str,
      clock: str,
      channel: { type: "string", enum: CHANNELS },
      sender: str,
      title: str,
      body: str,
      audience: strArray,
      requires: str,
      effects: effectsSchema,
      facilitatorNotes: strArray,
      mitre: strArray,
      decision: {
        anyOf: [
          { type: "null" },
          obj({
            prompt: str,
            ownerRoleId: str,
            capability: { type: "string", enum: CAPABILITIES },
            csf: str,
            recommendation: str,
            options: {
              type: "array",
              items: obj({
                id: str,
                label: str,
                quality: { type: "string", enum: QUALITIES },
                consequence: str,
                effects: effectsSchema,
                setsFlags: strArray,
              }),
            },
          }),
        ],
      },
    }),
  },
});

export const SIMULATION_SYSTEM_PROMPT =
  "You are TabletopForge, an expert incident response exercise designer who has run hundreds of cyber tabletop exercises. You write live, role-based simulations that feel like a real incident unfolding: artifacts people actually receive (alerts, emails, calls, chat messages, ransom notes, reporter and regulator inquiries), hard trade-off decisions with no perfect answer, and consequences that follow from what the team chose. You never include malware, exploit, credential theft, evasion, or persistence instructions.";

export function buildSimulationPrompt(options, exemplar, exercise) {
  return {
    task: "Design a live, branching incident response simulation for this organization.",
    rules: [
      "Follow the structure and quality bar of `exemplar`, but write entirely new content specific to this organization, its industry, size, systems, optional scenario details, and IRP gaps. Do not copy exemplar text.",
      "Reuse the exemplar's role ids and phase ids exactly. You may rename role titles to match roles named in the IRP or organization structure; never invent roles the organization does not have.",
      `Write ${exemplar.injects.filter((inject) => !inject.requires).length} main injects in chronological order plus 2 to 4 consequence injects.`,
      "Each inject is one artifact, written in the voice of its channel and sender, 2 to 5 sentences, with concrete details (system names, counts, times, quotes). No analysis or advice inside the body.",
      "`audience` lists the role ids that privately receive the inject; use an empty array when the whole room sees it. Give at least two injects a restricted audience so that roles must brief each other.",
      "Most main injects carry a decision with exactly 3 options: one `strong`, one `acceptable`, one `risky`. Every option must be something a reasonable team might actually choose; the risky option should be tempting, not absurd. Put options in a random order.",
      "`consequence` is what happens next because of that choice, written as narrative fact in 1 to 2 sentences.",
      "`effects` are integers from -15 to 15 on containment, operations, trust, and compliance. Strong options are net positive but may cost operations; risky options are net negative.",
      "A risky (or sometimes acceptable) option may list one flag in `setsFlags`. A consequence inject sets `requires` to that flag, has `decision` null, negative `effects`, and is placed immediately after the inject whose decision set the flag. Main injects use an empty `requires`.",
      "`capability` is the response capability the decision tests. `csf` is the single best-matching NIST CSF 2.0 subcategory id such as RS.MA-02, RS.MI-01, RS.CO-02, RC.RP-05.",
      "`recommendation` is the concrete plan or process improvement an organization should make if it struggled with this decision.",
      "`facilitatorNotes` are 2 or 3 probing questions a facilitator would ask. `mitre` lists MITRE ATT&CK technique ids only when clearly applicable, otherwise an empty array.",
      "If IRP findings are provided, aim at least half of the decisions at weak or missing areas of the plan.",
      "For Basic maturity use plain language and avoid jargon. For Advanced maturity add ambiguity, conflicting information, and authority conflicts.",
      "If the industry is MSP / IT Provider, the organization is the provider; pressure comes from client companies, upstream vendors, and its own tooling.",
      "The final inject is a stand-down / hotwash briefing with decision null.",
    ],
    organization: {
      name: options.organizationName,
      industry: options.industry,
      size: options.organizationSize,
      scenarioType: options.scenarioType,
      maturityLevel: options.maturityLevel,
      duration: options.exerciseDuration,
      scenarioDetails: options.customScenarioDetails || "",
      organizationStructure: options.organizationStructure || "",
    },
    scenarioSummary: exercise?.scenarioSummary ?? "",
    irpFindings: (exercise?.irpAnalysis?.findings ?? []).slice(0, 12).map((finding) => ({
      area: finding.label,
      status: finding.status,
      summary: finding.summary,
    })),
    exemplar: {
      roles: exemplar.roles,
      phases: exemplar.phases,
      injects: exemplar.injects.slice(0, 4),
    },
  };
}

// Returns a validated simulation, or null if the AI output is unusable.
export function parseAiSimulation(outputText, fallback) {
  try {
    const parsed = JSON.parse(outputText);
    const sim = normalizeSimulation({
      ...parsed,
      id: fallback.id.replace(/^lib-/, "ai-"),
      source: "ai",
      organization: fallback.organization,
      industry: fallback.industry,
      organizationSize: fallback.organizationSize,
      scenarioType: fallback.scenarioType,
      maturityLevel: fallback.maturityLevel,
      durationMinutes: fallback.durationMinutes,
      groundRules: fallback.groundRules,
      injects: (parsed.injects ?? []).map((inject) => ({
        ...inject,
        decision: inject.decision ? { ...inject.decision, timeLimitSeconds: fallback.injects.find((item) => item.decision)?.decision.timeLimitSeconds } : null,
      })),
    });
    const decisions = sim.injects.filter((inject) => inject.decision);
    const wellFormed = decisions.every((inject) => inject.decision.options.some((option) => option.quality === "strong"));
    return decisions.length >= 3 && wellFormed ? sim : null;
  } catch {
    return null;
  }
}

export const curveballSchema = obj({
  channel: { type: "string", enum: CHANNELS },
  sender: str,
  title: str,
  body: str,
  facilitatorNotes: strArray,
});

export const CURVEBALL_SYSTEM_PROMPT =
  "You are TabletopForge, a cybersecurity tabletop facilitator. Write one unscripted scenario development (a 'curveball') that raises pressure realistically given what the team has decided so far. It must be a single artifact in the voice of its sender, 2 to 4 sentences, with concrete detail. Do not repeat earlier developments. Never include exploit, malware, credential theft, or evasion instructions.";

export function buildCurveballPrompt(view, hint) {
  return {
    task: "Write one curveball inject for the live exercise.",
    facilitatorHint: typeof hint === "string" ? hint.slice(0, 300) : "",
    organization: view.sim.organization,
    industry: view.sim.industry,
    scenario: view.sim.scenarioType,
    maturityLevel: view.sim.maturityLevel,
    roles: view.sim.roles.map((role) => role.title),
    meters: view.meters,
    soFar: view.feed.slice(-8).map((item) => ({
      title: item.title,
      body: item.body.slice(0, 400),
      decided: item.decision?.outcome
        ? item.decision.options.find((option) => option.id === item.decision.outcome.optionId)?.label ?? "skipped"
        : undefined,
    })),
  };
}

export const narrativeSchema = obj({
  executiveSummary: str,
  whatWentWell: strArray,
  keyRisks: strArray,
  coachingNotes: strArray,
  nextExercise: str,
});

export const NARRATIVE_SYSTEM_PROMPT =
  "You are TabletopForge, writing the narrative section of an incident response tabletop after-action report for senior leadership. Be specific, candid, and constructive. Base every statement strictly on the provided exercise record; do not invent events, people, or numbers. Write in plain business language without jargon or blame.";

export function buildNarrativePrompt(report) {
  return {
    task: "Write the narrative for this after-action report.",
    format: {
      executiveSummary: "One paragraph, 90 to 140 words, suitable for a board or auditor.",
      whatWentWell: "2 to 4 specific strengths observed.",
      keyRisks: "2 to 4 business risks the findings reveal, in priority order.",
      coachingNotes: "2 to 4 observations about how the team worked together (alignment, speed, communication between roles), drawing on vote splits, rationales, timing, and participant notes.",
      nextExercise: "One sentence recommending the next exercise scenario and focus.",
    },
    record: {
      exercise: report.exercise,
      overall: report.overall,
      capabilities: report.capabilities,
      meters: report.meters,
      decisions: report.decisions.map((decision) => ({
        prompt: decision.prompt,
        owner: decision.owner,
        chosen: decision.chosen,
        quality: decision.quality,
        consequence: decision.consequence,
        secondsToDecide: decision.secondsToDecide,
        timeLimitSeconds: decision.timeLimitSeconds,
        alignment: decision.alignment,
        rationales: decision.rationales.slice(0, 6),
      })),
      findings: report.findings.map((finding) => ({ severity: finding.severity, title: finding.title, observation: finding.observation })),
      participantNotes: [...report.observations, ...report.actionItems].slice(0, 30),
      participants: report.participants.map((participant) => participant.role),
    },
  };
}

export function parseNarrative(outputText) {
  const parsed = JSON.parse(outputText);
  const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 6).map((item) => item.slice(0, 600)) : []);
  if (typeof parsed.executiveSummary !== "string" || !parsed.executiveSummary.trim()) {
    throw new Error("AI narrative did not match the expected schema.");
  }
  return {
    executiveSummary: parsed.executiveSummary.slice(0, 2000),
    whatWentWell: list(parsed.whatWentWell),
    keyRisks: list(parsed.keyRisks),
    coachingNotes: list(parsed.coachingNotes),
    nextExercise: typeof parsed.nextExercise === "string" ? parsed.nextExercise.slice(0, 500) : "",
  };
}
