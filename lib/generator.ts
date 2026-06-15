import { scenarioContent } from "@/lib/tabletop-data";
import { analyzeIrp, getTailoredIrpQuestions } from "@/lib/irp-analyzer";
import type { ExerciseOptions, GeneratedExercise, LessonsLearnedItem } from "@/lib/types";

const baseParticipants = [
  "Incident Lead",
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

interface ContextProfile {
  scenarioContext: string;
  executiveFocus: string;
  participants: string[];
  objectives: string[];
  discussionQuestions: string[];
  gapQuestions: string[];
  expectedDecisions: string[];
}

const industryProfiles: Record<ExerciseOptions["industry"], ContextProfile> = {
  Healthcare: {
    scenarioContext: "Healthcare context: keep patient care, EHR access, clinic operations, and privacy obligations in scope during each decision.",
    executiveFocus: "Patient safety, care continuity, privacy, and regulatory notification should shape leadership decisions.",
    participants: ["Clinical Operations Lead", "Privacy Officer", "EHR/Application Owner"],
    objectives: ["Confirm how patient care continues if technology or records are disrupted."],
    discussionQuestions: [
      "Which patient care activity would be affected first, and who can approve a temporary workaround?",
      "How would staff report the issue without delaying care or sharing sensitive patient information?",
    ],
    gapQuestions: ["Does the IRP explain how privacy, clinical operations, and IT coordinate during patient-impacting incidents?"],
    expectedDecisions: ["Whether patient care continuity procedures need to be activated."],
  },
  Education: {
    scenarioContext: "Education context: consider student data, classroom operations, parent communications, and district or campus leadership.",
    executiveFocus: "Student privacy, school operations, and parent or guardian messaging should be handled carefully.",
    participants: ["Student Information System Owner", "Campus/District Administrator", "Family Communications Lead"],
    objectives: ["Validate how the organization protects learning operations and student data during the incident."],
    discussionQuestions: [
      "Which class, campus, or student service would notice the problem first?",
      "Who approves communication to students, parents, guardians, or staff?",
    ],
    gapQuestions: ["Does the IRP say how student privacy and school communications are handled during cyber incidents?"],
    expectedDecisions: ["Whether families, staff, or students need a plain-language update."],
  },
  "Financial Services": {
    scenarioContext: "Financial services context: keep fraud risk, transaction integrity, customer trust, and regulated records in view.",
    executiveFocus: "Customer trust, transaction controls, fraud exposure, and reporting duties are central to this exercise.",
    participants: ["Fraud/Risk Lead", "Customer Operations Lead", "Compliance Officer"],
    objectives: ["Validate how the team protects customer funds, records, and transaction integrity."],
    discussionQuestions: [
      "Which transaction, account, or customer process could be affected first?",
      "Who can approve a pause, hold, or extra verification step if fraud risk increases?",
    ],
    gapQuestions: ["Does the IRP define when compliance, fraud, and customer operations must be pulled in?"],
    expectedDecisions: ["Whether transaction holds, customer verification, or fraud controls should change."],
  },
  Manufacturing: {
    scenarioContext: "Manufacturing context: include production lines, OT or plant-floor systems, shipping deadlines, ERP access, and safety-sensitive downtime.",
    executiveFocus: "Production impact, safety, shipping commitments, and plant-floor dependencies should drive response priorities.",
    participants: ["Plant/Operations Manager", "OT or Facilities Lead", "Supply Chain/Shipping Lead"],
    objectives: ["Validate how cyber response decisions protect production, safety, and shipping commitments."],
    discussionQuestions: [
      "Which production, shipping, or inventory process would be affected first?",
      "Who can approve downtime or manual workarounds for plant-floor or ERP systems?",
    ],
    gapQuestions: ["Does the IRP explain how IT, OT, operations, and safety leaders make joint containment decisions?"],
    expectedDecisions: ["Whether production, shipping, or plant-floor systems should pause or move to a workaround."],
  },
  "Local Government": {
    scenarioContext: "Local government context: consider public services, elected leadership, records requests, law enforcement coordination, and resident communications.",
    executiveFocus: "Public service continuity, transparency, legal obligations, and resident trust should shape decisions.",
    participants: ["Public Services Lead", "Clerk/Records Lead", "Public Information Officer"],
    objectives: ["Validate how essential public services and official communications continue during the incident."],
    discussionQuestions: [
      "Which public service would residents notice first if the incident worsens?",
      "Who approves messages to elected officials, residents, or partner agencies?",
    ],
    gapQuestions: ["Does the IRP define how public records, elected officials, and public communications are handled?"],
    expectedDecisions: ["Whether essential public services need continuity procedures or public updates."],
  },
  Nonprofit: {
    scenarioContext: "Nonprofit context: include donor data, grant deadlines, volunteers, program delivery, limited staff capacity, and board visibility.",
    executiveFocus: "Donor trust, program continuity, volunteer coordination, and board communication are key leadership concerns.",
    participants: ["Program Director", "Development/Donor Relations Lead", "Board Liaison"],
    objectives: ["Validate how the organization protects donor trust and keeps critical programs running with limited capacity."],
    discussionQuestions: [
      "Which donor, volunteer, grant, or program activity would be affected first?",
      "Who can approve a public or board-facing update if facts are still incomplete?",
    ],
    gapQuestions: ["Does the IRP explain who handles donor, volunteer, board, and grant-related communication?"],
    expectedDecisions: ["Whether donor, board, volunteer, or grant stakeholders need an update."],
  },
  "Small Business": {
    scenarioContext: "Small business context: assume lean staffing, shared responsibilities, outsourced support, cash flow pressure, and limited backup coverage.",
    executiveFocus: "Business continuity, owner approval, customer trust, and realistic staffing limits should guide the exercise.",
    participants: ["Owner/General Manager", "Outside IT Provider", "Customer Operations Lead"],
    objectives: ["Validate a simple response path that works even when one person owns several roles."],
    discussionQuestions: [
      "Who is the first person allowed to make decisions if the owner or manager is unavailable?",
      "What can the team do immediately before outside IT support responds?",
    ],
    gapQuestions: ["Does the IRP work for a small team where people cover more than one role?"],
    expectedDecisions: ["Who can make urgent decisions when normal approvers are unavailable."],
  },
  "MSP / IT Provider": {
    scenarioContext: "MSP context: include client impact, tenant separation, service desk load, remote management tools, SLAs, and vendor communication.",
    executiveFocus: "Client trust, SLA impact, cross-client exposure, and tool integrity should drive leadership decisions.",
    participants: ["Service Desk Manager", "Client Success/Account Lead", "Remote Monitoring Tool Owner"],
    objectives: ["Validate how the provider protects clients while containing potential spread across shared tools."],
    discussionQuestions: [
      "Which clients, tenants, or shared management tools could be affected first?",
      "Who approves client notifications before full scope is confirmed?",
    ],
    gapQuestions: ["Does the IRP separate internal response steps from client notification and SLA obligations?"],
    expectedDecisions: ["Whether client notifications, tool restrictions, or tenant isolation steps are needed."],
  },
  Other: {
    scenarioContext: "General business context: focus on the processes, people, systems, and stakeholders most important to the organization.",
    executiveFocus: "Business impact, stakeholder trust, continuity, and decision ownership should guide the discussion.",
    participants: ["Business Process Owner", "Operations Lead"],
    objectives: ["Validate that response decisions reflect real business priorities, not only technical activity."],
    discussionQuestions: [
      "Which business process would feel the impact first?",
      "Who can explain the customer, employee, or partner impact in plain language?",
    ],
    gapQuestions: ["Does the IRP connect technical response steps to business decision-making?"],
    expectedDecisions: ["Which business process must be protected first."],
  },
};

const sizeProfiles: Record<ExerciseOptions["organizationSize"], ContextProfile> = {
  "1-25": {
    scenarioContext: "Size context: this is a very small team, so people may have multiple jobs and outside support may be needed quickly.",
    executiveFocus: "Keep the response realistic for a small staff with limited backup coverage.",
    participants: ["Owner or Executive Decision Maker", "Outside Counsel/Insurance Contact"],
    objectives: ["Confirm who can make urgent decisions when staff coverage is thin."],
    discussionQuestions: ["If the main decision maker is unavailable, who can keep the response moving?"],
    gapQuestions: ["Does the IRP name backups for the few people who hold critical responsibilities?"],
    expectedDecisions: ["Which outside support should be contacted first."],
  },
  "26-100": {
    scenarioContext: "Size context: this small organization likely needs simple escalation, clear handoffs, and practical communication owners.",
    executiveFocus: "Clarity and speed matter because the same leaders may own several response decisions.",
    participants: ["Operations Manager", "Department Lead"],
    objectives: ["Validate simple escalation and handoff points between business and IT roles."],
    discussionQuestions: ["Which manager needs to be looped in before the incident affects daily operations?"],
    gapQuestions: ["Does the IRP clearly define who backs up each response owner?"],
    expectedDecisions: ["Who owns business coordination while IT investigates."],
  },
  "101-500": {
    scenarioContext: "Size context: this mid-size organization likely has several departments, more formal approvals, and multiple business owners.",
    executiveFocus: "Cross-department coordination and approval authority should be tested.",
    participants: ["Business Continuity Lead", "Application Owner"],
    objectives: ["Validate coordination across departments, system owners, and leadership."],
    discussionQuestions: ["Which departments need a coordinated update before they take separate action?"],
    gapQuestions: ["Does the IRP define escalation between IT, business owners, legal, and communications?"],
    expectedDecisions: ["Which departments need immediate coordination."],
  },
  "501-1000": {
    scenarioContext: "Size context: this larger organization likely needs executive alignment, formal communications, legal review, and coordinated response tracking.",
    executiveFocus: "Leadership updates, legal review, and coordinated tracking are important at this scale.",
    participants: ["Business Continuity Manager", "Executive Communications Lead", "Risk Manager"],
    objectives: ["Validate enterprise coordination, leadership reporting, and response tracking."],
    discussionQuestions: ["What command or coordination structure should be activated if multiple teams are involved?"],
    gapQuestions: ["Does the IRP define how response status, decisions, and approvals are tracked across teams?"],
    expectedDecisions: ["Whether an incident coordination group or command structure should activate."],
  },
  "1000+": {
    scenarioContext: "Size context: this enterprise-scale organization likely has multiple sites, regions, vendors, business units, and formal response teams.",
    executiveFocus: "Enterprise coordination, regional impact, vendor dependencies, and executive governance should be tested.",
    participants: ["Enterprise Incident Commander", "Regional/Business Unit Lead", "Third-Party Risk Lead"],
    objectives: ["Validate enterprise command, regional coordination, vendor dependencies, and executive decision paths."],
    discussionQuestions: ["Which regions, business units, or vendors need to be coordinated before action is taken?"],
    gapQuestions: ["Does the IRP define enterprise escalation, regional authority, and third-party coordination?"],
    expectedDecisions: ["Whether enterprise incident command and regional coordination should activate."],
  },
};

export function generateExercise(options: ExerciseOptions): GeneratedExercise {
  const content = scenarioContent[options.scenarioType];
  const irpAnalysis = analyzeIrp(options.irpText ?? "", options.irpFileName);
  const tailoredIrpQuestions = getTailoredIrpQuestions(irpAnalysis);
  const industryProfile = industryProfiles[options.industry];
  const sizeProfile = sizeProfiles[options.organizationSize];
  const participants = uniqueStrings([...baseParticipants, ...industryProfile.participants, ...sizeProfile.participants]);
  const id = crypto.randomUUID();
  const questionLimit = getQuestionLimit(options);

  if (options.industry === "MSP / IT Provider" || options.scenarioType === "Vendor / Third-Party Breach") {
    participants.push("Vendor/MSP Contact");
  }

  const discussionQuestions = buildQuestionSet(
    [
      ...tailoredIrpQuestions.discussionQuestions,
      ...industryProfile.discussionQuestions,
      ...sizeProfile.discussionQuestions,
      ...content.discussionQuestions,
      ...(options.includeExecutiveQuestions ? content.executiveQuestions : []),
      ...(options.includeTechnicalQuestions ? content.technicalQuestions : []),
    ],
    `${id}:discussion:${options.scenarioType}`,
    questionLimit,
  );

  const gapDiscoveryQuestions = buildQuestionSet(
    [
      ...tailoredIrpQuestions.gapQuestions,
      ...industryProfile.gapQuestions,
      ...sizeProfile.gapQuestions,
      ...content.gapQuestions,
      ...(options.includeComplianceQuestions ? content.complianceQuestions : []),
    ],
    `${id}:gaps:${options.scenarioType}`,
    questionLimit,
  );

  const generatedAt = new Date().toISOString();
  const organization = options.organizationName.trim();
  const customScenarioDetails = options.customScenarioDetails?.trim();
  const overview = {
    organization,
    industry: options.industry,
    organizationSize: options.organizationSize,
    scenario: options.scenarioType,
    duration: options.exerciseDuration,
    maturityLevel: options.maturityLevel,
    hasHumanFacilitator: false,
    purpose: buildPurpose(organization, options),
  };

  const exerciseWithoutMarkdown = {
    id,
    generatedAt,
    overview,
    scenarioSummary: [
      content.summary({ ...options, organizationName: organization }),
      industryProfile.scenarioContext,
      sizeProfile.scenarioContext,
      customScenarioDetails ? `Additional exercise context: ${customScenarioDetails}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    customScenarioDetails,
    objectives: tuneByMaturity(
      [
        ...(irpAnalysis ? ["Validate whether known IRP gaps would slow or weaken the response."] : []),
        ...industryProfile.objectives,
        ...sizeProfile.objectives,
        ...content.objectives,
      ],
      options.maturityLevel,
    ),
    suggestedParticipants: uniqueStrings(participants),
    discussionQuestions,
    gapDiscoveryQuestions,
    expectedDecisions: uniqueStrings([...industryProfile.expectedDecisions, ...sizeProfile.expectedDecisions, ...content.expectedDecisions]),
    facilitatorNotes,
    irpAnalysis,
    lessonsLearnedTemplate: options.includeLessonsLearned ? lessonsLearnedTemplate : undefined,
    executiveSummary: `${organization} will walk through a realistic ${options.scenarioType.toLowerCase()} tabletop exercise designed for ${options.industry.toLowerCase()} organizations with ${options.organizationSize} employees. ${industryProfile.executiveFocus} ${sizeProfile.executiveFocus} The discussion should reveal whether the incident response plan clearly defines escalation, containment authority, communications, evidence handling, and after-action ownership.${customScenarioDetails ? " The custom scenario context has been included in the scenario summary and should guide discussion examples." : ""}${irpAnalysis ? ` The uploaded IRP scan found ${irpAnalysis.findings.filter((finding) => finding.status !== "found").length} likely weak or missing areas, so the questions emphasize those plan gaps.` : ""}`,
  };

  const markdownReport = createMarkdownReport(exerciseWithoutMarkdown);

  return {
    ...exerciseWithoutMarkdown,
    markdownReport,
  };
}

function buildPurpose(organization: string, options: ExerciseOptions) {
  const maturityStyle: Record<ExerciseOptions["maturityLevel"], string> = {
    Basic: "using plain-language, non-technical discussion that helps mixed audiences participate comfortably",
    Intermediate: "with practical decision-making, role clarity, and business impact discussion",
    Advanced: "with deeper evidence, approval, compliance, and business-continuity pressure",
  };

  return `Help ${organization} validate incident response roles, communications, evidence expectations, and decision authority for a ${options.scenarioType.toLowerCase()} scenario ${maturityStyle[options.maturityLevel]}.`;
}

function buildQuestionSet(questions: string[], seed: string, limit: number) {
  return seededShuffle(uniqueStrings(questions), seed).slice(0, limit);
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items));
}

function getQuestionLimit(options: ExerciseOptions) {
  const durationBase: Record<ExerciseOptions["exerciseDuration"], number> = {
    "30 minutes": 8,
    "60 minutes": 10,
    "90 minutes": 12,
    "2 hours": 14,
  };
  const maturityAdjustment: Record<ExerciseOptions["maturityLevel"], number> = {
    Basic: -1,
    Intermediate: 0,
    Advanced: 2,
  };

  return Math.max(6, Math.min(16, durationBase[options.exerciseDuration] + maturityAdjustment[options.maturityLevel]));
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
    "- Session mode: TabletopForge facilitated",
    `- Purpose: ${exercise.overview.purpose}`,
    "",
    "## Scenario Summary",
    exercise.scenarioSummary,
    "",
    ...(exercise.customScenarioDetails ? ["## Custom Scenario Details", exercise.customScenarioDetails, ""] : []),
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
