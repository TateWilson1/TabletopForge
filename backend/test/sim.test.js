import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SimError,
  applyAction,
  buildView,
  createInitialState,
  getNextInject,
  getOpenDecision,
  normalizeSimulation,
} from "../src/sim/engine.js";
import { buildLibrarySimulation, listLibraryScenarios } from "../src/sim/library.js";
import { buildAfterActionReport, buildReportMarkdown } from "../src/sim/report.js";

const FAC = { kind: "facilitator" };
const INDUSTRIES = ["Healthcare", "Education", "Financial Services", "Manufacturing", "Local Government", "Nonprofit", "Small Business", "MSP / IT Provider", "Other"];

// Plays a whole exercise always picking the option of the given quality.
function playThrough(sim, quality) {
  let now = 1_000_000;
  let state = createInitialState(sim, { now });
  state = applyAction(sim, state, { type: "start" }, FAC, now);
  for (let guard = 0; guard < 100; guard += 1) {
    const open = getOpenDecision(sim, state);
    if (open) {
      const option = open.decision.options.find((item) => item.quality === quality) ?? open.decision.options[0];
      now += 60_000;
      state = applyAction(sim, state, { type: "commit", injectId: open.id, optionId: option.id }, FAC, now);
      continue;
    }
    if (!getNextInject(sim, state)) {
      break;
    }
    now += 30_000;
    state = applyAction(sim, state, { type: "advance" }, FAC, now);
  }
  return applyAction(sim, state, { type: "end" }, FAC, now + 1000);
}

test("every library scenario builds for every industry, size and duration", () => {
  for (const scenarioType of listLibraryScenarios()) {
    for (const industry of INDUSTRIES) {
      for (const organizationSize of ["1-25", "101-500"]) {
        for (const exerciseDuration of ["30 minutes", "60 minutes", "2 hours"]) {
          const sim = buildLibrarySimulation({ organizationName: "Acme", scenarioType, industry, organizationSize, exerciseDuration, maturityLevel: "Advanced" });
          const serialized = JSON.stringify(sim);
          assert.doesNotMatch(serialized, /\{[a-z]+\}/, `unfilled token in ${scenarioType}/${industry}`);
          const roleIds = new Set(sim.roles.map((role) => role.id));
          for (const inject of sim.injects) {
            assert.ok(inject.audience.every((roleId) => roleIds.has(roleId)));
            if (inject.decision) {
              assert.ok(roleIds.has(inject.decision.ownerRoleId));
              assert.equal(inject.decision.options.filter((option) => option.quality === "strong").length, 1);
              assert.ok(inject.decision.csf);
            }
          }
        }
      }
    }
  }
});

test("exercise length scales with duration", () => {
  const count = (exerciseDuration) => buildLibrarySimulation({ scenarioType: "Ransomware", exerciseDuration }).injects.filter((inject) => inject.decision).length;
  assert.ok(count("30 minutes") < count("60 minutes"));
  assert.ok(count("60 minutes") < count("2 hours"));
});

