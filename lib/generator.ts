import { scenarioContent } from "@/lib/tabletop-data";
import { analyzeIrp, getTailoredIrpQuestions } from "@/lib/irp-analyzer";
import type { ExerciseOptions, GeneratedExercise, LessonsLearnedItem, StarterIrpTemplate } from "@/lib/types";

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
    scenarioContext: "MSP context: the organization is the provider serving client environments. Include client impact, tenant separation, service desk load, remote management tools, SLAs, upstream software vendors, and client communication.",
    executiveFocus: "Client trust, SLA impact, cross-client exposure, shared tool integrity, and account ownership should drive leadership decisions.",
    participants: ["Service Desk Manager", "Client Success/Account Lead", "Remote Monitoring Tool Owner", "Client Account Owner"],
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
  const irpAnalysis = analyzeIrp(options.irpText ?? "", options.irpFileName, options.noIrp ? options.organizationStructure : undefined);
  const tailoredIrpQuestions = getTailoredIrpQuestions(irpAnalysis);
  const industryProfile = industryProfiles[options.industry];
  const sizeProfile = sizeProfiles[options.organizationSize];
  const id = crypto.randomUUID();
  const organization = options.organizationName.trim();
  const scenarioSeed = `${id}:${options.scenarioType}:${options.industry}:${options.organizationSize}:${options.maturityLevel}`;
  const contextualQuestions = buildContextualQuestions(options, irpAnalysis);
  const contextualGapQuestions = buildContextualGapQuestions(options, irpAnalysis);
  const contextualDecisions = buildContextualDecisions(options, irpAnalysis);
  const starterIrpTemplate = options.noIrp ? buildStarterIrpTemplate(options, organization) : undefined;
  const structureRoles = irpAnalysis?.organizationStructure?.detectedRoles ?? [];
  const participants = structureRoles.length > 0
    ? uniqueStrings(structureRoles)
    : uniqueStrings([...baseParticipants, ...industryProfile.participants, ...sizeProfile.participants]);
  const questionLimit = getQuestionLimit(options);

  if (options.scenarioType === "Vendor / Third-Party Breach") {
    addIfAllowed(participants, "Vendor/MSP Contact", structureRoles);
  }

  if (options.industry === "MSP / IT Provider") {
    addIfAllowed(participants, "Affected Client Representative", structureRoles);
    addIfAllowed(participants, "Upstream Software Vendor Contact", structureRoles);
  }

  const discussionQuestions = buildQuestionSet(
    [
      ...tailoredIrpQuestions.discussionQuestions,
      ...contextualQuestions,
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
      ...contextualGapQuestions,
      ...industryProfile.gapQuestions,
      ...sizeProfile.gapQuestions,
      ...content.gapQuestions,
      ...(options.includeComplianceQuestions ? content.complianceQuestions : []),
    ],
    `${id}:gaps:${options.scenarioType}`,
    questionLimit,
  );

  const generatedAt = new Date().toISOString();
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
      buildScenarioVariation(options, scenarioSeed),
      industryProfile.scenarioContext,
      sizeProfile.scenarioContext,
      buildMaturityContext(options.maturityLevel, irpAnalysis),
      buildIrpPressureContext(options, irpAnalysis),
      buildStructureContext(options, irpAnalysis),
      options.noIrp ? "No IRP is currently available, so the exercise should capture decisions that can become a starter incident response plan." : "",
      customScenarioDetails ? `Additional exercise context: ${customScenarioDetails}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    customScenarioDetails,
    objectives: tuneByMaturity(
      [
        ...(irpAnalysis ? ["Validate whether known IRP gaps would slow or weaken the response."] : []),
        ...(starterIrpTemplate ? ["Create starter IRP content from the roles, decisions, contacts, and gaps discovered during the tabletop."] : []),
        ...buildContextualObjectives(options, irpAnalysis),
        ...industryProfile.objectives,
        ...sizeProfile.objectives,
        ...content.objectives,
      ],
      options.maturityLevel,
    ),
    suggestedParticipants: uniqueStrings(participants),
    discussionQuestions,
    gapDiscoveryQuestions,
    expectedDecisions: uniqueStrings([...contextualDecisions, ...industryProfile.expectedDecisions, ...sizeProfile.expectedDecisions, ...content.expectedDecisions]),
    facilitatorNotes,
    irpAnalysis,
    starterIrpTemplate,
    lessonsLearnedTemplate: options.includeLessonsLearned ? lessonsLearnedTemplate : undefined,
    executiveSummary: `${organization} will walk through a realistic ${options.scenarioType.toLowerCase()} tabletop exercise designed for ${options.industry.toLowerCase()} organizations with ${options.organizationSize} employees. ${industryProfile.executiveFocus} ${sizeProfile.executiveFocus} The discussion should reveal whether the incident response plan clearly defines escalation, containment authority, communications, evidence handling, and after-action ownership.${customScenarioDetails ? " The custom scenario context has been included in the scenario summary and should guide discussion examples." : ""}${irpAnalysis ? ` The uploaded IRP scan found ${irpAnalysis.findings.filter((finding) => finding.status !== "found").length} likely weak or missing areas, so the questions emphasize those plan gaps.` : ""}${options.noIrp ? " Because no IRP is available, the final report will include a starter IRP outline built from the exercise decisions." : ""}`,
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

function buildStarterIrpTemplate(options: ExerciseOptions, organization: string): StarterIrpTemplate {
  const scenario = options.scenarioType.toLowerCase();
  const industry = options.industry.toLowerCase();

  return {
    generatedBecause: "No incident response plan was uploaded. This starter outline should be completed and reviewed after the tabletop; it is not a substitute for legal, regulatory, or security review.",
    sections: [
      {
        title: "Purpose and Scope",
        purpose: "Define what the plan covers and when it applies.",
        draftText: `${organization} will use this incident response plan to prepare for, detect, coordinate, contain, recover from, and learn from cybersecurity incidents affecting its people, systems, data, clients, vendors, or operations.`,
        fillIn: [
          "Systems, locations, business processes, and data types covered by the plan",
          `Industry-specific obligations for a ${industry} organization`,
          "Who owns annual review and updates",
        ],
      },
      {
        title: "Incident Roles and Contact Tree",
        purpose: "Make ownership obvious before pressure starts.",
        draftText: "The organization should name a primary incident coordinator, backup coordinator, technical lead, business owner, communications owner, executive approver, legal/compliance contact, and outside support contacts.",
        fillIn: [
          "Primary and backup names with phone/email",
          "Outside IT, cloud, software, cyber insurance, legal, law enforcement, and regulator contacts as applicable",
          "After-hours approval path",
        ],
      },
      {
        title: "Severity Levels and Escalation",
        purpose: "Help the team decide when an event becomes a formal incident.",
        draftText: "Incidents should be classified by operational impact, data sensitivity, number of affected users or clients, legal/compliance exposure, financial impact, and public/customer visibility.",
        fillIn: [
          "Low, medium, high, and critical definitions",
          "Who can declare each level",
          "What each level activates",
        ],
      },
      {
        title: "Detection, Reporting, and First 30 Minutes",
        purpose: "Give non-technical staff a simple path to report concerns.",
        draftText: `For a suspected ${scenario} event, staff should report what they saw, when it happened, who is affected, screenshots or message details if safe, and any business impact. The team should avoid deleting evidence or taking unapproved disruptive action.`,
        fillIn: [
          "Report intake channel",
          "Minimum facts to collect",
          "What staff should not do",
        ],
      },
      {
        title: "Evidence Preservation",
        purpose: "Balance fast containment with preserving facts needed later.",
        draftText: "The response team should document timeline, affected accounts/systems, logs reviewed, screenshots, communications, actions taken, approvals, and custody of exported evidence.",
        fillIn: [
          "Log sources and retention periods",
          "Who may collect/export evidence",
          "Where evidence is stored",
        ],
      },
      {
        title: "Containment, Recovery, and Communications",
        purpose: "Define who can act and who must approve messaging.",
        draftText: "Containment and recovery actions should be approved based on severity, business impact, evidence risk, and legal/compliance needs. Communications should separate confirmed facts from assumptions.",
        fillIn: [
          "Containment actions allowed without approval",
          "Recovery validation steps",
          "Internal, customer/client, regulator, media, and leadership update owners",
        ],
      },
      {
        title: "Post-Incident Review and Improvement",
        purpose: "Turn lessons learned into plan updates.",
        draftText: "After each incident or tabletop, the organization should document what happened, what decisions were made, what was unclear, what slowed response, and which plan updates are needed.",
        fillIn: [
          "After-action meeting owner",
          "Action item tracker",
          "Retest schedule",
        ],
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

const scenarioVariationBank: Record<ExerciseOptions["scenarioType"], string[]> = {
  "Phishing / Business Email Compromise": [
    "The suspicious message references a real project, so participants must decide whether this is impersonation, account compromise, or vendor thread hijacking.",
    "The request arrives during a busy period, making it harder to separate fraud urgency from routine business pressure.",
    "The suspected sender is a trusted executive account, but the first technical signals are incomplete.",
    "Several employees received similar wording, but only one person has confirmed clicking the link.",
  ],
  Ransomware: [
    "The first report appears isolated, but the affected file path supports a business process that other teams depend on.",
    "The ransom note appears before the team knows whether backups are clean, forcing containment and recovery decisions to compete.",
    "File renaming starts in a shared workspace that mixes operational files with sensitive records.",
    "The event begins near a shift change or staffing handoff, making ownership and escalation less obvious.",
  ],
  "Data Exfiltration": [
    "The outbound transfer could be malicious or a legitimate business export, so the group must validate context before blocking activity.",
    "The affected folder has unclear data ownership, forcing legal, business, and IT teams to define who can classify impact.",
    "The alert includes enough evidence to create concern but not enough to prove notification impact.",
    "The suspected transfer overlaps with a partner workflow, making containment risky without business confirmation.",
  ],
  "Compromised Admin Account": [
    "The privileged activity resembles an emergency change, but no matching approval record is immediately available.",
    "The administrator account may touch multiple systems, so containment could disrupt operations before scope is known.",
    "The first suspicious action is a permission change, not a clearly malicious command.",
    "The team must decide whether to trust existing administrator access while evidence is still being preserved.",
  ],
  "Lost or Stolen Laptop": [
    "The missing device belongs to someone with access to sensitive business records and several cloud applications.",
    "The employee delayed reporting because they were still searching for the laptop.",
    "The device inventory has partial data, so encryption and last check-in status are not immediately clear.",
    "The device may contain synced files, but no one knows which folders were available offline.",
  ],
  "Vendor / Third-Party Breach": [
    "The vendor notice is vague, and the organization must decide what questions to ask before customer impact is known.",
    "The vendor supports a workflow that cannot easily be paused without business disruption.",
    "The contract owner and technical owner have different views of the vendor's criticality.",
    "The vendor provides status updates on its timeline, not the organization's decision timeline.",
  ],
  "Insider Threat": [
    "The suspicious activity involves an employee whose access is still needed for normal operations.",
    "The team must coordinate quietly with HR and legal while preserving evidence.",
    "The behavior could be policy violation, malicious activity, or a misunderstood business need.",
    "A manager wants quick action, but the evidence threshold and communication limits are unclear.",
  ],
  "Cloud Misconfiguration": [
    "The cloud setting may have been exposed by a routine deployment, but access logs are incomplete.",
    "The exposed location supports an integration, so closing access immediately could break operations.",
    "A third party reports the exposure before internal teams have confirmed the facts.",
    "The resource owner is unclear, forcing the group to identify who owns data, application, and cloud controls.",
  ],
};

function buildScenarioVariation(options: ExerciseOptions, seed: string) {
  const variant = seededChoice(scenarioVariationBank[options.scenarioType], `${seed}:variant`);
  return `Scenario variation: ${variant} ${buildBusinessImpactContext(options)} ${buildSizeConstraint(options.organizationSize)}`;
}

function buildBusinessImpactContext(options: ExerciseOptions) {
  const industryImpact: Record<ExerciseOptions["industry"], string> = {
    Healthcare: "Patient care continuity, EHR access, privacy review, and clinical workarounds should be part of the discussion.",
    Education: "Student services, classroom disruption, parent or guardian communication, and student privacy should be part of the discussion.",
    "Financial Services": "Transaction integrity, fraud controls, customer trust, and regulated records should be part of the discussion.",
    Manufacturing: "Production schedules, plant-floor dependencies, ERP access, safety, and shipping commitments should be part of the discussion.",
    "Local Government": "Public services, elected leadership, records obligations, and resident communication should be part of the discussion.",
    Nonprofit: "Program delivery, donor trust, volunteer coordination, grant deadlines, and board visibility should be part of the discussion.",
    "Small Business": "Customer trust, cash flow, outsourced IT support, and thin staff coverage should be part of the discussion.",
    "MSP / IT Provider": "Client impact, shared tools, tenant separation, service desk volume, and SLA commitments should be part of the discussion.",
    Other: "The most important business process, stakeholder trust, and operational dependencies should be part of the discussion.",
  };

  return industryImpact[options.industry];
}

function buildSizeConstraint(size: ExerciseOptions["organizationSize"]) {
  const constraints: Record<ExerciseOptions["organizationSize"], string> = {
    "1-25": "Because the team is very small, one unavailable person can block ownership, vendor contact, and approval.",
    "26-100": "Because the team is small, escalation has to stay simple and backup owners matter.",
    "101-500": "Because multiple departments are involved, coordination and consistent status tracking matter.",
    "501-1000": "Because leadership, legal, communications, and business owners may split across teams, formal coordination matters.",
    "1000+": "Because this is enterprise scale, regional authority, business unit impact, vendor dependencies, and command structure matter.",
  };

  return constraints[size];
}

function buildMaturityContext(maturity: ExerciseOptions["maturityLevel"], analysis?: GeneratedExercise["irpAnalysis"]) {
  if (maturity === "Basic") {
    return "Difficulty context: this is built for non-technical participants. Keep the exercise focused on who to call, what to write down, what decision is needed, and what business impact matters.";
  }

  if (maturity === "Advanced") {
    const topGap = analysis?.findings.find((finding) => finding.status !== "found");
    return `Difficulty context: this advanced exercise should create pressure around evidence, authority, communication approvals, legal/compliance review, and business continuity.${topGap ? ` The hardest pressure point should be the IRP gap around ${topGap.label.toLowerCase()}.` : ""}`;
  }

  return "Difficulty context: this intermediate exercise should mix plain-language facilitation with practical decisions about escalation, containment, communications, and ownership.";
}

function buildIrpPressureContext(options: ExerciseOptions, analysis?: GeneratedExercise["irpAnalysis"]) {
  if (!analysis) {
    return options.maturityLevel === "Basic"
      ? "No IRP was uploaded, so the exercise should help participants identify what they wish the plan told them."
      : "No IRP was uploaded, so unresolved answers should become plan-building action items.";
  }

  const gaps = analysis.findings.filter((finding) => finding.status !== "found");
  if (gaps.length === 0) {
    return "IRP context: the uploaded IRP appears to cover the major response areas, so the exercise should validate whether the documented plan works under time pressure.";
  }

  const selectedGaps = gaps.slice(0, options.maturityLevel === "Advanced" ? 4 : 2).map((finding) => finding.label.toLowerCase());
  return `IRP context: the exercise should deliberately test weak or missing plan areas: ${selectedGaps.join(", ")}.`;
}

function buildStructureContext(options: ExerciseOptions, analysis?: GeneratedExercise["irpAnalysis"]) {
  const structure = analysis?.organizationStructure;
  if (!structure || structure.detectedRoles.length === 0) {
    return "";
  }

  const roles = structure.detectedRoles.join(", ");
  if (options.noIrp) {
    return `Organization structure supplied by user: ${roles}. Use these roles for participants and decision owners. If a needed role is missing, ask who should own it instead of inventing a title.`;
  }

  return `IRP role structure detected: ${roles}. Use only those listed roles when naming participants or decision owners. If a common role such as CFO, legal, communications, or HR is not listed, call that out as a gap instead of adding the role.`;
}

function buildContextualObjectives(options: ExerciseOptions, analysis?: GeneratedExercise["irpAnalysis"]) {
  const objectives = [
    `Validate response decisions for a ${options.industry.toLowerCase()} organization with ${options.organizationSize} employees.`,
    `Confirm the exercise stays at an appropriate ${options.maturityLevel.toLowerCase()} difficulty level.`,
  ];

  if (options.organizationSize === "1-25") {
    objectives.push("Confirm which outside provider, legal, insurance, or leadership contact can help when internal staff are limited.");
  } else if (options.organizationSize === "1000+") {
    objectives.push("Validate enterprise coordination across regions, business units, vendors, and executive decision paths.");
  }

  const gaps = analysis?.findings.filter((finding) => finding.status !== "found").slice(0, 2) ?? [];
  objectives.push(...gaps.map((finding) => `Pressure-test the IRP gap for ${finding.label.toLowerCase()}.`));

  return objectives;
}

function buildContextualQuestions(options: ExerciseOptions, analysis?: GeneratedExercise["irpAnalysis"]) {
  const questions = [
    buildSizeQuestion(options.organizationSize),
    buildIndustryQuestion(options.industry, options.scenarioType),
    buildMaturityQuestion(options.maturityLevel),
  ];

  if (options.maturityLevel === "Advanced") {
    questions.push(...buildAdvancedGapQuestions(analysis));
  }

  if (options.maturityLevel === "Basic") {
    questions.push("In plain language, what happened, who needs to know, and what should be written down first?");
  }

  if (options.noIrp) {
    questions.unshift(
      analysis?.organizationStructure?.detectedRoles.length
        ? `Using only the supplied structure (${analysis.organizationStructure.detectedRoles.join(", ")}), who would coordinate the response first?`
        : "If this happened today with no written IRP, who would coordinate the response first?",
      "What facts would the team need before deciding whether this is a formal incident?",
      "Which contact names, backup contacts, vendors, legal/compliance contacts, and leadership approvals should be written into a starter IRP?",
    );
  }

  return questions;
}

function buildContextualGapQuestions(options: ExerciseOptions, analysis?: GeneratedExercise["irpAnalysis"]) {
  const questions = [
    `Does the IRP explain how a ${options.industry.toLowerCase()} organization of ${options.organizationSize} employees should handle this exact scenario?`,
  ];

  if (options.maturityLevel === "Basic") {
    questions.push("Could a non-technical employee understand who to call and what to report from the current plan?");
  } else if (options.maturityLevel === "Advanced") {
    questions.push("Which IRP gap would create the largest delay if the incident escalated in the next 15 minutes?");
  }

  const gaps = analysis?.findings.filter((finding) => finding.status !== "found").slice(0, 3) ?? [];
  questions.push(...gaps.map((finding) => `What would fail first if the IRP gap for ${finding.label.toLowerCase()} appeared during this scenario?`));

  if (options.noIrp) {
    questions.unshift(
      "What minimum IRP sections must be drafted before the organization can run this exercise again?",
      "Which incident severity levels, escalation thresholds, and decision owners need to be defined first?",
      "What evidence, notification, communications, and recovery steps are currently only tribal knowledge?",
    );
  }

  return questions;
}

function buildContextualDecisions(options: ExerciseOptions, analysis?: GeneratedExercise["irpAnalysis"]) {
  const decisions = [
    buildSizeDecision(options.organizationSize),
    buildIndustryDecision(options.industry, options.scenarioType),
  ];

  if (options.maturityLevel === "Basic") {
    decisions.push("Who is the first plain-language contact for non-technical staff?");
  } else if (options.maturityLevel === "Advanced") {
    decisions.push("Which high-impact action needs documented authority before the team proceeds?");
    decisions.push("Which IRP gap should be treated as the highest-priority risk?");
  }

  const topGap = analysis?.findings.find((finding) => finding.status !== "found");
  if (topGap) {
    decisions.push(`Who owns the ${topGap.label.toLowerCase()} gap after the exercise?`);
  }

  if (options.noIrp) {
    decisions.unshift(
      "Who owns the starter IRP after this tabletop?",
      "Which severity threshold would activate leadership, legal, communications, and outside support?",
      "Which response steps must be documented before the next exercise?",
    );
  }

  return decisions;
}

function addIfAllowed(participants: string[], role: string, structureRoles: string[]) {
  if (structureRoles.length === 0) {
    participants.push(role);
  }
}

function buildSizeQuestion(size: ExerciseOptions["organizationSize"]) {
  const questions: Record<ExerciseOptions["organizationSize"], string> = {
    "1-25": "If the only technical owner is unavailable, what outside support keeps the response moving?",
    "26-100": "Which backup owner can make decisions if the normal manager is unavailable?",
    "101-500": "Which departments need the same update before they make separate decisions?",
    "501-1000": "Who activates the coordination structure and tracks decisions across teams?",
    "1000+": "Which regions, business units, vendors, or shared services need coordinated authority before action is taken?",
  };

  return questions[size];
}

function buildIndustryQuestion(industry: ExerciseOptions["industry"], scenario: ExerciseOptions["scenarioType"]) {
  const industryQuestions: Record<ExerciseOptions["industry"], string> = {
    Healthcare: `How does this ${scenario.toLowerCase()} scenario affect patient care continuity or protected information?`,
    Education: `How does this ${scenario.toLowerCase()} scenario affect students, families, classroom operations, or student privacy?`,
    "Financial Services": `How does this ${scenario.toLowerCase()} scenario affect transactions, customer trust, fraud risk, or regulated records?`,
    Manufacturing: `How does this ${scenario.toLowerCase()} scenario affect production, safety, ERP access, shipping, or plant-floor operations?`,
    "Local Government": `How does this ${scenario.toLowerCase()} scenario affect public services, elected leadership, records, or residents?`,
    Nonprofit: `How does this ${scenario.toLowerCase()} scenario affect programs, donors, volunteers, grants, or board communication?`,
    "Small Business": `How does this ${scenario.toLowerCase()} scenario affect customers, cash flow, outsourced support, or owner decisions?`,
    "MSP / IT Provider": `How does this ${scenario.toLowerCase()} scenario affect clients, tenants, shared tools, SLAs, or service desk load?`,
    Other: `How does this ${scenario.toLowerCase()} scenario affect the most important business process?`,
  };

  return industryQuestions[industry];
}

function buildMaturityQuestion(maturity: ExerciseOptions["maturityLevel"]) {
  const questions: Record<ExerciseOptions["maturityLevel"], string> = {
    Basic: "What is the simplest safe next step the group can explain without technical language?",
    Intermediate: "What decision would change if the scope or business impact increases?",
    Advanced: "What evidence, authority, approval, or notification threshold would change the response plan?",
  };

  return questions[maturity];
}

function buildAdvancedGapQuestions(analysis?: GeneratedExercise["irpAnalysis"]) {
  const gaps = analysis?.findings.filter((finding) => finding.status !== "found").slice(0, 4) ?? [];
  return gaps.map((finding) => `${finding.label}: ${finding.tailoredQuestions[0]}`);
}

function buildSizeDecision(size: ExerciseOptions["organizationSize"]) {
  const decisions: Record<ExerciseOptions["organizationSize"], string> = {
    "1-25": "Which outside support is contacted first if internal coverage is thin?",
    "26-100": "Who is the backup decision maker if the primary owner is unavailable?",
    "101-500": "Which departments need coordinated status tracking?",
    "501-1000": "Whether formal incident coordination should be activated.",
    "1000+": "Whether enterprise incident command, regional coordination, or vendor governance should activate.",
  };

  return decisions[size];
}

function buildIndustryDecision(industry: ExerciseOptions["industry"], scenario: ExerciseOptions["scenarioType"]) {
  const decisions: Record<ExerciseOptions["industry"], string> = {
    Healthcare: "Whether patient care continuity, privacy review, or clinical downtime procedures should activate.",
    Education: "Whether school operations, family communication, or student privacy review should activate.",
    "Financial Services": "Whether transaction controls, fraud review, or customer communication should change.",
    Manufacturing: "Whether production, plant-floor, shipping, ERP, or safety workarounds should activate.",
    "Local Government": "Whether essential public service continuity or resident communication should activate.",
    Nonprofit: "Whether program, donor, board, volunteer, or grant stakeholders need an update.",
    "Small Business": "Whether customer-facing work, cash-flow protection, or outside IT escalation should take priority.",
    "MSP / IT Provider": "Whether client notification, tenant isolation, or shared tool restrictions should activate.",
    Other: `Which business process must be protected first during the ${scenario.toLowerCase()} scenario.`,
  };

  return decisions[industry];
}

function seededChoice(items: string[], seed: string) {
  return seededShuffle(items, seed)[0] ?? "";
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
    starterIrpTemplateSection(exercise.starterIrpTemplate),
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

function starterIrpTemplateSection(template: GeneratedExercise["starterIrpTemplate"]) {
  if (!template) {
    return "";
  }

  const lines = [
    "## Starter IRP Template",
    template.generatedBecause,
    "",
  ];

  template.sections.forEach((section) => {
    lines.push(`### ${section.title}`);
    lines.push(`Purpose: ${section.purpose}`);
    lines.push("");
    lines.push(section.draftText);
    lines.push("");
    lines.push("Fill in:");
    section.fillIn.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  });

  lines.push("### Missing Inputs To Collect");
  template.missingInputs.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("### Next Steps");
  template.nextSteps.forEach((item) => lines.push(`- ${item}`));
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
