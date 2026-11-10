// Types for the shared simulation engine in backend/src/sim (plain JS, shared with the API).

export type SimChannel = "email" | "siem" | "chat" | "phone" | "news" | "ticket" | "ransom_note" | "social" | "regulator" | "briefing";
export type DecisionQuality = "strong" | "acceptable" | "risky";
export type MeterId = "containment" | "operations" | "trust" | "compliance";
export type Meters = Record<MeterId, number>;

export interface SimRole {
  id: string;
  title: string;
  focus: string;
}

export interface SimPhase {
  id: string;
  name: string;
  objective: string;
}

export interface Simulation {
  schemaVersion: "tabletopforge.sim.v1";
  id: string;
  source: "library" | "ai";
  title: string;
  organization: string;
  industry: string;
  organizationSize: string;
  scenarioType: string;
  maturityLevel: string;
  durationMinutes: number;
  briefing: string;
  groundRules: string[];
  roles: SimRole[];
  phases: SimPhase[];
  injects: unknown[];
}

export type RoomState = Record<string, unknown> & { status: "lobby" | "running" | "ended" };

export type Actor = { kind: "facilitator" } | { kind: "participant"; id: string };

export type RoomAction =
  | { type: "join"; name: string; roleId?: string }
  | { type: "setRole"; roleId: string; participantId?: string }
  | { type: "removeParticipant"; participantId: string }
  | { type: "start" }
  | { type: "advance" }
  | { type: "vote"; injectId: string; optionId: string; rationale?: string }
  | { type: "commit"; injectId: string; optionId?: string }
  | { type: "skipDecision"; injectId: string }
  | { type: "share"; injectId: string }
  | { type: "curveball"; inject: { title: string; body: string; channel?: SimChannel; sender?: string } }
  | { type: "note"; text: string; kind: "observation" | "gap" | "action" }
  | { type: "end" };

export interface ViewOption {
  id: string;
  label: string;
  votes?: number;
  quality?: DecisionQuality;
}

export interface ViewDecision {
  prompt: string;
  ownerRoleId: string;
  capability: string;
  csf: string;
  timeLimitSeconds: number;
  open: boolean;
  options: ViewOption[];
  myVote: string;
  voterCount: number;
  rationales: Array<{ by: string; optionId: string; text: string }>;
  outcome: {
    optionId: string;
    skipped: boolean;
    consequence: string;
    meterDeltas: Partial<Meters>;
    secondsToDecide: number;
    committedBy: string;
  } | null;
}

export interface ViewInject {
  id: string;
  phaseId: string;
  clock: string;
  channel: SimChannel;
  sender: string;
  title: string;
  body: string;
  restricted: boolean;
  canRead: boolean;
  audience: string[];
  custom: boolean;
  isConsequence: boolean;
  revealedAt: number;
  meterDeltas: Partial<Meters>;
  mitre: string[];
  facilitatorNotes: string[];
  decision: ViewDecision | null;
}

export interface ViewParticipant {
  id: string;
  name: string;
  roleId: string;
  joinedAt: number;
}

export interface RoomNote {
  id: string;
  kind: "observation" | "gap" | "action";
  text: string;
  author: string;
  at: number;
}

export interface RoomView {
  status: "lobby" | "running" | "ended";
  startedAt: number | null;
  endedAt: number | null;
  facilitatorName: string;
  viewer: { kind: "facilitator" | "participant" | "observer"; id: string; name: string; roleId: string };
  sim: Pick<Simulation, "id" | "title" | "organization" | "industry" | "scenarioType" | "maturityLevel" | "durationMinutes" | "briefing" | "groundRules" | "roles" | "phases" | "source">;
  participants: ViewParticipant[];
  meters: Meters;
  feed: ViewInject[];
  currentPhaseIndex: number;
  openDecisionId: string;
  remainingInjects: number;
  canAdvance: boolean;
  notes: RoomNote[];
}

export interface ReportDecision {
  injectId: string;
  clock: string;
  phase: string;
  trigger: string;
  prompt: string;
  owner: string;
  capability: string;
  csf: string;
  chosen: string;
  quality: DecisionQuality | "undecided";
  score: number;
  consequence: string;
  strongerOption: string;
  recommendation: string;
  secondsToDecide: number | null;
  timeLimitSeconds: number;
  onTime: boolean;
  voters: number;
  alignment: number | null;
  voteSplit: Array<{ label: string; votes: number }>;
  rationales: Array<{ by: string; text: string }>;
}

export interface ReportFinding {
  id: string;
  severity: "High" | "Medium" | "Low";
  capability: string;
  csf: string;
  title: string;
  observation: string;
  recommendation: string;
  owner: string;
  dueInDays: number;
}

export interface AfterActionReport {
  schemaVersion: "tabletopforge.aar.v1";
  generatedAt: string;
  exercise: {
    id: string;
    title: string;
    organization: string;
    industry: string;
    scenarioType: string;
    maturityLevel: string;
    source: string;
    startedAt: string;
    endedAt: string;
    actualMinutes: number;
    plannedMinutes: number;
  };
  facilitator: string;
  participants: Array<{ name: string; role: string; votes: number }>;
  overall: { score: number; tier: "Developing" | "Functional" | "Strong" | "Resilient"; summary: string; onTimeRate: number };
  meters: Array<{ id: MeterId; label: string; value: number; start: number }>;
  capabilities: Array<{ id: string; label: string; score: number | null; decisions: number }>;
  decisions: ReportDecision[];
  timeline: Array<{ injectId: string; clock: string; phase: string; channel: SimChannel; title: string; kind: "inject" | "consequence" | "curveball"; restrictedTo: string[] }>;
  strengths: string[];
  findings: ReportFinding[];
  actionItems: Array<{ text: string; author: string }>;
  observations: Array<{ text: string; author: string }>;
  frameworks: {
    nistCsf: Array<{ id: string; name: string; score: number }>;
    mitre: string[];
    controls: Array<{ framework: string; control: string; text: string }>;
  };
  narrative: {
    executiveSummary: string;
    whatWentWell: string[];
    keyRisks: string[];
    coachingNotes: string[];
    nextExercise: string;
  } | null;
}
