import { scenarioContent } from "@/lib/tabletop-data";
import { analyzeIrp, getTailoredIrpQuestions } from "@/lib/irp-analyzer";
import type { ExerciseOptions, GeneratedExercise, LessonsLearnedItem } from "@/lib/types";

const baseParticipants = [
  "Facilitator",
  "IT/Security Lead",
  "Help Desk",
  "Executive Sponsor",
  "HR",
  "Legal/Compliance",
  "Communications/Public Relations",
  "Department Manager",
];

const facilitatorNotes = [
  "Keep the discussion focused on process, ownership, and decision points rather than blame.",
  "Ask who owns each action and where that ownership is documented.",
  "Capture unclear answers as improvement items in the after-action notes.",
  "Avoid getting too technical unless the group is ready for that level of detail.",
  "End with specific action items, owners, due dates, and priority levels.",
];

const lessonsLearnedTemplate: LessonsLearnedItem[] = [
  { prompt: "What worked well?" },
  { prompt: "What was unclear?" },
  { prompt: "What slowed the response?" },
  { prompt: "What policy or procedure needs updated?" },
  { prompt: "What communication gaps were found?" },
  { prompt: "What training is needed?" },
  { prompt: "Action item", owner: "", dueDate: "", priority: "" },
];

export function generateExercise(options: ExerciseOptions): GeneratedExercise {
  const content = scenarioContent[options.scenarioType];
  const irpAnalysis = analyzeIrp(options.irpText ?? "", options.irpFileName);
  const tailoredIrpQuestions = getTailoredIrpQuestions(irpAnalysis);
  const participants = [...baseParticipants];
  const id = crypto.randomUUID();

  if (options.industry === "MSP / IT Provider" || options.scenarioType === "Vendor / Third-Party Breach") {
    participants.push("Vendor/MSP Contact");
  }

  const discussionQuestions = buildQuestionSet(
    [
      ...tailoredIrpQuestions.discussionQuestions,
      ...content.discussionQuestions,
      ...(options.includeExecutiveQuestions ? content.executiveQuestions : []),
      ...(options.includeTechnicalQuestions ? content.technicalQuestions : []),
    ],
    `${id}:discussion:${options.scenarioType}`,
  );

  const gapDiscoveryQuestions = buildQuestionSet(
    [
      ...tailoredIrpQuestions.gapQuestions,
      ...content.gapQuestions,
      ...(options.includeComplianceQuestions ? content.complianceQuestions : []),
    ],
    `${id}:gaps:${options.scenarioType}`,
  );

  const generatedAt = new Date().toISOString();
  const organization = options.organizationName.trim();
  const overview = {
    organization,
    industry: options.industry,
    organizationSize: options.organizationSize,
    scenario: options.scenarioType,
    duration: options.exerciseDuration,
    maturityLevel: options.maturityLevel,
    hasHumanFacilitator: options.hasHumanFacilitator,
    purpose: `Help ${organization} validate incident response roles, communications, evidence expectations, and decision authority for a ${options.scenarioType.toLowerCase()} scenario at a ${options.maturityLevel.toLowerCase()} maturity level.`,
  };

  const exerciseWithoutMarkdown = {
    id,
    generatedAt,
    overview,
    scenarioSummary: content.summary({ ...options, organizationName: organization }),
    objectives: tuneByMaturity(
      [
        ...(irpAnalysis ? ["Validate whether known IRP gaps would slow or weaken the response."] : []),
        ...content.objectives,
      ],
      options.maturityLevel,
    ),
    suggestedParticipants: participants,
    discussionQuestions,
    gapDiscoveryQuestions,
    expectedDecisions: content.expectedDecisions,
    facilitatorNotes,
    irpAnalysis,
    lessonsLearnedTemplate: options.includeLessonsLearned ? lessonsLearnedTemplate : undefined,
    executiveSummary: `${organization} will walk through a realistic ${options.scenarioType.toLowerCase()} tabletop exercise designed for ${options.industry.toLowerCase()} organizations with ${options.organizationSize} employees. The discussion should reveal whether the incident response plan clearly defines escalation, containment authority, communications, evidence handling, and after-action ownership without requiring a deeply technical exercise format.${irpAnalysis ? ` The uploaded IRP scan found ${irpAnalysis.findings.filter((finding) => finding.status !== "found").length} likely weak or missing areas, so the questions emphasize those plan gaps.` : ""}`,
  };

  const markdownReport = createMarkdownReport(exerciseWithoutMarkdown);

  return {
    ...exerciseWithoutMarkdown,
    markdownReport,
  };
}

