// Typed front door to the shared simulation engine. The implementation lives in
// backend/src/sim so the browser (solo play, demo) and the API (multi-user rooms) run the
// exact same rules.

import * as engine from "@/backend/src/sim/engine.js";
import * as library from "@/backend/src/sim/library.js";
import * as reporting from "@/backend/src/sim/report.js";
import type { GeneratedExercise } from "@/lib/types";
import type { Actor, AfterActionReport, MeterId, RoomAction, RoomState, RoomView, Simulation } from "@/lib/sim/types";

export const METER_LABELS = engine.METER_LABELS as Record<MeterId, string>;
export const CAPABILITY_LABELS = engine.CAPABILITY_LABELS as Record<string, string>;

export function normalizeSimulation(raw: unknown): Simulation {
  return engine.normalizeSimulation(raw) as Simulation;
}

export function createInitialState(sim: Simulation, options?: { facilitatorName?: string }): RoomState {
  return engine.createInitialState(sim, options) as unknown as RoomState;
}

export function applyAction(sim: Simulation, state: RoomState, action: RoomAction, actor: Actor): RoomState {
  return engine.applyAction(sim, state, action, actor) as unknown as RoomState;
}

export function buildView(sim: Simulation, state: RoomState, viewer: Actor): RoomView {
  return engine.buildView(sim, state, viewer) as unknown as RoomView;
}

export function buildAfterActionReport(sim: Simulation, state: RoomState): AfterActionReport {
  return reporting.buildAfterActionReport(sim, state) as unknown as AfterActionReport;
}

export function buildReportMarkdown(report: AfterActionReport): string {
  return reporting.buildReportMarkdown(report);
}

export function formatDuration(seconds: number | null): string {
  return reporting.formatDuration(seconds);
}

export function buildLibrarySimulation(input: {
  organizationName: string;
  industry: string;
  organizationSize?: string;
  scenarioType: string;
  maturityLevel?: string;
  exerciseDuration?: string;
  knownRoles?: string[];
  seed?: string;
}): Simulation {
  return library.buildLibrarySimulation(input) as Simulation;
}

// Every exercise can be played live: AI-generated packages carry their own simulation, and
// older or template-generated ones get the curated library simulation for their scenario.
export function getExerciseSimulation(exercise: GeneratedExercise): Simulation {
  if (exercise.simulation) {
    try {
      return normalizeSimulation(exercise.simulation);
    } catch {
      // Fall through to the library version.
    }
  }

  return buildLibrarySimulation({
    organizationName: exercise.overview.organization,
    industry: exercise.overview.industry,
    organizationSize: exercise.overview.organizationSize,
    scenarioType: exercise.overview.scenario,
    maturityLevel: exercise.overview.maturityLevel,
    exerciseDuration: exercise.overview.duration,
    knownRoles: exercise.irpAnalysis?.organizationStructure?.detectedRoles,
    seed: exercise.id,
  });
}
