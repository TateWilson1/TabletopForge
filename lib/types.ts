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
