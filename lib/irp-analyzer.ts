import type { IrpAnalysis, IrpGapFinding } from "@/lib/types";

interface GapRule {
  id: string;
  label: string;
  keywords: string[];
  ownerKeywords: string[];
  missingSummary: string;
  weakSummary: string;
  improvement: string;
  tailoredQuestions: string[];
}

const gapRules: GapRule[] = [
  {
    id: "severity",
    label: "Incident severity and declaration criteria",
    keywords: ["severity", "priority", "critical", "high", "medium", "low", "declare", "classification"],
    ownerKeywords: ["incident commander", "security lead", "manager", "executive", "owner", "authority", "approve"],
    missingSummary: "The IRP does not appear to clearly define incident severity levels or who declares an incident.",
    weakSummary: "The IRP mentions severity or classification, but ownership or decision authority looks unclear.",
    improvement: "Define severity levels, decision criteria, and who has authority to declare or downgrade an incident.",
    tailoredQuestions: [
      "Based on the IRP, who has authority to declare this scenario a formal incident?",
      "Which severity level would this scenario receive, and what exact criteria support that decision?",
      "What changes if the incident severity is upgraded during the exercise?",
    ],
  },
  {
    id: "roles",
    label: "Named response roles and responsibilities",
    keywords: ["role", "responsibility", "racI", "incident commander", "facilitator", "legal", "communications", "hr"],
    ownerKeywords: ["owner", "responsible", "accountable", "assigned", "primary", "backup"],
    missingSummary: "The IRP does not appear to define clear response roles across IT, leadership, legal, HR, and communications.",
    weakSummary: "The IRP references roles, but it may not clearly assign owners or backups for key response actions.",
    improvement: "Add a response role matrix with primary and backup owners for each major incident activity.",
    tailoredQuestions: [
      "Which named role owns the first 30 minutes of response for this scenario?",
      "Who is the backup if the listed incident lead is unavailable?",
      "Which response actions have no clear owner in the current IRP?",
    ],
  },
  {
    id: "communications",
    label: "Internal and external communications",
    keywords: ["communication", "notify", "notification", "template", "status update", "public relations", "customer", "employee"],
    ownerKeywords: ["communications", "public relations", "executive", "legal", "approve", "spokesperson"],
    missingSummary: "The IRP does not appear to include communication paths, templates, or approval steps.",
    weakSummary: "The IRP mentions communications, but approval authority or audience-specific templates look incomplete.",
    improvement: "Document internal updates, executive briefings, customer notices, and approval paths for messages.",
    tailoredQuestions: [
      "What does the IRP say should be communicated to employees during this scenario?",
      "Who approves external messaging before customers, vendors, or the public are contacted?",
      "What communication template would be used if facts are still uncertain?",
    ],
  },
  {
    id: "containment",
    label: "Containment authority",
    keywords: ["contain", "isolate", "disable", "disconnect", "block", "revoke", "reset password", "remote wipe"],
    ownerKeywords: ["approve", "authorized", "authority", "security lead", "it manager", "executive", "owner"],
    missingSummary: "The IRP does not appear to define who can approve containment actions.",
    weakSummary: "The IRP includes containment language, but approval thresholds or business-impact authority may be unclear.",
    improvement: "Specify who can approve account disablement, network isolation, remote wipe, and service shutdown decisions.",
    tailoredQuestions: [
      "Which containment actions can IT take immediately without executive approval?",
      "Who approves a containment step that may interrupt business operations?",
      "What would the team do if containment creates legal, customer, or safety impact?",
    ],
  },
  {
    id: "evidence",
    label: "Evidence preservation and logging",
    keywords: ["evidence", "forensic", "log", "chain of custody", "preserve", "audit", "snapshot", "timeline"],
    ownerKeywords: ["owner", "responsible", "security", "legal", "custodian", "document"],
    missingSummary: "The IRP does not appear to describe evidence preservation, log collection, or chain-of-custody expectations.",
    weakSummary: "The IRP references evidence or logs, but ownership, timing, or preservation steps may be incomplete.",
    improvement: "Add evidence preservation checklists for logs, devices, screenshots, emails, and timeline notes.",
    tailoredQuestions: [
      "What evidence does the IRP require before containment or recovery begins?",
      "Who owns evidence preservation for this scenario?",
      "How long are the logs needed for this scenario retained?",
    ],
  },
  {
    id: "legal-compliance",
    label: "Legal, compliance, and notification decisions",
    keywords: ["legal", "compliance", "regulator", "regulatory", "breach", "privacy", "notification", "hipaa", "glba", "ferpa"],
    ownerKeywords: ["counsel", "legal", "compliance", "privacy officer", "approve", "determine"],
    missingSummary: "The IRP does not appear to define when legal or compliance teams should evaluate notification obligations.",
    weakSummary: "The IRP mentions legal or compliance, but notification ownership or timelines look incomplete.",
    improvement: "Define legal/compliance escalation triggers, notification timelines, and decision documentation requirements.",
    tailoredQuestions: [
      "What facts are needed before legal or compliance can decide whether notification is required?",
      "Who documents the notification decision and supporting rationale?",
      "Which regulatory or contractual deadlines might apply to this scenario?",
    ],
  },
  {
    id: "third-party",
    label: "Vendor and third-party coordination",
    keywords: ["vendor", "third party", "supplier", "msp", "managed service", "contract", "sla", "provider"],
    ownerKeywords: ["vendor owner", "procurement", "contract", "contact", "account manager", "service owner"],
    missingSummary: "The IRP does not appear to define third-party contacts, vendor escalation, or contract review steps.",
    weakSummary: "The IRP references vendors, but vendor ownership, contact paths, or contract obligations may be weak.",
    improvement: "Maintain vendor incident contacts, contract notification requirements, and owner escalation paths.",
    tailoredQuestions: [
      "Which vendor or MSP contact would be called first for this scenario?",
      "Where does the IRP store vendor contract notification requirements?",
      "Who owns follow-up if the vendor does not respond quickly?",
    ],
  },
  {
    id: "recovery",
    label: "Recovery, backups, and restoration priority",
    keywords: ["recover", "restore", "backup", "business continuity", "rto", "rpo", "restore point", "critical service"],
    ownerKeywords: ["owner", "priority", "business owner", "approve", "it", "operations"],
    missingSummary: "The IRP does not appear to define recovery priorities, backup validation, or restoration ownership.",
    weakSummary: "The IRP mentions recovery or backups, but priorities, ownership, or validation steps may be incomplete.",
    improvement: "Document restoration priorities, backup validation steps, service owners, and recovery decision authority.",
    tailoredQuestions: [
      "Which service would the IRP restore first for this scenario?",
      "Who validates that backups are safe to use?",
      "What recovery point and downtime are acceptable for affected teams?",
    ],
  },
  {
    id: "lessons-learned",
    label: "After-action review and improvement tracking",
    keywords: ["lessons learned", "after action", "post incident", "retrospective", "improvement", "corrective action"],
    ownerKeywords: ["owner", "due date", "priority", "track", "accountable", "assigned"],
    missingSummary: "The IRP does not appear to require after-action review or action item tracking.",
    weakSummary: "The IRP mentions post-incident activity, but ownership, due dates, or tracking may be incomplete.",
    improvement: "Require after-action reviews with action owners, due dates, priorities, and follow-up validation.",
    tailoredQuestions: [
      "When does the IRP require the after-action review to happen?",
      "Who tracks corrective actions after this exercise?",
      "How will leadership know whether improvement items were completed?",
    ],
  },
];

