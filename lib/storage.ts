import type { GeneratedExercise } from "@/lib/types";

const STORAGE_KEY = "tabletopforge.savedExercises";

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

export function saveExercise(exercise: GeneratedExercise) {
  const existing = getSavedExercises().filter((item) => item.id !== exercise.id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([exercise, ...existing]));
}

export function deleteExercise(id: string) {
  const remaining = getSavedExercises().filter((item) => item.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}
