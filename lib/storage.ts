import type { CompletedSession, GeneratedExercise } from "@/lib/types";

const STORAGE_KEY = "tabletopforge.savedExercises";
const COMPLETED_STORAGE_KEY = "tabletopforge.completedSessions";

export function getSavedExercises(): GeneratedExercise[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GeneratedExercise[]) : [];
  } catch {
    return [];
  }
}

export function getSavedExerciseById(id: string): GeneratedExercise | undefined {
  return getSavedExercises().find((exercise) => exercise.id === id);
}

export function saveExercise(exercise: GeneratedExercise) {
  const existing = getSavedExercises().filter((item) => item.id !== exercise.id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([exercise, ...existing]));
}

export function deleteExercise(id: string) {
  const remaining = getSavedExercises().filter((item) => item.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}

export function getCompletedSessions(): CompletedSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(COMPLETED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompletedSession[]) : [];
  } catch {
    return [];
  }
}

export function saveCompletedSession(session: CompletedSession) {
  const existing = getCompletedSessions().filter((item) => item.id !== session.id);
  window.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify([session, ...existing]));
}

export function deleteCompletedSession(id: string) {
  const remaining = getCompletedSessions().filter((item) => item.id !== id);
  window.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(remaining));
}
