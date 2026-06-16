"use client";

import type { ExerciseOptions, GeneratedExercise } from "@/lib/types";

const TOKEN_STORAGE_KEY = "tabletopforge.sessionToken";
const API_URL = (process.env.NEXT_PUBLIC_TABLETOPFORGE_API_URL || "").replace(/\/$/, "");

export interface AccountUser {
  id: string;
  email: string;
  freeGenerationsRemaining: number;
  generationCredits: number;
  billingPlan: string;
  subscriptionStatus: string;
  createdAt: string;
}

export interface AccountEntitlements {
  canGenerate: boolean;
  freeGenerationsRemaining: number;
  generationCredits: number;
  subscriptionStatus: string;
  billingPlan: string;
}

export interface AccountState {
  user: AccountUser;
  entitlements: AccountEntitlements;
}

export interface LoginCodeResponse {
  ok: boolean;
  deliveryMode: "screen" | "email";
  expiresAt: string;
  loginCode?: string;
  message: string;
}

export function normalizeAccountState(account: Partial<AccountState> | null | undefined): AccountState | null {
  if (!account?.user) {
    return null;
  }

  return {
    user: account.user,
    entitlements: account.entitlements ?? {
      canGenerate:
        account.user.subscriptionStatus === "active" ||
        account.user.subscriptionStatus === "trialing" ||
        account.user.generationCredits > 0 ||
        account.user.freeGenerationsRemaining > 0,
      freeGenerationsRemaining: account.user.freeGenerationsRemaining ?? 0,
      generationCredits: account.user.generationCredits ?? 0,
      subscriptionStatus: account.user.subscriptionStatus ?? "none",
      billingPlan: account.user.billingPlan ?? "free",
    },
  };
}

export function isAccountApiConfigured() {
  return API_URL.length > 0;
}

export function getStoredSessionToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function storeSessionToken(token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearSessionToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function requestLoginCode(email: string): Promise<LoginCodeResponse> {
  return apiFetch("/api/auth/request-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyLoginCode(email: string, code: string): Promise<AccountState & { token: string; expiresAt: string }> {
  const result = await apiFetch<AccountState & { token: string; expiresAt: string }>("/api/auth/verify-code", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
  storeSessionToken(result.token);
  const normalized = normalizeAccountState(result);
  if (!normalized) {
    throw new Error("Account response was incomplete.");
  }

  return { ...result, ...normalized };
}

export async function fetchAccount(): Promise<AccountState> {
  const result = await apiFetch<AccountState>("/api/me", { method: "GET", auth: true });
  const normalized = normalizeAccountState(result);
  if (!normalized) {
    throw new Error("Account response was incomplete.");
  }

  return normalized;
}

export async function signOut() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST", auth: true });
  } finally {
    clearSessionToken();
  }
}

export async function generateTabletop(
  options: ExerciseOptions,
  exercise: GeneratedExercise,
): Promise<AccountState & { tabletopId: string; exercise: GeneratedExercise }> {
  return apiFetch("/api/tabletops/generate", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      options: {
        organizationName: options.organizationName,
        industry: options.industry,
        organizationSize: options.organizationSize,
        scenarioType: options.scenarioType,
        maturityLevel: options.maturityLevel,
        exerciseDuration: options.exerciseDuration,
        includeExecutiveQuestions: options.includeExecutiveQuestions,
        includeTechnicalQuestions: options.includeTechnicalQuestions,
        includeComplianceQuestions: options.includeComplianceQuestions,
        includeLessonsLearned: options.includeLessonsLearned,
        hasIrp: Boolean(options.irpText?.trim()),
        irpFileName: options.irpFileName || "",
      },
      exercise,
    }),
  });
}

export async function createCheckoutSession(purchaseType: "tabletop" | "subscription") {
  return apiFetch<{ url: string }>("/api/billing/create-checkout-session", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ purchaseType }),
  });
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  if (!API_URL) {
    throw new Error("The TabletopForge backend URL is not configured.");
  }

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.auth) {
    const token = getStoredSessionToken();
    if (!token) {
      throw new Error("Sign in is required.");
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Request failed.");
  }

  return data as T;
}
