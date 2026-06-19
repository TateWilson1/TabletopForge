import type { GeneratedExercise, Industry, OrganizationSize, ScenarioType } from "@/lib/types";

export type PawnKey = "sentinel" | "spark" | "anchor" | "prism";
export type BoardSpaceSide = "top" | "right" | "bottom" | "left";
export type BoardSpaceTone = "start" | "triage" | "decision" | "technical" | "business" | "recovery" | "gap" | "inject";

export interface PawnOption {
  key: PawnKey;
  name: string;
  color: string;
  accent: string;
  description: string;
}

export const pawnOptions: PawnOption[] = [
  {
    key: "sentinel",
    name: "Sentinel",
    color: "#23d39b",
    accent: "#0f6f58",
    description: "Balanced and steady.",
  },
  {
    key: "spark",
    name: "Spark",
    color: "#f5b83d",
    accent: "#8a5b10",
    description: "Fast and curious.",
  },
  {
    key: "anchor",
    name: "Anchor",
    color: "#68a8ff",
    accent: "#1b4d91",
    description: "Calm under pressure.",
  },
  {
    key: "prism",
    name: "Prism",
    color: "#d98cff",
    accent: "#6b2a83",
    description: "Looks for hidden paths.",
  },
];

export const boardSpaceCount = 20;

export interface CyberBoardSpace {
  label: string;
  tone: BoardSpaceTone;
}

const scenarioSpaces: Record<ScenarioType, CyberBoardSpace[]> = {
  "Phishing / Business Email Compromise": [
    { label: "Inbox", tone: "triage" },
    { label: "Report", tone: "triage" },
    { label: "Mailbox", tone: "technical" },
    { label: "Bank", tone: "business" },
    { label: "MFA", tone: "technical" },
    { label: "Evidence", tone: "technical" },
  ],
  Ransomware: [
    { label: "Alert", tone: "triage" },
    { label: "Scope", tone: "triage" },
    { label: "Systems", tone: "technical" },
    { label: "Contain", tone: "decision" },
    { label: "Backups", tone: "recovery" },
    { label: "Restore", tone: "recovery" },
  ],
  "Data Exfiltration": [
    { label: "Signal", tone: "triage" },
    { label: "Data", tone: "business" },
    { label: "Logs", tone: "technical" },
    { label: "Access", tone: "technical" },
    { label: "Notice", tone: "decision" },
    { label: "Scope", tone: "triage" },
  ],
  "Compromised Admin Account": [
    { label: "Admin", tone: "triage" },
    { label: "Sessions", tone: "technical" },
    { label: "Tokens", tone: "technical" },
    { label: "Disable", tone: "decision" },
    { label: "Audit", tone: "technical" },
    { label: "Reset", tone: "recovery" },
  ],
  "Lost or Stolen Laptop": [
    { label: "Report", tone: "triage" },
    { label: "Device", tone: "technical" },
    { label: "Location", tone: "business" },
    { label: "Remote Wipe", tone: "decision" },
    { label: "Data", tone: "business" },
    { label: "Replace", tone: "recovery" },
  ],
  "Vendor / Third-Party Breach": [
    { label: "Vendor", tone: "triage" },
    { label: "Contract", tone: "business" },
    { label: "Access", tone: "technical" },
    { label: "SLA", tone: "business" },
    { label: "Customers", tone: "business" },
    { label: "Assurance", tone: "recovery" },
  ],
  "Insider Threat": [
    { label: "Concern", tone: "triage" },
    { label: "HR Path", tone: "business" },
    { label: "Access", tone: "technical" },
    { label: "Evidence", tone: "technical" },
    { label: "Legal", tone: "decision" },
    { label: "Lockdown", tone: "recovery" },
  ],
  "Cloud Misconfiguration": [
    { label: "Cloud", tone: "triage" },
    { label: "Exposure", tone: "technical" },
    { label: "Storage", tone: "technical" },
    { label: "Fix", tone: "decision" },
    { label: "Access", tone: "technical" },
    { label: "Validate", tone: "recovery" },
  ],
};