const rolePatterns: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Incident Commander", patterns: [/\bincident commander\b/, /\bincident lead\b/, /\bincident coordinator\b/] },
  { label: "IT Lead", patterns: [/\bit lead\b/, /\bit manager\b/, /\btechnology lead\b/, /\bsystems administrator\b/, /\bsysadmin\b/] },
  { label: "Security Lead", patterns: [/\bsecurity lead\b/, /\bsecurity officer\b/, /\bciso\b/, /\binformation security\b/, /\bcybersecurity lead\b/] },
  { label: "Executive Sponsor", patterns: [/\bexecutive sponsor\b/, /\bceo\b/, /\bchief executive officer\b/, /\bexecutive director\b/, /\btown administrator\b/] },
  { label: "Finance Lead", patterns: [/\bcfo\b/, /\bchief financial officer\b/, /\bfinance director\b/, /\bfinance lead\b/, /\bcontroller\b/, /\bpayment approver\b/] },
  { label: "Legal Counsel", patterns: [/\blegal counsel\b/, /\bgeneral counsel\b/, /\battorney\b/, /\boutside counsel\b/, /\blegal\b/] },
  { label: "Compliance Lead", patterns: [/\bcompliance officer\b/, /\bcompliance lead\b/, /\bprivacy officer\b/, /\bhipaa officer\b/, /\bdata protection officer\b/] },
  { label: "Communications Lead", patterns: [/\bcommunications lead\b/, /\bpublic information officer\b/, /\bpio\b/, /\bpublic relations\b/, /\bspokesperson\b/] },
  { label: "HR Lead", patterns: [/\bhr lead\b/, /\bhuman resources\b/, /\bhr manager\b/] },
  { label: "Operations Lead", patterns: [/\boperations lead\b/, /\boperations manager\b/, /\bbusiness owner\b/, /\bdepartment manager\b/] },
  { label: "Vendor Owner", patterns: [/\bvendor owner\b/, /\bvendor manager\b/, /\bprocurement\b/, /\bthird-party risk\b/, /\bservice owner\b/] },
  { label: "Cyber Insurance Contact", patterns: [/\bcyber insurance\b/, /\binsurance contact\b/, /\bbreach coach\b/] },
];

