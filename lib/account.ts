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
  subscriptionMonthlyLimit: number;
  subscriptionGenerationsUsedThisMonth: number;
  subscriptionGenerationsRemainingThisMonth: number;
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

export interface AccountTabletop {
  id: string;
  title: string;
  status: string;
  generationSource: string;
  industry: string | null;
  scenarioType: string | null;
  maturityLevel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserRow extends AccountUser {
  updatedAt: string;
  tabletopCount: number;
  generationCount: number;
}

export interface AdminOverview {
  stats: {
    totalUsers: number;
    totalTabletops: number;
    totalGenerations: number;
    generationsThisMonth: number;
    totalAiRuns: number;
    failedAiRuns: number;
    inputTokens: number;
    outputTokens: number;
    stripeConfigured: boolean;
    aiFeatureEnabled: boolean;
    databaseBootstrap: {
      attempted: boolean;
      ok: boolean;
      error: string;
    };
  };
  recentUsers: Array<AccountUser & { updatedAt: string }>;
  recentTabletops: Array<AccountTabletop & { email: string | null }>;
  recentBillingEvents: Array<{
    id: string;
    eventType: string;
    createdAt: string;
  }>;
  recentAiRuns: Array<{
    id: string;
    model: string;
    promptType: string;
    status: string;
    inputTokens: number | null;
    outputTokens: number | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
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
      subscriptionMonthlyLimit: 10,
      subscriptionGenerationsUsedThisMonth: 0,
      subscriptionGenerationsRemainingThisMonth:
        account.user.subscriptionStatus === "active" || account.user.subscriptionStatus === "trialing" ? 10 : 0,
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

export async function registerWithPassword(email: string, password: string): Promise<AccountState & { token: string; expiresAt: string }> {
  const result = await apiFetch<AccountState & { token: string; expiresAt: string }>("/api/auth/password-register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  storeSessionToken(result.token);
  const normalized = normalizeAccountState(result);
  if (!normalized) {
    throw new Error("Account response was incomplete.");
  }

  return { ...result, ...normalized };
}

export async function loginWithPassword(email: string, password: string): Promise<AccountState & { token: string; expiresAt: string }> {
  const result = await apiFetch<AccountState & { token: string; expiresAt: string }>("/api/auth/password-login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
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

export async function fetchAccountTabletops(): Promise<AccountTabletop[]> {
  const result = await apiFetch<{ tabletops: AccountTabletop[] }>("/api/tabletops", { method: "GET", auth: true });
  return result.tabletops ?? [];
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

export async function generateAiTabletop(
  options: ExerciseOptions,
): Promise<AccountState & { tabletopId: string; exercise: GeneratedExercise; usage?: { inputTokens: number | null; outputTokens: number | null } }> {
  return apiFetch("/api/tabletops/generate-ai", {
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
        hasHumanFacilitator: false,
        customScenarioDetails: options.customScenarioDetails || "",
        irpText: options.irpText || "",
        irpFileName: options.irpFileName || "",
      },
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

export async function fetchAdminOverview() {
  return apiFetch<AdminOverview>("/api/admin/overview", { method: "GET", auth: true });
}

export async function fetchAdminUsers() {
  const result = await apiFetch<{ users: AdminUserRow[] }>("/api/admin/users", { method: "GET", auth: true });
  return result.users ?? [];
}

export async function grantAdminCredits(email: string, credits: number) {
  return apiFetch<{ ok: boolean; user: AccountUser }>("/api/admin/grant-credit", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ email, credits }),
  });
}

export async function resetAdminFreeGeneration(email: string) {
  return apiFetch<{ ok: boolean; user: AccountUser }>("/api/admin/reset-free-generation", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ email }),
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
