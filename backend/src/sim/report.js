// After-action report builder. Pure and deterministic: the same exercise always produces the
// same report, with or without AI. AI enrichment (when enabled) only adds narrative on top.

import { CAPABILITIES, CAPABILITY_LABELS, METER_IDS, METER_LABELS, findInject } from "./engine.js";

export const AAR_SCHEMA_VERSION = "tabletopforge.aar.v1";

const QUALITY_SCORE = { strong: 100, acceptable: 65, risky: 25 };

const CSF_NAMES = {
  "DE.AE-02": "Potentially adverse events are analyzed",
  "DE.AE-08": "Incidents are declared when criteria are met",
  "GV.SC-08": "Suppliers are included in incident planning and response",
  "RS.MA-01": "The incident response plan is executed with relevant third parties",
  "RS.MA-02": "Incident reports are triaged and validated",
  "RS.MA-03": "Incidents are categorized and prioritized",
  "RS.MA-04": "Incidents are escalated or elevated as needed",
  "RS.AN-03": "Analysis establishes what happened and the root cause",
  "RS.AN-06": "Investigation actions are recorded and preserved",
  "RS.AN-07": "Incident data is collected and its integrity preserved",
  "RS.AN-08": "The incident's magnitude is estimated and validated",
  "RS.CO-02": "Internal and external stakeholders are notified",
  "RS.CO-03": "Information is shared with designated stakeholders",
  "RS.MI-01": "Incidents are contained",
  "RS.MI-02": "Incidents are eradicated",
  "RC.RP-01": "The recovery plan is executed",
  "RC.RP-02": "Recovery actions are selected, scoped, and prioritized",
  "RC.RP-03": "Backup integrity is verified before restoration",
  "RC.RP-04": "Critical functions are considered in post-incident operations",
  "RC.RP-05": "The integrity of restored assets is verified",
  "RC.CO-03": "Recovery activities are communicated to stakeholders",
  "RC.CO-04": "Public updates are shared using approved methods",
};

const CONTROL_EVIDENCE = [
  { framework: "NIST CSF 2.0", control: "ID.IM-02", text: "Improvements are identified from security tests and exercises." },
  { framework: "NIST SP 800-84", control: "Tabletop exercise", text: "Discussion-based exercise of incident response roles and procedures." },
  { framework: "SOC 2", control: "CC7.4 / CC7.5", text: "Incident response and recovery procedures are tested." },
  { framework: "PCI DSS v4.0", control: "12.10.2", text: "The incident response plan is reviewed and tested at least once every 12 months." },
  { framework: "HIPAA Security Rule", control: "164.308(a)(7)(ii)(D)", text: "Contingency plans are periodically tested and revised." },
  { framework: "ISO/IEC 27001:2022", control: "A.5.24 – A.5.27", text: "Incident management planning, response, and learning from incidents." },
  { framework: "Cyber insurance", control: "Annual IR testing", text: "Evidence that the incident response plan was exercised with leadership." },
];

