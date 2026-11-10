// TabletopForge live simulation engine.
//
// Pure, dependency-free ES module shared by the backend (authoritative multi-user rooms)
// and the browser (solo/demo play). Everything here is deterministic given its inputs so
// the same reducer can run on either side.

export const SIM_SCHEMA_VERSION = "tabletopforge.sim.v1";

export const CHANNELS = ["email", "siem", "chat", "phone", "news", "ticket", "ransom_note", "social", "regulator", "briefing"];
export const QUALITIES = ["strong", "acceptable", "risky"];
export const METER_IDS = ["containment", "operations", "trust", "compliance"];
export const CAPABILITIES = ["detection", "command", "containment", "evidence", "communications", "compliance", "recovery"];

export const METER_LABELS = {
  containment: "Threat containment",
  operations: "Business operations",
  trust: "Stakeholder trust",
  compliance: "Legal & regulatory",
};

export const CAPABILITY_LABELS = {
  detection: "Detection & analysis",
  command: "Escalation & command",
  containment: "Containment",
  evidence: "Evidence preservation",
  communications: "Communications",
  compliance: "Legal & regulatory",
  recovery: "Recovery",
};

const LIMITS = {
  roles: 10,
  phases: 8,
  injects: 24,
  options: 5,
  participants: 60,
  notes: 200,
  short: 160,
  medium: 600,
  long: 2400,
};

export class SimError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "SimError";
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Normalization: accepts untrusted input (client-posted or AI-generated) and
// returns a safe, bounded simulation or throws SimError.
// ---------------------------------------------------------------------------

export function normalizeSimulation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SimError("Simulation must be an object.");
  }

  const roles = uniqueById(
    asArray(raw.roles, LIMITS.roles).map((role, index) => ({
      id: slug(role?.id) || `role${index + 1}`,
      title: text(role?.title, LIMITS.short) || `Role ${index + 1}`,
      focus: text(role?.focus, LIMITS.medium),
    })),
  );
  if (roles.length < 2) {
    throw new SimError("Simulation needs at least two roles.");
  }
  const roleIds = new Set(roles.map((role) => role.id));

  const phases = uniqueById(
    asArray(raw.phases, LIMITS.phases).map((phase, index) => ({
      id: slug(phase?.id) || `phase${index + 1}`,
      name: text(phase?.name, LIMITS.short) || `Phase ${index + 1}`,
      objective: text(phase?.objective, LIMITS.medium),
    })),
  );
  if (phases.length === 0) {
    throw new SimError("Simulation needs at least one phase.");
  }
  const phaseIds = new Set(phases.map((phase) => phase.id));

  const seenInjects = new Set();
  const injects = [];
  for (const [index, inject] of asArray(raw.injects, LIMITS.injects).entries()) {
    let id = slug(inject?.id) || `inject${index + 1}`;
    if (seenInjects.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenInjects.add(id);

    const body = text(inject?.body, LIMITS.long);
    const title = text(inject?.title, LIMITS.short);
    if (!body || !title) {
      continue;
    }

    injects.push({
      id,
      phaseId: phaseIds.has(slug(inject?.phaseId)) ? slug(inject.phaseId) : phases[Math.min(phases.length - 1, 0)].id,
      clock: text(inject?.clock, 16) || "",
      channel: CHANNELS.includes(inject?.channel) ? inject.channel : "briefing",
      sender: text(inject?.sender, LIMITS.short),
      title,
      body,
      audience: asArray(inject?.audience, LIMITS.roles)
        .map((roleId) => slug(roleId))
        .filter((roleId) => roleIds.has(roleId)),
      requires: slug(inject?.requires) || "",
      unless: slug(inject?.unless) || "",
      facilitatorNotes: asArray(inject?.facilitatorNotes, 6)
        .map((note) => text(note, LIMITS.medium))
        .filter(Boolean),
      mitre: asArray(inject?.mitre, 4)
        .map((technique) => text(technique, 40))
        .filter(Boolean),
      effects: normalizeEffects(inject?.effects),
      decision: normalizeDecision(inject?.decision, roles),
    });
  }

  if (injects.length < 2) {
    throw new SimError("Simulation needs at least two injects.");
  }
  if (!injects.some((inject) => inject.decision)) {
    throw new SimError("Simulation needs at least one decision.");
  }
  // The first inject must always be reachable.
  injects[0].requires = "";
  injects[0].unless = "";

  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id: text(raw.id, 80) || `sim-${hashString(JSON.stringify(injects.map((inject) => inject.title)))}`,
    source: raw.source === "ai" ? "ai" : "library",
    title: text(raw.title, LIMITS.short) || "Incident response simulation",
    organization: text(raw.organization, 120) || "Your organization",
    industry: text(raw.industry, 80),
    organizationSize: text(raw.organizationSize, 40),
    scenarioType: text(raw.scenarioType, 120),
    maturityLevel: text(raw.maturityLevel, 40),
    durationMinutes: clampInt(raw.durationMinutes, 15, 240, 60),
    briefing: text(raw.briefing, LIMITS.long),
    groundRules: asArray(raw.groundRules, 6)
      .map((rule) => text(rule, LIMITS.medium))
      .filter(Boolean),
    roles,
    phases,
    injects,
  };
}