test("strong play scores higher than risky play and risky play triggers consequences", () => {
  for (const scenarioType of listLibraryScenarios()) {
    const sim = buildLibrarySimulation({ organizationName: "Acme", scenarioType, industry: "Healthcare", exerciseDuration: "90 minutes" });
    const strong = buildAfterActionReport(sim, playThrough(sim, "strong"));
    const risky = buildAfterActionReport(sim, playThrough(sim, "risky"));
    assert.ok(strong.overall.score >= 85, `${scenarioType} strong score ${strong.overall.score}`);
    assert.ok(risky.overall.score < 50, `${scenarioType} risky score ${risky.overall.score}`);
    assert.equal(strong.findings.length, 0);
    assert.ok(risky.findings.some((finding) => finding.severity === "High"));
    assert.ok(risky.timeline.some((item) => item.kind === "consequence"), `${scenarioType} has no reachable consequence`);
    assert.ok(!strong.timeline.some((item) => item.kind === "consequence"));
    assert.match(buildReportMarkdown(risky), /## Findings and recommendations/);
  }
});

test("role-restricted injects are hidden from other roles until shared", () => {
  const sim = buildLibrarySimulation({ scenarioType: "Ransomware", industry: "Healthcare" });
  let state = createInitialState(sim, { now: 1 });
  state = applyAction(sim, state, { type: "join", name: "Ivy", roleId: "it" }, { kind: "participant", id: "p1" }, 2);
  state = applyAction(sim, state, { type: "join", name: "Cam", roleId: "comms" }, { kind: "participant", id: "p2" }, 3);
  state = applyAction(sim, state, { type: "start" }, FAC, 4);

  const itView = buildView(sim, state, { kind: "participant", id: "p1" });
  const commsView = buildView(sim, state, { kind: "participant", id: "p2" });
  assert.equal(itView.feed[0].canRead, true);
  assert.equal(commsView.feed[0].canRead, false);
  assert.doesNotMatch(commsView.feed[0].body, /lockd/);
  assert.equal(commsView.feed[0].decision.options[0].quality, undefined, "quality is hidden before commit");
  assert.equal(commsView.feed[0].facilitatorNotes.length, 0);

  state = applyAction(sim, state, { type: "share", injectId: sim.injects[0].id }, FAC, 5);
  assert.equal(buildView(sim, state, { kind: "participant", id: "p2" }).feed[0].canRead, true);
});

test("voting, decision authority and tie-breaks", () => {
  const sim = buildLibrarySimulation({ scenarioType: "Ransomware" });
  const first = sim.injects[0];
  const [a, b] = first.decision.options;
  let state = createInitialState(sim, { now: 1 });
  const owner = { kind: "participant", id: "owner" };
  const other = { kind: "participant", id: "other" };
  state = applyAction(sim, state, { type: "join", name: "Owner", roleId: first.decision.ownerRoleId }, owner, 2);
  state = applyAction(sim, state, { type: "join", name: "Other", roleId: "comms" }, other, 2);

  assert.throws(() => applyAction(sim, state, { type: "vote", injectId: first.id, optionId: a.id }, owner, 3), SimError);
  state = applyAction(sim, state, { type: "start" }, FAC, 3);
  assert.throws(() => applyAction(sim, state, { type: "advance" }, FAC, 4), /Commit or skip/);
  assert.throws(() => applyAction(sim, state, { type: "start" }, other, 4), /Only the facilitator/);

  state = applyAction(sim, state, { type: "vote", injectId: first.id, optionId: a.id }, other, 5);
  state = applyAction(sim, state, { type: "vote", injectId: first.id, optionId: b.id, rationale: "Because." }, owner, 6);
  assert.throws(() => applyAction(sim, state, { type: "commit", injectId: first.id }, other, 7), /decision owner/);

  // 1-1 tie: the decision owner's vote wins.
  state = applyAction(sim, state, { type: "commit", injectId: first.id }, owner, 8);
  assert.equal(state.decisions[first.id].optionId, b.id);
  assert.throws(() => applyAction(sim, state, { type: "vote", injectId: first.id, optionId: a.id }, other, 9), /no longer open/);
  assert.throws(() => applyAction(sim, state, { type: "note", text: "x" }, { kind: "participant", id: "stranger" }, 9), /not part/);
});

test("skipped decisions, curveballs and notes flow into the report", () => {
  const sim = buildLibrarySimulation({ scenarioType: "Insider Threat", exerciseDuration: "30 minutes" });
  let state = createInitialState(sim, { now: 1, facilitatorName: "Dana" });
  state = applyAction(sim, state, { type: "start" }, FAC, 2);
  state = applyAction(sim, state, { type: "skipDecision", injectId: sim.injects[0].id }, FAC, 3);
  state = applyAction(sim, state, { type: "curveball", inject: { title: "Power cut", body: "The building loses power." } }, FAC, 4);
  state = applyAction(sim, state, { type: "note", kind: "gap", text: "No after-hours contact list." }, FAC, 5);
  state = applyAction(sim, state, { type: "note", kind: "action", text: "Print the call tree." }, FAC, 6);
  state = applyAction(sim, state, { type: "advance" }, FAC, 7);
  state = applyAction(sim, state, { type: "end" }, FAC, 8);

  const report = buildAfterActionReport(sim, state);
  assert.equal(report.decisions[0].quality, "undecided");
  assert.ok(report.timeline.some((item) => item.kind === "curveball"));
  assert.ok(report.findings.some((finding) => finding.title === "No after-hours contact list."));
  assert.equal(report.actionItems[0].text, "Print the call tree.");
  assert.equal(report.facilitator, "Dana");
  assert.throws(() => applyAction(sim, state, { type: "advance" }, FAC, 9), /ended/);
});

test("normalizeSimulation rejects junk and bounds hostile input", () => {
  assert.throws(() => normalizeSimulation(null), SimError);
  assert.throws(() => normalizeSimulation({ roles: [], phases: [], injects: [] }), SimError);
  const sim = buildLibrarySimulation({ scenarioType: "Ransomware" });
  const hostile = JSON.parse(JSON.stringify(sim));
  hostile.injects[0].body = "x".repeat(50_000);
  hostile.injects[0].decision.options[0].effects.trust = 9999;
  hostile.injects[0].decision.ownerRoleId = "nobody";
  hostile.injects[0].requires = "unreachable";
  const safe = normalizeSimulation(hostile);
  assert.ok(safe.injects[0].body.length <= 2400);
  assert.equal(safe.injects[0].decision.options[0].effects.trust, 30);
  assert.equal(safe.injects[0].decision.ownerRoleId, safe.roles[0].id);
  assert.equal(safe.injects[0].requires, "");
});

test("known role names from an IRP replace default titles", () => {
  const sim = buildLibrarySimulation({ scenarioType: "Ransomware", knownRoles: ["Chief Information Security Officer", "Practice Administrator"] });
  assert.equal(sim.roles.find((role) => role.id === "it").title, "Chief Information Security Officer");
});
