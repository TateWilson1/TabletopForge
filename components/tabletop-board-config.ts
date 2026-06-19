export type PawnKey = "sentinel" | "spark" | "anchor" | "prism";

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

export const boardSpaceCount = 12;

export const boardSpaceLabels = [
  "Brief",
  "Triage",
  "Facts",
  "Choice",
  "Discuss",
  "Logs",
  "People",
  "Vendor",
  "Impact",
  "Recover",
  "Lesson",
  "Twist",
];