const industrySpaces: Record<Industry, CyberBoardSpace[]> = {
  Healthcare: [
    { label: "Patient Care", tone: "business" },
    { label: "Privacy", tone: "decision" },
    { label: "Clinic Ops", tone: "business" },
  ],
  Education: [
    { label: "Students", tone: "business" },
    { label: "Campus", tone: "business" },
    { label: "Records", tone: "decision" },
  ],
  "Financial Services": [
    { label: "Funds", tone: "business" },
    { label: "Fraud", tone: "decision" },
    { label: "Regulator", tone: "decision" },
  ],
  Manufacturing: [
    { label: "Production", tone: "business" },
    { label: "Safety", tone: "decision" },
    { label: "OT Floor", tone: "technical" },
  ],
  "Local Government": [
    { label: "Residents", tone: "business" },
    { label: "Services", tone: "business" },
    { label: "Public Info", tone: "decision" },
  ],
  Nonprofit: [
    { label: "Donors", tone: "business" },
    { label: "Programs", tone: "business" },
    { label: "Board", tone: "decision" },
  ],
  "Small Business": [
    { label: "Owner", tone: "decision" },
    { label: "Cash Flow", tone: "business" },
    { label: "Customers", tone: "business" },
  ],
  "MSP / IT Provider": [
    { label: "Client", tone: "business" },
    { label: "Tooling", tone: "technical" },
    { label: "SLA", tone: "business" },
  ],
  Other: [
    { label: "Operations", tone: "business" },
    { label: "People", tone: "business" },
    { label: "Obligation", tone: "decision" },
  ],
};

const sizeSpaces: Record<OrganizationSize, CyberBoardSpace[]> = {
  "1-25": [
    { label: "Owner", tone: "decision" },
    { label: "Backup Role", tone: "gap" },
    { label: "IT Help", tone: "business" },
    { label: "Customer Call", tone: "business" },
  ],
  "26-100": [
    { label: "Manager", tone: "decision" },
    { label: "IT Lead", tone: "technical" },
    { label: "Outside Help", tone: "business" },
    { label: "Staff Update", tone: "business" },
  ],
  "101-500": [
    { label: "Dept Leads", tone: "business" },
    { label: "IT Queue", tone: "technical" },
    { label: "Legal Path", tone: "decision" },
    { label: "Status Room", tone: "business" },
  ],
  "501-1000": [
    { label: "Command", tone: "decision" },
    { label: "SOC", tone: "technical" },
    { label: "Regions", tone: "business" },
    { label: "PR Review", tone: "decision" },
  ],
  "1000+": [
    { label: "Command", tone: "decision" },
    { label: "SOC", tone: "technical" },
    { label: "Legal", tone: "decision" },
    { label: "Executives", tone: "business" },
  ],
};

export function buildCyberBoardSpaces(exercise: Pick<GeneratedExercise, "overview">): CyberBoardSpace[] {
  const scenario = scenarioSpaces[exercise.overview.scenario];
  const industry = industrySpaces[exercise.overview.industry];
  const size = sizeSpaces[exercise.overview.organizationSize];
  const rawSpaces: CyberBoardSpace[] = [
    { label: "Start", tone: "start" },
    scenario[0],
    scenario[1],
    size[0],
    scenario[2],
    { label: "Decision", tone: "decision" },
    scenario[3],
    industry[0],
    size[1],
    { label: "Comms", tone: "business" },
    { label: "Impact", tone: "business" },
    industry[1],
    scenario[4],
    size[2],
    industry[2],
    { label: "Lessons", tone: "recovery" },
    { label: "Debrief", tone: "recovery" },
    scenario[5],
    size[3],
    { label: "Twist", tone: "inject" },
  ];

  return dedupeBoardLabels(rawSpaces).slice(0, boardSpaceCount);
}

function dedupeBoardLabels(spaces: CyberBoardSpace[]) {
  const used = new Map<string, number>();
  return spaces.map((space) => {
    const count = used.get(space.label) ?? 0;
    used.set(space.label, count + 1);
    if (count === 0) {
      return space;
    }

    const fallbackLabels = ["Check", "Plan Gap", "Owner", "Approve", "Record", "Next Step"];
    return {
      ...space,
      label: fallbackLabels[(count - 1) % fallbackLabels.length],
      tone: count % 2 === 0 ? space.tone : "gap",
    } satisfies CyberBoardSpace;
  });
}
