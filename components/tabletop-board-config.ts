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

/** Shared timing so the 3D scene and the game loop stay in lockstep. */
export const DICE_ROLL_MS = 1900;
export const HOP_MS = 340;
export const LAND_SETTLE_MS = 380;
export const LAP_BONUS_POINTS = 150;

export interface DiceRoll {
  nonce: number;
  /** Pressure die. High rolls can trigger a scenario twist. */
  d20: number;
  /** Movement die. How many spaces the pawn travels. */
  d6: number;
}

export interface ToneMeta {
  label: string;
  /** Band / accent color used on the printed board and in the UI. */
  color: string;
  /** Short nudge shown when a pawn lands on this kind of space. */
  hint: string;
}

export const toneMeta: Record<BoardSpaceTone, ToneMeta> = {
  start: { label: "Start", color: "#14b88a", hint: "Checkpoint. Confirm who is running the response and what has changed since the last lap." },
  triage: { label: "Triage", color: "#3b82f6", hint: "Triage space. Separate confirmed facts from assumptions before acting." },
  decision: { label: "Decision", color: "#8b5cf6", hint: "Decision space. Name one owner and who can approve the call." },
  technical: { label: "Technical", color: "#0ea5e9", hint: "Technical space. What evidence or system state do you need before the next step?" },
  business: { label: "Business", color: "#64748b", hint: "Business space. Who outside IT feels this first, and who tells them?" },
  recovery: { label: "Recovery", color: "#22c55e", hint: "Recovery space. What comes back first, and how do you know it is clean?" },
  gap: { label: "Plan Gap", color: "#f59e0b", hint: "Plan gap space. If the IRP is silent here, capture it as an action item." },
  inject: { label: "Twist", color: "#f97316", hint: "Twist space. Landing here draws a scenario consequence (after the opening roll)." },
};

/* ------------------------------------------------------------------ */
/* Party-board graph: a winding loop with two risky shortcuts          */
/* ------------------------------------------------------------------ */

export type BoardRoute = "main" | "shortcut";

export interface BoardNode {
  id: number;
  label: string;
  tone: BoardSpaceTone;
  x: number;
  z: number;
  next: number[];
  route: BoardRoute;
}

/** Points awarded (or lost) for landing on each kind of space. Twist spaces draw a consequence instead. */
export const spaceEffects: Record<BoardSpaceTone, { points: number; label: string }> = {
  start: { points: 0, label: "Checkpoint" },
  triage: { points: 30, label: "Triage bonus" },
  technical: { points: 30, label: "Evidence bonus" },
  business: { points: 30, label: "Stakeholder bonus" },
  decision: { points: 40, label: "Decision bonus" },
  recovery: { points: 60, label: "Recovery boost" },
  gap: { points: -30, label: "Plan gap exposed" },
  inject: { points: 0, label: "Twist!" },
};

const LOOP_CONTROL: Array<[number, number]> = [
  [0, 4.7],
  [3.2, 4.2],
  [6.0, 5.0],
  [7.9, 2.6],
  [6.7, 0],
  [8.0, -2.7],
  [5.7, -4.8],
  [2.7, -4.0],
  [0, -4.9],
  [-2.7, -4.0],
  [-5.7, -4.8],
  [-8.0, -2.7],
  [-6.7, 0],
  [-7.9, 2.6],
  [-6.0, 5.0],
  [-3.2, 4.2],
];

const SHORTCUTS: Array<{ from: number; to: number; bend: [number, number]; spaces: CyberBoardSpace[] }> = [
  {
    from: 2,
    to: 8,
    bend: [2.6, 0.2],
    spaces: [
      { label: "Skip Approval", tone: "gap" },
      { label: "Shadow IT", tone: "inject" },
      { label: "Quick Fix", tone: "gap" },
    ],
  },
  {
    from: 12,
    to: 18,
    bend: [-2.6, -0.2],
    spaces: [
      { label: "Rushed Restore", tone: "gap" },
      { label: "Twist Alley", tone: "inject" },
      { label: "Unverified Notice", tone: "gap" },
    ],
  },
];

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleClosedLoop(points: Array<[number, number]>, count: number) {
  const dense: Array<[number, number]> = [];
  const n = points.length;
  for (let segment = 0; segment < n; segment += 1) {
    const p0 = points[(segment - 1 + n) % n];
    const p1 = points[segment];
    const p2 = points[(segment + 1) % n];
    const p3 = points[(segment + 2) % n];
    for (let step = 0; step < 40; step += 1) {
      const t = step / 40;
      dense.push([catmullRom(p0[0], p1[0], p2[0], p3[0], t), catmullRom(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  const lengths = [0];
  for (let index = 1; index <= dense.length; index += 1) {
    const a = dense[index - 1];
    const b = dense[index % dense.length];
    lengths.push(lengths[index - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[lengths.length - 1];
  const result: Array<[number, number]> = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const target = (total * index) / count;
    while (lengths[cursor + 1] < target) {
      cursor += 1;
    }
    result.push(dense[cursor]);
  }
  return result;
}

/** Builds the board: 20 named spaces on the main loop (ids 0-19) plus shortcut spaces (ids 20+). */
export function buildBoardGraph(spaces: CyberBoardSpace[]): BoardNode[] {
  const loop = sampleClosedLoop(LOOP_CONTROL, boardSpaceCount);
  const nodes: BoardNode[] = loop.map(([x, z], index) => ({
    id: index,
    label: spaces[index]?.label ?? `Space ${index + 1}`,
    tone: spaces[index]?.tone ?? "business",
    x,
    z,
    next: [(index + 1) % boardSpaceCount],
    route: "main",
  }));

  SHORTCUTS.forEach((shortcut) => {
    const from = nodes[shortcut.from];
    const to = nodes[shortcut.to];
    const ids: number[] = [];
    shortcut.spaces.forEach((space, index) => {
      const t = (index + 1) / (shortcut.spaces.length + 1);
      const u = 1 - t;
      const x = u * u * from.x + 2 * u * t * shortcut.bend[0] + t * t * to.x;
      const z = u * u * from.z + 2 * u * t * shortcut.bend[1] + t * t * to.z;
      const id = nodes.length;
      ids.push(id);
      nodes.push({ id, label: space.label, tone: space.tone, x, z, next: [], route: "shortcut" });
    });
    from.next = [from.next[0], ids[0]];
    ids.forEach((id, index) => {
      nodes[id].next = [index < ids.length - 1 ? ids[index + 1] : to.id];
    });
  });

  return nodes;
}
