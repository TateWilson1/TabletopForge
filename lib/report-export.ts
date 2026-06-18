import type { CompletedSession, GeneratedExercise } from "@/lib/types";

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function list(items: string[]) {
  if (items.length === 0) {
    return "<p class=\"muted\">None captured.</p>";
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function paragraph(value: string | undefined) {
  return `<p>${escapeHtml(value || "None captured.")}</p>`;
}

function htmlShell(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #17202a; background: #f5f7fb; }
    body { margin: 0; padding: 32px; }
    main { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #d8e0ea; border-radius: 8px; padding: 34px; }
    h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.15; }
    h2 { margin: 28px 0 10px; padding-bottom: 7px; border-bottom: 1px solid #d8e0ea; font-size: 19px; }
    h3 { margin: 18px 0 7px; font-size: 15px; }
    p, li { font-size: 14px; line-height: 1.65; }
    ul { margin: 8px 0 0 20px; padding: 0; }
    li { margin: 5px 0; }
    .muted { color: #627084; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 20px 0 4px; }
    .box { border: 1px solid #d8e0ea; border-radius: 6px; padding: 12px; background: #f9fbfd; }
    .label { margin: 0 0 3px; color: #627084; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .value { margin: 0; font-weight: 700; }
    .score { display: inline-block; border-radius: 6px; background: #e8f2ff; padding: 8px 12px; font-weight: 700; color: #123c69; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #d8e0ea; padding: 9px; text-align: left; vertical-align: top; font-size: 13px; line-height: 1.5; }
    th { background: #eef4fb; }
    @media print {
      body { background: #fff; padding: 0; }
      main { border: 0; border-radius: 0; padding: 0; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

export function buildExerciseHtmlReport(exercise: GeneratedExercise) {
  return htmlShell(
    `${exercise.overview.organization} Tabletop Exercise`,
    `
      <h1>${escapeHtml(exercise.overview.organization)} Tabletop Exercise</h1>
      <p class="muted">${escapeHtml(exercise.executiveSummary)}</p>
      <div class="meta">
        <div class="box"><p class="label">Scenario</p><p class="value">${escapeHtml(exercise.overview.scenario)}</p></div>
        <div class="box"><p class="label">Duration</p><p class="value">${escapeHtml(exercise.overview.duration)}</p></div>
        <div class="box"><p class="label">Industry</p><p class="value">${escapeHtml(exercise.overview.industry)}</p></div>
        <div class="box"><p class="label">Maturity</p><p class="value">${escapeHtml(exercise.overview.maturityLevel)}</p></div>
      </div>
      <h2>Scenario Summary</h2>
      ${paragraph(exercise.scenarioSummary)}
      ${exercise.customScenarioDetails ? `<h2>Custom Scenario Details</h2>${paragraph(exercise.customScenarioDetails)}` : ""}
      <h2>Objectives</h2>
      ${list(exercise.objectives)}
      <h2>Suggested Participants</h2>
      ${list(exercise.suggestedParticipants)}
      <h2>Discussion Questions</h2>
      ${list(exercise.discussionQuestions)}
      <h2>IRP Gap Questions</h2>
      ${list(exercise.gapDiscoveryQuestions)}
      <h2>Expected Decisions</h2>
      ${list(exercise.expectedDecisions)}
      <h2>Facilitator Notes</h2>
      ${list(exercise.facilitatorNotes)}
      ${exercise.irpAnalysis ? `<h2>IRP Gap Analysis</h2><p>${escapeHtml(exercise.irpAnalysis.overallSummary)}</p>${list(exercise.irpAnalysis.findings.filter((finding) => finding.status !== "found").map((finding) => `${finding.label}: ${finding.summary} ${finding.improvement}`))}` : ""}
      ${exercise.starterIrpTemplate ? starterIrpTemplateHtml(exercise.starterIrpTemplate) : ""}
    `,
  );
}

function starterIrpTemplateHtml(template: GeneratedExercise["starterIrpTemplate"]) {
  if (!template) {
    return "";
  }

  return `
    <h2>Starter IRP Template</h2>
    <p>${escapeHtml(template.generatedBecause)}</p>
    ${template.sections
      .map(
        (section) => `
          <h3>${escapeHtml(section.title)}</h3>
          <p><strong>Purpose:</strong> ${escapeHtml(section.purpose)}</p>
          <p>${escapeHtml(section.draftText)}</p>
          <p><strong>Fill in:</strong></p>
          ${list(section.fillIn)}
        `,
      )
      .join("")}
    <h3>Missing Inputs To Collect</h3>
    ${list(template.missingInputs)}
    <h3>Next Steps</h3>
    ${list(template.nextSteps)}
  `;
}

export function buildCompletedSessionHtmlReport(session: CompletedSession) {
  const categoryRows = session.categoryScores
    .map(
      (category) =>
        `<tr><td>${escapeHtml(category.label)}</td><td>${escapeHtml(category.score === null ? "N/A" : `${category.score}/100`)}</td><td>${escapeHtml(category.summary)}</td></tr>`,
    )
    .join("");
  const decisionRows = session.decisions
    .map((decision) => `<tr><td>${escapeHtml(decision.stepTitle)}</td><td>${escapeHtml(decision.decision)}</td><td>${decision.decided ? "Decided" : "Unresolved"}</td></tr>`)
    .join("");

  return htmlShell(
    `${session.organization} Tabletop Scorecard`,
    `
      <h1>${escapeHtml(session.organization)} Tabletop Scorecard</h1>
      <p><span class="score">${escapeHtml(session.readinessTier ?? "Readiness")} - ${escapeHtml(session.overallScore)}/100</span></p>
      <div class="meta">
        <div class="box"><p class="label">Scenario</p><p class="value">${escapeHtml(session.scenario)}</p></div>
        <div class="box"><p class="label">Completed</p><p class="value">${escapeHtml(new Date(session.completedAt).toLocaleString())}</p></div>
      </div>
      <h2>Category Scores</h2>
      <table><thead><tr><th>Category</th><th>Score</th><th>Summary</th></tr></thead><tbody>${categoryRows}</tbody></table>
      <h2>Top Risks</h2>
      ${list(session.topRisks ?? session.gaps.slice(0, 3))}
      <h2>Suggested Action Items</h2>
      ${list(session.recommendedActionItems ?? [])}
      <h2>30 / 60 / 90 Day Plan</h2>
      <table><thead><tr><th>Window</th><th>Focus</th><th>Outcome</th></tr></thead><tbody>${(session.improvementPlan ?? [])
        .map((item) => `<tr><td>${escapeHtml(item.window)}</td><td>${escapeHtml(item.focus)}</td><td>${escapeHtml(item.outcome)}</td></tr>`)
        .join("")}</tbody></table>
      <h2>Strengths</h2>
      ${list(session.strengths)}
      <h2>Gaps</h2>
      ${list(session.gaps)}
      <h2>Unresolved Unknowns</h2>
      ${list(session.unresolvedUnknowns)}
      <h2>Decisions</h2>
      <table><thead><tr><th>Section</th><th>Decision</th><th>Status</th></tr></thead><tbody>${decisionRows}</tbody></table>
      <h2>Revealed Injects</h2>
      ${list(session.revealedInjects.map((inject) => `${inject.stepTitle}: ${inject.text}`))}
      <h2>Session Notes</h2>
      ${paragraph(session.sessionNotes)}
      <h2>Action Items</h2>
      ${paragraph(session.actionItems)}
      <h2>Recommended Next Tabletop</h2>
      ${paragraph(session.recommendedNextTabletop)}
      ${session.starterIrpTemplate ? starterIrpTemplateHtml(session.starterIrpTemplate) : ""}
    `,
  );
}

export function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "tabletopforge";
}
