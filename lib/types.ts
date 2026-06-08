export const industries = [
  "Healthcare",
  "Education",
  "Financial Services",
  "Manufacturing",
  "Local Government",
  "Nonprofit",
  "Small Business",
  "MSP / IT Provider",
  "Other",
] as const;

export const organizationSizes = [
  "1-25",
  "26-100",
  "101-500",
  "501-1000",
  "1000+",
] as const;

export const scenarioTypes = [
  "Phishing / Business Email Compromise",
  "Ransomware",
  "Data Exfiltration",
  "Compromised Admin Account",
  "Lost or Stolen Laptop",
  "Vendor / Third-Party Breach",
  "Insider Threat",
  "Cloud Misconfiguration",
] as const;

export const maturityLevels = ["Basic", "Intermediate", "Advanced"] as const;
export const exerciseDurations = ["30 minutes", "60 minutes", "90 minutes", "2 hours"] as const;

export type Industry = (typeof industries)[number];
export type OrganizationSize = (typeof organizationSizes)[number];
export type ScenarioType = (typeof scenarioTypes)[number];
export type MaturityLevel = (typeof maturityLevels)[number];
export type ExerciseDuration = (typeof exerciseDurations)[number];

export interface ExerciseOptions {
  organizationName: string;
  industry: Industry;
  organizationSize: OrganizationSize;
  scenarioType: ScenarioType;
  maturityLevel: MaturityLevel;
  exerciseDuration: ExerciseDuration;
  includeExecutiveQuestions: boolean;
  includeTechnicalQuestions: boolean;
  includeComplianceQuestions: boolean;
  includeLessonsLearned: boolean;
  hasHumanFacilitator: boolean;
  irpText?: string;
  irpFileName?: string;
}

export interface LessonsLearnedItem {
  prompt: string;
  owner?: string;
  dueDate?: string;
  priority?: string;
}

export interface GeneratedExercise {
  id: string;
  generatedAt: string;
  overview: {
    organization: string;
    industry: Industry;
    organizationSize: OrganizationSize;
    scenario: ScenarioType;
    duration: ExerciseDuration;
    maturityLevel: MaturityLevel;
    hasHumanFacilitator: boolean;
    purpose: string;
  };
  scenarioSummary: string;
  objectives: string[];
  suggestedParticipants: string[];
  discussionQuestions: string[];
  gapDiscoveryQuestions: string[];
  expectedDecisions: string[];
  facilitatorNotes: string[];
  irpAnalysis?: IrpAnalysis;
  lessonsLearnedTemplate?: LessonsLearnedItem[];
  executiveSummary: string;
  markdownReport: string;
}

export interface IrpGapFinding {
  id: string;
  label: string;
  status: "found" | "weak" | "missing";
  summary: string;
  evidence: string[];
  tailoredQuestions: string[];
  improvement: string;
}

export interface IrpAnalysis {
  sourceName?: string;
  analyzedAt: string;
  wordCount: number;
  overallSummary: string;
  strengths: string[];
  findings: IrpGapFinding[];
}

export interface SessionScoreCategory {
  id: "escalation" | "containment" | "communications" | "evidence" | "recovery" | "irpCoverage";
  label: string;
  score: number | null;
  summary: string;
}

export interface CompletedSessionDecision {
  stepTitle: string;
  decision: string;
  decided: boolean;
}

export interface CompletedSessionInject {
  stepTitle: string;
  text: string;
}

export interface AiSessionContext {
  schemaVersion: "tabletopforge.session.v1";
  exerciseId: string;
  organization: string;
  scenario: ScenarioType;
  maturityLevel: MaturityLevel;
  hasIrpAnalysis: boolean;
  irpFindings: Array<{
    id: string;
    label: string;
    status: IrpGapFinding["status"];
    summary: string;
  }>;
  decisions: CompletedSessionDecision[];
  revealedInjects: CompletedSessionInject[];
  unresolvedUnknowns: string[];
  sessionNotes: string;
  actionItems: string;
}

export interface CompletedSession {
  id: string;
  exerciseId: string;
  completedAt: string;
  organization: string;
  scenario: ScenarioType;
  overallScore: number;
  categoryScores: SessionScoreCategory[];
  strengths: string[];
  gaps: string[];
  unresolvedUnknowns: string[];
  recommendedNextTabletop: string;
  decisions: CompletedSessionDecision[];
  revealedInjects: CompletedSessionInject[];
  sessionNotes: string;
  actionItems: string;
  aiContext: AiSessionContext;
  markdownReport: string;
}
