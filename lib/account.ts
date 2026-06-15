"use client";

import type { ExerciseOptions } from "@/lib/types";

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
  return result;
}

export async function fetchAccount(): Promise<AccountState> {
  return apiFetch("/api/me", { method: "GET", auth: true });
}

export async function signOut() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST", auth: true });
  } finally {
    clearSessionToken();
  }
}

export async function consumeGeneration(options: ExerciseOptions): Promise<AccountState & { tabletopId: string }> {
  return apiFetch("/api/tabletops/consume-generation", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      title: `${options.organizationName.trim()} Tabletop Exercise`,
      organization: options.organizationName,
      industry: options.industry,
      organizationSize: options.organizationSize,
      scenarioType: options.scenarioType,
      maturityLevel: options.maturityLevel,
      exerciseDuration: options.exerciseDuration,
      hasIrp: Boolean(options.irpText?.trim()),
      irpFileName: options.irpFileName || "",
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