function buildQuestionSet(questions: string[], seed: string) {
  return seededShuffle(Array.from(new Set(questions)), seed).slice(0, 12);
}

function tuneByMaturity(objectives: string[], maturityLevel: ExerciseOptions["maturityLevel"]) {
  if (maturityLevel === "Basic") {
    return objectives.slice(0, 4);
  }

  if (maturityLevel === "Intermediate") {
    return objectives.slice(0, 5);
  }

  return objectives;
}

function createMarkdownReport(exercise: Omit<GeneratedExercise, "markdownReport">) {
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
    `- Session mode: ${exercise.overview.hasHumanFacilitator ? "Human facilitator assisted" : "TabletopForge facilitated"}`,
    `- Purpose: ${exercise.overview.purpose}`,
    "",
    "## Scenario Summary",
    exercise.scenarioSummary,
    "",
    listSection("Exercise Objectives", exercise.objectives),
    listSection("Suggested Participants", exercise.suggestedParticipants),
    irpAnalysisSection(exercise.irpAnalysis),
    listSection("Discussion Questions", exercise.discussionQuestions),
    listSection("IRP Gap Discovery Questions", exercise.gapDiscoveryQuestions),
    listSection("Expected Decisions", exercise.expectedDecisions),
    listSection("Facilitator Notes", exercise.facilitatorNotes),
  ];

  if (exercise.lessonsLearnedTemplate) {
    lines.push("## Lessons Learned Template");
    lines.push("| Prompt | Owner | Due date | Priority |");
    lines.push("| --- | --- | --- | --- |");
    exercise.lessonsLearnedTemplate.forEach((item) => {
      lines.push(`| ${item.prompt} | ${item.owner ?? ""} | ${item.dueDate ?? ""} | ${item.priority ?? ""} |`);
    });
    lines.push("");
  }

  lines.push("## Executive Summary");
  lines.push(exercise.executiveSummary);
  lines.push("");

  return lines.join("\n");
}

function listSection(title: string, items: string[]) {
  return [`## ${title}`, ...items.map((item) => `- ${item}`), ""].join("\n");
}

function irpAnalysisSection(analysis: GeneratedExercise["irpAnalysis"]) {
  if (!analysis) {
    return "";
  }

  const lines = [
    "## IRP Gap Analysis",
    `- Source: ${analysis.sourceName ?? "Pasted IRP text"}`,
    `- Words analyzed: ${analysis.wordCount}`,
    `- Summary: ${analysis.overallSummary}`,
    "",
  ];

  if (analysis.strengths.length > 0) {
    lines.push("### Apparent Strengths");
    analysis.strengths.forEach((strength) => lines.push(`- ${strength}`));
    lines.push("");
  }

  lines.push("### Findings");
  analysis.findings
    .filter((finding) => finding.status !== "found")
    .forEach((finding) => {
      lines.push(`- ${finding.label} (${finding.status}): ${finding.summary}`);
      lines.push(`  - Improvement: ${finding.improvement}`);
    });
  lines.push("");

  return lines.join("\n");
}

function seededShuffle(items: string[], seedText: string) {
  const shuffled = [...items];
  let seed = hashSeed(seedText);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed);
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function nextSeed(seed: number) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