export function buildAfterActionReport(sim, state, { now = Date.now(), exerciseId = "" } = {}) {
  const roleTitle = (roleId) => sim.roles.find((role) => role.id === roleId)?.title ?? "";
  const phaseName = (phaseId) => sim.phases.find((phase) => phase.id === phaseId)?.name ?? "";
  const participantList = Object.values(state.participants);

  const timeline = [];
  const decisions = [];

  for (const entry of state.feed) {
    const inject = findInject(sim, state, entry.injectId);
    if (!inject) {
      continue;
    }

    timeline.push({
      injectId: inject.id,
      clock: inject.clock,
      phase: phaseName(inject.phaseId),
      channel: inject.channel,
      title: inject.title,
      kind: inject.custom ? "curveball" : inject.requires ? "consequence" : "inject",
      restrictedTo: inject.audience.map(roleTitle).filter(Boolean),
      revealedAt: entry.revealedAt,
    });

    if (!inject.decision) {
      continue;
    }

    const resolved = state.decisions[inject.id];
    const votes = Object.entries(state.votes[inject.id] ?? {});
    const chosen = resolved && !resolved.skipped ? inject.decision.options.find((option) => option.id === resolved.optionId) : null;
    const quality = chosen ? chosen.quality : "undecided";
    const agreeing = chosen ? votes.filter(([, vote]) => vote.optionId === chosen.id).length : 0;

    decisions.push({
      injectId: inject.id,
      clock: inject.clock,
      phase: phaseName(inject.phaseId),
      trigger: inject.title,
      prompt: inject.decision.prompt,
      owner: roleTitle(inject.decision.ownerRoleId),
      capability: inject.decision.capability,
      csf: inject.decision.csf,
      chosen: chosen?.label ?? "",
      quality,
      score: chosen ? QUALITY_SCORE[chosen.quality] : 0,
      consequence: chosen?.consequence ?? "",
      strongerOption: quality === "strong" ? "" : inject.decision.options.find((option) => option.quality === "strong")?.label ?? "",
      recommendation: inject.decision.recommendation,
      secondsToDecide: resolved?.secondsToDecide ?? null,
      timeLimitSeconds: inject.decision.timeLimitSeconds,
      onTime: resolved && !resolved.skipped ? resolved.secondsToDecide <= inject.decision.timeLimitSeconds : false,
      voters: votes.length,
      alignment: chosen && votes.length > 0 ? agreeing / votes.length : null,
      voteSplit: inject.decision.options.map((option) => ({
        label: option.label,
        votes: votes.filter(([, vote]) => vote.optionId === option.id).length,
      })),
      rationales: votes
        .filter(([, vote]) => vote.rationale)
        .map(([voterId, vote]) => ({
          by: voterId === "facilitator" ? state.facilitatorName : state.participants[voterId]?.name ?? "Participant",
          text: vote.rationale,
        })),
    });
  }

  const capabilities = CAPABILITIES.map((id) => {
    const scoped = decisions.filter((decision) => decision.capability === id);
    return {
      id,
      label: CAPABILITY_LABELS[id],
      score: scoped.length ? Math.round(average(scoped.map((decision) => decision.score))) : null,
      decisions: scoped.length,
    };
  });

  const decisionAverage = decisions.length ? average(decisions.map((decision) => decision.score)) : null;
  const meterAverage = average(METER_IDS.map((meter) => state.meters[meter]));
  const decided = decisions.filter((decision) => decision.quality !== "undecided");
  const onTimeRate = decided.length ? decided.filter((decision) => decision.onTime).length / decided.length : 0;
  const score =
    decisionAverage === null ? Math.round(meterAverage) : Math.round(decisionAverage * 0.65 + meterAverage * 0.25 + onTimeRate * 100 * 0.1);
  const tier = score >= 85 ? "Resilient" : score >= 70 ? "Strong" : score >= 50 ? "Functional" : "Developing";

  const strengths = decisions
    .filter((decision) => decision.quality === "strong")
    .map((decision) => `${decision.owner || "The team"} — ${lowerFirst(decision.chosen)}`)
    .slice(0, 6);

  const findings = [];
  for (const decision of decisions) {
    if (decision.quality === "strong") {
      continue;
    }
    const severity = decision.quality === "acceptable" ? "Medium" : "High";
    findings.push({
      severity,
      capability: CAPABILITY_LABELS[decision.capability],
      csf: decision.csf,
      title: decision.prompt,
      observation:
        decision.quality === "undecided"
          ? `The team did not reach a decision when "${decision.trigger}" landed.`
          : `The team chose to ${lowerFirst(stripPeriod(decision.chosen))}. ${decision.consequence}`,
      recommendation: decision.recommendation || (decision.strongerOption ? `Stronger response: ${decision.strongerOption}` : ""),
      owner: decision.owner,
      dueInDays: severity === "High" ? 30 : 60,
    });
  }
  for (const decision of decisions) {
    if (decision.alignment !== null && decision.voters >= 3 && decision.alignment < 0.5) {
      findings.push({
        severity: "Medium",
        capability: CAPABILITY_LABELS.command,
        csf: "RS.MA-04",
        title: `The team was split on: ${decision.prompt}`,
        observation: `Only ${Math.round(decision.alignment * 100)}% of ${decision.voters} participants agreed with the committed decision. In a real incident that disagreement costs time.`,
        recommendation: `Clarify in the plan who holds decision authority here (${decision.owner || "a named role"}) and what guidance they should follow.`,
        owner: decision.owner,
        dueInDays: 60,
      });
    }
    if (decision.quality !== "undecided" && decision.secondsToDecide > decision.timeLimitSeconds * 1.5) {
      findings.push({
        severity: "Low",
        capability: CAPABILITY_LABELS[decision.capability],
        csf: decision.csf,
        title: `Slow decision: ${decision.prompt}`,
        observation: `This decision took ${formatDuration(decision.secondsToDecide)} against a target of ${formatDuration(decision.timeLimitSeconds)}.`,
        recommendation: "Pre-decide this in the plan, or pre-authorize the owner to act without convening the group.",
        owner: decision.owner,
        dueInDays: 90,
      });
    }
  }
  for (const note of state.notes.filter((item) => item.kind === "gap")) {
    findings.push({
      severity: "Medium",
      capability: "Raised by participants",
      csf: "",
      title: note.text,
      observation: `Recorded during the exercise by ${authorName(state, note.authorId)}.`,
      recommendation: "Assign an owner and confirm how the plan should address this.",
      owner: "",
      dueInDays: 60,
    });
  }
  const severityRank = { High: 0, Medium: 1, Low: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  findings.forEach((finding, index) => {
    finding.id = `F-${String(index + 1).padStart(2, "0")}`;
  });

  const csfIds = [...new Set(decisions.map((decision) => decision.csf).filter(Boolean))];
  const mitre = [
    ...new Set(
      state.feed.flatMap((entry) => findInject(sim, state, entry.injectId)?.mitre ?? []),
    ),
  ];

  const startedAt = state.startedAt ?? state.createdAt;
  const endedAt = state.endedAt ?? now;
  const actualMinutes = Math.max(1, Math.round((endedAt - startedAt) / 60000));
  const highCount = findings.filter((finding) => finding.severity === "High").length;
  const weakest = capabilities.filter((capability) => capability.score !== null).sort((a, b) => a.score - b.score)[0];
  const strongest = capabilities.filter((capability) => capability.score !== null).sort((a, b) => b.score - a.score)[0];

  const summaryParts = [
    `${sim.organization} completed a ${sim.scenarioType || "cyber incident"} tabletop exercise with ${participantList.length || "no additional"} participant${participantList.length === 1 ? "" : "s"}, working through ${timeline.length} scenario developments and ${decisions.length} decision points.`,
    `Overall readiness was rated ${tier} (${score}/100).`,
  ];
  if (strongest && weakest && strongest.id !== weakest.id) {
    summaryParts.push(`The team was strongest in ${strongest.label.toLowerCase()} and weakest in ${weakest.label.toLowerCase()}.`);
  }
  summaryParts.push(
    findings.length === 0
      ? "No significant gaps were identified; consider a harder scenario or a higher maturity level next time."
      : `${findings.length} finding${findings.length === 1 ? " was" : "s were"} recorded${highCount ? `, ${highCount} of them high priority` : ""}.`,
  );

  return {
    schemaVersion: AAR_SCHEMA_VERSION,
    generatedAt: new Date(now).toISOString(),
    exercise: {
      id: exerciseId || sim.id,
      title: sim.title,
      organization: sim.organization,
      industry: sim.industry,
      scenarioType: sim.scenarioType,
      maturityLevel: sim.maturityLevel,
      source: sim.source,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      actualMinutes,
      plannedMinutes: sim.durationMinutes,
    },
    facilitator: state.facilitatorName,
    participants: participantList.map((participant) => ({
      name: participant.name,
      role: roleTitle(participant.roleId) || "Observer",
      votes: Object.values(state.votes).filter((votes) => votes[participant.id]).length,
    })),
    overall: { score, tier, summary: summaryParts.join(" "), onTimeRate: Math.round(onTimeRate * 100) },
    meters: METER_IDS.map((id) => ({ id, label: METER_LABELS[id], value: state.meters[id], start: 60 })),
    capabilities,
    decisions,
    timeline,
    strengths,
    findings,
    actionItems: state.notes
      .filter((note) => note.kind === "action")
      .map((note) => ({ text: note.text, author: authorName(state, note.authorId) })),
    observations: state.notes
      .filter((note) => note.kind === "observation")
      .map((note) => ({ text: note.text, author: authorName(state, note.authorId) })),
    frameworks: {
      nistCsf: csfIds.map((id) => {
        const scoped = decisions.filter((decision) => decision.csf === id);
        return { id, name: CSF_NAMES[id] ?? "", score: Math.round(average(scoped.map((decision) => decision.score))) };
      }),
      mitre,
      controls: CONTROL_EVIDENCE,
    },
    narrative: null,
  };
}

export function buildReportMarkdown(report) {
  const lines = [];
  const push = (...items) => lines.push(...items);
  const exercise = report.exercise;

  push(`# After-Action Report: ${exercise.title}`, "");
  push(`**Organization:** ${exercise.organization}  `);
  push(`**Scenario:** ${exercise.scenarioType}${exercise.industry ? ` (${exercise.industry})` : ""}  `);
  push(`**Date:** ${exercise.startedAt.slice(0, 10)}  `);
  push(`**Duration:** ${exercise.actualMinutes} minutes  `);
  push(`**Facilitator:** ${report.facilitator}  `);
  push(`**Exercise ID:** ${exercise.id}`, "");

  push("## Executive summary", "", report.narrative?.executiveSummary || report.overall.summary, "");
  push(`**Readiness: ${report.overall.tier} — ${report.overall.score}/100**`, "");

  push("## Capability scores", "", "| Capability | Score | Decisions |", "| --- | --- | --- |");
  for (const capability of report.capabilities) {
    push(`| ${capability.label} | ${capability.score === null ? "Not exercised" : `${capability.score}/100`} | ${capability.decisions} |`);
  }
  push("");

  push("## Impact at close", "", "| Dimension | Start | End |", "| --- | --- | --- |");
  for (const meter of report.meters) {
    push(`| ${meter.label} | ${meter.start} | ${meter.value} |`);
  }
  push("");

  if (report.strengths.length) {
    push("## What went well", "", ...report.strengths.map((item) => `- ${item}`), "");
  }

  push("## Findings and recommendations", "");
  if (report.findings.length === 0) {
    push("No significant gaps were identified.", "");
  }
  for (const finding of report.findings) {
    push(`### ${finding.id} — ${finding.title}`, "");
    push(`- **Priority:** ${finding.severity}`);
    push(`- **Area:** ${finding.capability}${finding.csf ? ` (NIST CSF ${finding.csf})` : ""}`);
    push(`- **Observation:** ${finding.observation}`);
    push(`- **Recommendation:** ${finding.recommendation}`);
    push(`- **Suggested owner:** ${finding.owner || "To be assigned"}`);
    push(`- **Target:** within ${finding.dueInDays} days`, "");
  }

  if (report.actionItems.length) {
    push("## Action items raised by participants", "", ...report.actionItems.map((item) => `- ${item.text} _(${item.author})_`), "");
  }

  push("## Decision log", "", "| Time | Decision | Owner | Outcome | Time to decide |", "| --- | --- | --- | --- | --- |");
  for (const decision of report.decisions) {
    push(
      `| ${decision.clock} | ${cell(decision.prompt)} | ${cell(decision.owner)} | ${decision.quality === "undecided" ? "Not decided" : `${capitalize(decision.quality)}: ${cell(decision.chosen)}`} | ${decision.secondsToDecide === null ? "—" : formatDuration(decision.secondsToDecide)} |`,
    );
  }
  push("");

  push("## Participants", "", "| Name | Role |", "| --- | --- |", `| ${cell(report.facilitator)} | Facilitator |`);
  for (const participant of report.participants) {
    push(`| ${cell(participant.name)} | ${cell(participant.role)} |`);
  }
  push("");

  push("## Framework coverage", "");
  for (const item of report.frameworks.nistCsf) {
    push(`- **NIST CSF ${item.id}** — ${item.name}: ${item.score}/100`);
  }
  if (report.frameworks.mitre.length) {
    push(`- **MITRE ATT&CK techniques simulated:** ${report.frameworks.mitre.join(", ")}`);
  }
  push("");

  push("## Exercise evidence", "");
  push(
    `This report documents that ${exercise.organization} conducted a discussion-based incident response tabletop exercise on ${exercise.startedAt.slice(0, 10)}. It may be used as supporting evidence for the following requirements. It is not a certification or legal opinion.`,
    "",
  );
  for (const control of report.frameworks.controls) {
    push(`- **${control.framework} ${control.control}** — ${control.text}`);
  }
  push("", "---", "Generated by TabletopForge. This report supports readiness planning and does not replace professional legal, compliance, or incident response advice.");

  return lines.join("\n");
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) {
    return "—";
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

function authorName(state, authorId) {
  return authorId === "facilitator" ? state.facilitatorName : state.participants[authorId]?.name ?? "Participant";
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function lowerFirst(value) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function stripPeriod(value) {
  return value.replace(/\.$/, "");
}

function cell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