export function analyzeIrp(text: string, sourceName?: string, suppliedStructure?: string): IrpAnalysis | undefined {
  const normalized = normalizeText(text);
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  const suppliedRoles = extractRolesFromText(suppliedStructure ?? "");

  if (words.length < 25 && suppliedRoles.length === 0) {
    return undefined;
  }

  const findings = gapRules.map((rule) => analyzeRule(rule, normalized));
  const gaps = findings.filter((finding) => finding.status !== "found");
  const strengths = findings
    .filter((finding) => finding.status === "found")
    .slice(0, 4)
    .map((finding) => finding.label);
  const detectedRoles = extractRolesFromText(text);
  const organizationStructure = buildOrganizationStructure(detectedRoles, suppliedRoles);

  return {
    sourceName,
    analyzedAt: new Date().toISOString(),
    wordCount: words.length,
    overallSummary:
      gaps.length > 0
        ? `The IRP scan found ${gaps.length} likely weak or missing areas. The generated tabletop questions were adjusted to focus on those gaps.${organizationStructure ? ` Detected structure: ${organizationStructure.detectedRoles.join(", ")}.` : ""}`
        : `The IRP scan found coverage across the major incident response areas. The exercise still includes validation questions to confirm the plan works in practice.${organizationStructure ? ` Detected structure: ${organizationStructure.detectedRoles.join(", ")}.` : ""}`,
    strengths,
    findings,
    organizationStructure,
  };
}

export function getTailoredIrpQuestions(analysis?: IrpAnalysis) {
  if (!analysis) {
    return {
      discussionQuestions: [],
      gapQuestions: [],
    };
  }

  const focusFindings = analysis.findings
    .filter((finding) => finding.status !== "found")
    .slice(0, 5);

  return {
    discussionQuestions: focusFindings.map(
      (finding) => `IRP focus - ${finding.label}: ${finding.tailoredQuestions[0]}`,
    ),
    gapQuestions: focusFindings.flatMap((finding) => finding.tailoredQuestions.slice(1, 3)),
  };
}

function analyzeRule(rule: GapRule, normalized: string): IrpGapFinding {
  const evidence = findEvidence(rule.keywords, normalized);
  const ownerEvidence = findEvidence(rule.ownerKeywords, normalized);

  if (evidence.length === 0) {
    return {
      id: rule.id,
      label: rule.label,
      status: "missing",
      summary: rule.missingSummary,
      evidence: [],
      tailoredQuestions: rule.tailoredQuestions,
      improvement: rule.improvement,
    };
  }

  if (ownerEvidence.length === 0) {
    return {
      id: rule.id,
      label: rule.label,
      status: "weak",
      summary: rule.weakSummary,
      evidence,
      tailoredQuestions: rule.tailoredQuestions,
      improvement: rule.improvement,
    };
  }

  return {
    id: rule.id,
    label: rule.label,
    status: "found",
    summary: `The IRP appears to address ${rule.label.toLowerCase()}.`,
    evidence: [...evidence, ...ownerEvidence].slice(0, 5),
    tailoredQuestions: rule.tailoredQuestions,
    improvement: rule.improvement,
  };
}

function findEvidence(keywords: string[], normalized: string) {
  return keywords
    .filter((keyword) => normalized.includes(keyword.toLowerCase()))
    .slice(0, 4);
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRolesFromText(text: string) {
  const normalized = normalizeText(text);
  const roles = rolePatterns
    .filter((role) => role.patterns.some((pattern) => pattern.test(normalized)))
    .map((role) => role.label);

  const lineRoles = text
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && item.length <= 70)
    .filter((item) => /\b(lead|manager|director|owner|officer|counsel|commander|coordinator|administrator|admin|approver|contact)\b/i.test(item))
    .map((item) => item.replace(/^[-*]\s*/, ""))
    .slice(0, 12);

  return uniqueStrings([...roles, ...lineRoles]).slice(0, 14);
}

function buildOrganizationStructure(detectedRoles: string[], suppliedRoles: string[]) {
  const roles = uniqueStrings(suppliedRoles.length > 0 ? suppliedRoles : detectedRoles).slice(0, 14);
  if (roles.length === 0) {
    return undefined;
  }

  const source = suppliedRoles.length > 0 ? "user supplied" : "uploaded IRP";
  return {
    source,
    detectedRoles: roles,
    guidance:
      source === "uploaded IRP"
        ? "Use only these detected IRP roles when naming participants or decision owners. If a common role is not listed, describe the gap instead of inventing that role."
        : "Use this supplied structure as the participant and decision-owner pool because no IRP was uploaded.",
  } as const;
}

function uniqueStrings(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