function normalizeEffects(raw) {
  const effects = {};
  for (const meter of METER_IDS) {
    effects[meter] = clampInt(raw?.[meter], -30, 30, 0);
  }
  return effects;
}

function normalizeDecision(raw, roles) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const seen = new Set();
  const options = [];
  for (const [index, option] of asArray(raw.options, LIMITS.options).entries()) {
    const label = text(option?.label, 280);
    if (!label) {
      continue;
    }
    let id = slug(option?.id) || `opt${index + 1}`;
    if (seen.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seen.add(id);
    const effects = normalizeEffects(option?.effects);
    options.push({
      id,
      label,
      quality: QUALITIES.includes(option?.quality) ? option.quality : "acceptable",
      consequence: text(option?.consequence, LIMITS.medium),
      effects,
      setsFlags: asArray(option?.setsFlags, 4)
        .map((flag) => slug(flag))
        .filter(Boolean),
    });
  }

  const prompt = text(raw.prompt, LIMITS.medium);
  if (!prompt || options.length < 2) {
    return null;
  }

  const ownerRoleId = roles.some((role) => role.id === slug(raw.ownerRoleId)) ? slug(raw.ownerRoleId) : roles[0].id;

  return {
    prompt,
    ownerRoleId,
    capability: CAPABILITIES.includes(raw.capability) ? raw.capability : "command",
    csf: text(raw.csf, 24),
    recommendation: text(raw.recommendation, LIMITS.medium),
    timeLimitSeconds: clampInt(raw.timeLimitSeconds, 60, 1800, 300),
    options,
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function createInitialState(sim, { facilitatorName = "Facilitator", now = Date.now() } = {}) {
  return {
    status: "lobby",
    createdAt: now,
    startedAt: null,
    endedAt: null,
    facilitatorName: text(facilitatorName, 80) || "Facilitator",
    participants: {},
    feed: [],
    votes: {},
    decisions: {},
    flags: [],
    meters: Object.fromEntries(METER_IDS.map((meter) => [meter, 60])),
    notes: [],
    customSeq: 0,
  };
}

// Reveal an inject to the table. Scripted consequences (e.g. "the ransomware spread") hit the
// meters the moment they land.
function reveal(state, inject, now) {
  const meterDeltas = {};
  for (const meter of METER_IDS) {
    const before = state.meters[meter];
    state.meters[meter] = clamp(before + (inject.effects?.[meter] ?? 0), 0, 100);
    if (state.meters[meter] !== before) {
      meterDeltas[meter] = state.meters[meter] - before;
    }
  }
  state.feed.push({ injectId: inject.id, revealedAt: now, meterDeltas });
}

function reachable(inject, flags) {
  if (inject.requires && !flags.includes(inject.requires)) {
    return false;
  }
  if (inject.unless && flags.includes(inject.unless)) {
    return false;
  }
  return true;
}

function allInjects(sim, state) {
  return state.customInjects?.length ? [...sim.injects, ...state.customInjects] : sim.injects;
}

export function findInject(sim, state, injectId) {
  return allInjects(sim, state).find((inject) => inject.id === injectId) ?? null;
}

export function getCurrentInject(sim, state) {
  const last = state.feed[state.feed.length - 1];
  return last ? findInject(sim, state, last.injectId) : null;
}

// The decision the team is currently facing, if it has not been resolved yet.
export function getOpenDecision(sim, state) {
  for (let index = state.feed.length - 1; index >= 0; index -= 1) {
    const inject = findInject(sim, state, state.feed[index].injectId);
    if (inject?.decision && !state.decisions[inject.id]) {
      return inject;
    }
  }
  return null;
}

export function getNextInject(sim, state) {
  const revealed = new Set(state.feed.map((entry) => entry.injectId));
  let lastScriptedIndex = -1;
  sim.injects.forEach((inject, index) => {
    if (revealed.has(inject.id)) {
      lastScriptedIndex = index;
    }
  });
  for (let index = lastScriptedIndex + 1; index < sim.injects.length; index += 1) {
    if (reachable(sim.injects[index], state.flags)) {
      return sim.injects[index];
    }
  }
  return null;
}

export function countRemainingInjects(sim, state) {
  const revealed = new Set(state.feed.map((entry) => entry.injectId));
  let lastScriptedIndex = -1;
  sim.injects.forEach((inject, index) => {
    if (revealed.has(inject.id)) {
      lastScriptedIndex = index;
    }
  });
  return sim.injects.slice(lastScriptedIndex + 1).filter((inject) => reachable(inject, state.flags)).length;
}

// ---------------------------------------------------------------------------
// Reducer. `actor` is { kind: "facilitator" } or { kind: "participant", id }.
// Returns a new state; throws SimError for invalid actions.
// ---------------------------------------------------------------------------

export function applyAction(sim, previous, action, actor, now = Date.now()) {
  const state = structuredCloneSafe(previous);
  const isFacilitator = actor?.kind === "facilitator";
  const participant = actor?.kind === "participant" ? state.participants[actor.id] : null;
  if (!isFacilitator && !participant && action?.type !== "join") {
    throw new SimError("You are not part of this exercise.", 403);
  }

  switch (action?.type) {
    case "join": {
      if (actor?.kind !== "participant" || !actor.id) {
        throw new SimError("Invalid participant.");
      }
      if (state.status === "ended") {
        throw new SimError("This exercise has already ended.", 409);
      }
      const name = text(action.name, 60);
      if (!name) {
        throw new SimError("Enter your name to join.");
      }
      const roleId = sim.roles.some((role) => role.id === action.roleId) ? action.roleId : "";
      if (!state.participants[actor.id] && Object.keys(state.participants).length >= LIMITS.participants) {
        throw new SimError("This exercise is full.", 409);
      }
      state.participants[actor.id] = {
        id: actor.id,
        name,
        roleId,
        joinedAt: state.participants[actor.id]?.joinedAt ?? now,
      };
      return state;
    }

    case "setRole": {
      const targetId = isFacilitator && action.participantId ? action.participantId : actor.id;
      const target = state.participants[targetId];
      if (!target) {
        throw new SimError("Participant not found.", 404);
      }
      target.roleId = sim.roles.some((role) => role.id === action.roleId) ? action.roleId : "";
      return state;
    }

    case "removeParticipant": {
      requireFacilitator(isFacilitator);
      delete state.participants[action.participantId];
      return state;
    }

    case "start": {
      requireFacilitator(isFacilitator);
      if (state.status !== "lobby") {
        throw new SimError("The exercise has already started.", 409);
      }
      state.status = "running";
      state.startedAt = now;
      reveal(state, sim.injects[0], now);
      return state;
    }

    case "advance": {
      requireFacilitator(isFacilitator);
      requireRunning(state);
      if (getOpenDecision(sim, state)) {
        throw new SimError("Commit or skip the open decision before advancing.", 409);
      }
      const next = getNextInject(sim, state);
      if (!next) {
        throw new SimError("No injects remain. End the exercise to generate the after-action report.", 409);
      }
      reveal(state, next, now);
      return state;
    }

    case "vote": {
      requireRunning(state);
      const inject = getOpenDecision(sim, state);
      if (!inject || inject.id !== action.injectId) {
        throw new SimError("That decision is no longer open.", 409);
      }
      const option = inject.decision.options.find((item) => item.id === action.optionId);
      if (!option) {
        throw new SimError("Choose one of the listed options.");
      }
      const voterId = isFacilitator ? "facilitator" : actor.id;
      state.votes[inject.id] = state.votes[inject.id] ?? {};
      state.votes[inject.id][voterId] = { optionId: option.id, rationale: text(action.rationale, 400), at: now };
      return state;
    }

    case "commit": {
      requireRunning(state);
      const inject = getOpenDecision(sim, state);
      if (!inject || inject.id !== action.injectId) {
        throw new SimError("That decision is no longer open.", 409);
      }
      const ownsDecision = participant && participant.roleId === inject.decision.ownerRoleId;
      if (!isFacilitator && !ownsDecision) {
        throw new SimError("Only the decision owner or the facilitator can commit this decision.", 403);
      }
      const votes = state.votes[inject.id] ?? {};
      const optionId = action.optionId || tallyWinner(inject, votes, state.participants);
      const option = inject.decision.options.find((item) => item.id === optionId);
      if (!option) {
        throw new SimError("Choose an option or collect at least one vote before committing.");
      }
      const revealedAt = state.feed.find((entry) => entry.injectId === inject.id)?.revealedAt ?? now;
      const meterDeltas = {};
      for (const meter of METER_IDS) {
        const before = state.meters[meter];
        state.meters[meter] = clamp(before + (option.effects[meter] ?? 0), 0, 100);
        meterDeltas[meter] = state.meters[meter] - before;
      }
      for (const flag of option.setsFlags) {
        if (!state.flags.includes(flag)) {
          state.flags.push(flag);
        }
      }
      state.decisions[inject.id] = {
        optionId: option.id,
        skipped: false,
        committedBy: isFacilitator ? "facilitator" : actor.id,
        committedAt: now,
        secondsToDecide: Math.max(0, Math.round((now - revealedAt) / 1000)),
        meterDeltas,
      };
      return state;
    }

    case "skipDecision": {
      requireFacilitator(isFacilitator);
      requireRunning(state);
      const inject = getOpenDecision(sim, state);
      if (!inject || inject.id !== action.injectId) {
        throw new SimError("That decision is no longer open.", 409);
      }
      const revealedAt = state.feed.find((entry) => entry.injectId === inject.id)?.revealedAt ?? now;
      state.decisions[inject.id] = {
        optionId: "",
        skipped: true,
        committedBy: "facilitator",
        committedAt: now,
        secondsToDecide: Math.max(0, Math.round((now - revealedAt) / 1000)),
        meterDeltas: {},
      };
      return state;
    }

    case "share": {
      // Release a role-restricted inject to the whole room.
      requireFacilitator(isFacilitator);
      const entry = state.feed.find((item) => item.injectId === action.injectId);
      if (!entry) {
        throw new SimError("Inject not found.", 404);
      }
      entry.shared = true;
      return state;
    }

    case "curveball": {
      // Facilitator (or AI on the facilitator's behalf) drops an unscripted inject.
      requireFacilitator(isFacilitator);
      requireRunning(state);
      const title = text(action.inject?.title, LIMITS.short);
      const body = text(action.inject?.body, LIMITS.long);
      if (!title || !body) {
        throw new SimError("A curveball needs a title and body.");
      }
      state.customInjects = state.customInjects ?? [];
      if (state.customInjects.length >= 12) {
        throw new SimError("Curveball limit reached for this exercise.", 409);
      }
      state.customSeq += 1;
      const current = getCurrentInject(sim, state);
      const inject = {
        id: `curveball-${state.customSeq}`,
        phaseId: current?.phaseId ?? sim.phases[0].id,
        clock: current?.clock ?? "",
        channel: CHANNELS.includes(action.inject?.channel) ? action.inject.channel : "briefing",
        sender: text(action.inject?.sender, LIMITS.short) || "Exercise control",
        title,
        body,
        audience: [],
        requires: "",
        unless: "",
        facilitatorNotes: asArray(action.inject?.facilitatorNotes, 4)
          .map((note) => text(note, LIMITS.medium))
          .filter(Boolean),
        mitre: [],
        decision: null,
        custom: true,
      };
      state.customInjects.push(inject);
      reveal(state, inject, now);
      return state;
    }

    case "note": {
      const body = text(action.text, 600);
      if (!body) {
        throw new SimError("Note is empty.");
      }
      if (state.notes.length >= LIMITS.notes) {
        throw new SimError("Note limit reached for this exercise.", 409);
      }
      state.notes.push({
        id: `note-${state.notes.length + 1}`,
        authorId: isFacilitator ? "facilitator" : actor.id,
        kind: ["observation", "gap", "action"].includes(action.kind) ? action.kind : "observation",
        text: body,
        injectId: getCurrentInject(sim, state)?.id ?? "",
        at: now,
      });
      return state;
    }

    case "end": {
      requireFacilitator(isFacilitator);
      if (state.status === "ended") {
        return state;
      }
      if (state.status === "lobby") {
        throw new SimError("Start the exercise before ending it.", 409);
      }
      state.status = "ended";
      state.endedAt = now;
      return state;
    }

    default:
      throw new SimError("Unknown action.");
  }
}

export function tallyWinner(inject, votes, participants = {}) {
  const counts = new Map();
  for (const vote of Object.values(votes)) {
    counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return "";
  }
  const top = Math.max(...counts.values());
  const tied = inject.decision.options.filter((option) => counts.get(option.id) === top).map((option) => option.id);
  if (tied.length === 1) {
    return tied[0];
  }
  // Ties are broken by the role that holds decision authority, mirroring a real command structure.
  for (const [voterId, vote] of Object.entries(votes)) {
    if (participants[voterId]?.roleId === inject.decision.ownerRoleId && tied.includes(vote.optionId)) {
      return vote.optionId;
    }
  }
  return tied[0];
}

// ---------------------------------------------------------------------------
// Views: what each seat at the table is allowed to see.
// ---------------------------------------------------------------------------

export function buildView(sim, state, viewer) {
  const isFacilitator = viewer?.kind === "facilitator";
  const me = viewer?.kind === "participant" ? state.participants[viewer.id] ?? null : null;
  const ended = state.status === "ended";
  const openDecision = getOpenDecision(sim, state);
  const phaseOrder = sim.phases.map((phase) => phase.id);

  const feed = state.feed
    .map((entry) => {
      const inject = findInject(sim, state, entry.injectId);
      if (!inject) {
        return null;
      }
      const restricted = inject.audience.length > 0 && !entry.shared;
      const canRead = isFacilitator || ended || !restricted || (me && inject.audience.includes(me.roleId));
      const decision = inject.decision;
      const resolved = state.decisions[inject.id] ?? null;
      const votes = state.votes[inject.id] ?? {};
      const revealOutcome = Boolean(resolved);

      return {
        id: inject.id,
        phaseId: inject.phaseId,
        clock: inject.clock,
        channel: inject.channel,
        sender: inject.sender,
        title: canRead ? inject.title : "Restricted message",
        body: canRead
          ? inject.body
          : `This went only to ${formatRoleList(sim, inject.audience)}. Ask them to brief the team.`,
        restricted,
        canRead,
        audience: inject.audience,
        custom: Boolean(inject.custom),
        revealedAt: entry.revealedAt,
        meterDeltas: entry.meterDeltas ?? {},
        isConsequence: Boolean(inject.requires),
        mitre: isFacilitator || ended ? inject.mitre : [],
        facilitatorNotes: isFacilitator ? inject.facilitatorNotes : [],
        decision: decision
          ? {
              prompt: decision.prompt,
              ownerRoleId: decision.ownerRoleId,
              capability: decision.capability,
              csf: decision.csf,
              timeLimitSeconds: decision.timeLimitSeconds,
              open: !resolved,
              options: decision.options.map((option) => ({
                id: option.id,
                label: option.label,
                votes: Object.values(votes).filter((vote) => vote.optionId === option.id).length,
                quality: isFacilitator || ended || revealOutcome ? option.quality : undefined,
              })),
              myVote: votes[isFacilitator ? "facilitator" : me?.id]?.optionId ?? "",
              voterCount: Object.keys(votes).length,
              rationales:
                isFacilitator || ended
                  ? Object.entries(votes)
                      .filter(([, vote]) => vote.rationale)
                      .map(([voterId, vote]) => ({
                        by: voterId === "facilitator" ? state.facilitatorName : state.participants[voterId]?.name ?? "Participant",
                        optionId: vote.optionId,
                        text: vote.rationale,
                      }))
                  : [],
              outcome: resolved
                ? {
                    optionId: resolved.optionId,
                    skipped: resolved.skipped,
                    consequence: decision.options.find((option) => option.id === resolved.optionId)?.consequence ?? "",
                    meterDeltas: resolved.meterDeltas,
                    secondsToDecide: resolved.secondsToDecide,
                    committedBy:
                      resolved.committedBy === "facilitator"
                        ? state.facilitatorName
                        : state.participants[resolved.committedBy]?.name ?? "Decision owner",
                  }
                : null,
            }
          : null,
      };
    })
    .filter(Boolean);

  const current = getCurrentInject(sim, state);

  return {
    status: state.status,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    facilitatorName: state.facilitatorName,
    viewer: isFacilitator
      ? { kind: "facilitator", id: "facilitator", name: state.facilitatorName, roleId: "" }
      : me
        ? { kind: "participant", id: me.id, name: me.name, roleId: me.roleId }
        : { kind: "observer", id: "", name: "", roleId: "" },
    sim: {
      id: sim.id,
      title: sim.title,
      organization: sim.organization,
      industry: sim.industry,
      scenarioType: sim.scenarioType,
      maturityLevel: sim.maturityLevel,
      durationMinutes: sim.durationMinutes,
      briefing: sim.briefing,
      groundRules: sim.groundRules,
      roles: sim.roles,
      phases: sim.phases,
      source: sim.source,
    },
    participants: Object.values(state.participants).sort((a, b) => a.joinedAt - b.joinedAt),
    meters: state.meters,
    feed,
    currentPhaseIndex: current ? Math.max(0, phaseOrder.indexOf(current.phaseId)) : 0,
    openDecisionId: openDecision?.id ?? "",
    remainingInjects: countRemainingInjects(sim, state),
    canAdvance: isFacilitator && state.status === "running" && !openDecision && Boolean(getNextInject(sim, state)),
    notes: state.notes.map((note) => ({
      ...note,
      author: note.authorId === "facilitator" ? state.facilitatorName : state.participants[note.authorId]?.name ?? "Participant",
    })),
  };
}

function formatRoleList(sim, roleIds) {
  const titles = roleIds.map((roleId) => sim.roles.find((role) => role.id === roleId)?.title).filter(Boolean);
  if (titles.length === 0) {
    return "a specific role";
  }
  if (titles.length === 1) {
    return `the ${titles[0]}`;
  }
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireFacilitator(isFacilitator) {
  if (!isFacilitator) {
    throw new SimError("Only the facilitator can do that.", 403);
  }
}

function requireRunning(state) {
  if (state.status !== "running") {
    throw new SimError(state.status === "lobby" ? "The exercise has not started yet." : "The exercise has ended.", 409);
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function text(value, max) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function slug(value) {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
    : "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.round(number), min, max) : fallback;
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
