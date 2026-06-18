"use client";

import { useEffect, useState } from "react";
import { CreditCard, FileText, LogOut, Mail, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearSessionToken,
  createCheckoutSession,
  fetchAccount,
  fetchAccountTabletops,
  getStoredSessionToken,
  isAccountApiConfigured,
  loginWithPassword,
  registerWithPassword,
  requestLoginCode,
  signOut,
  verifyLoginCode,
  type AccountTabletop,
  type AccountState,
} from "@/lib/account";

export function AccountPanel({
  compact = false,
  onAccountChange,
}: {
  compact?: boolean;
  onAccountChange?: (account: AccountState | null) => void;
}) {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [tabletops, setTabletops] = useState<AccountTabletop[]>([]);

  useEffect(() => {
    if (!isAccountApiConfigured() || !getStoredSessionToken()) {
      onAccountChange?.(null);
      return;
    }

    refreshAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshAccount() {
    setIsBusy(true);
    setError("");
    try {
      const nextAccount = await fetchAccount();
      setAccount(nextAccount);
      onAccountChange?.(nextAccount);
      if (!compact) {
        setTabletops(await fetchAccountTabletops());
      }
    } catch (requestError) {
      clearSessionToken();
      setAccount(null);
      onAccountChange?.(null);
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePasswordSignIn() {
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const nextAccount = await loginWithPassword(email, password);
      setAccount(nextAccount);
      onAccountChange?.(nextAccount);
      if (!compact) {
        setTabletops(await fetchAccountTabletops());
      }
      setNotice("Signed in. Your account is ready.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSendCode() {
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestLoginCode(email);
      setIsCodeSent(true);
      setVerificationCode(result.loginCode ?? "");
      setNotice(result.loginCode ? `Testing code: ${result.loginCode}` : "Verification code sent. Check your email.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCodeSignIn() {
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const nextAccount = await verifyLoginCode(email, verificationCode);
      setAccount(nextAccount);
      onAccountChange?.(nextAccount);
      if (!compact) {
        setTabletops(await fetchAccountTabletops());
      }
      setNotice("Signed in with verification code.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateAccount() {
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const nextAccount = await registerWithPassword(email, password, verificationCode);
      setAccount(nextAccount);
      onAccountChange?.(nextAccount);
      if (!compact) {
        setTabletops(await fetchAccountTabletops());
      }
      setNotice("Account created. Your free tabletop is ready.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    setIsBusy(true);
    setError("");
    try {
      await signOut();
      setAccount(null);
      setTabletops([]);
      onAccountChange?.(null);
      setNotice("Signed out.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCheckout(purchaseType: "tabletop" | "subscription") {
    setIsBusy(true);
    setError("");
    try {
      const checkout = await createCheckoutSession(purchaseType);
      window.location.href = checkout.url;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  if (!isAccountApiConfigured()) {
    return (
      <Card className="bg-card/75">
        <CardHeader>
          <CardTitle>Local Demo Mode</CardTitle>
          <CardDescription>The backend URL is not configured, so generation runs locally in this browser.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (account) {
    return (
      <Card className="bg-card/80">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="size-5 text-primary" suppressHydrationWarning />
                Account
              </CardTitle>
              <CardDescription>{account.user.email}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={refreshAccount} disabled={isBusy}>
                <RefreshCw className="size-4" suppressHydrationWarning />
                Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isBusy}>
                <LogOut className="size-4" suppressHydrationWarning />
                Sign Out
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <AccountMetric label="Free tabletop" value={account.entitlements.freeGenerationsRemaining.toString()} />
            <AccountMetric label="Purchased credits" value={account.entitlements.generationCredits.toString()} />
            <AccountMetric label="Plan" value={formatPlan(account.entitlements.billingPlan, account.entitlements.subscriptionStatus)} />
          </div>

          {account.entitlements.billingPlan === "subscription" ? (
            <div className="rounded-md border border-border bg-background/50 p-3">
              <p className="text-sm font-medium text-foreground">Subscription usage this month</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {account.entitlements.subscriptionGenerationsUsedThisMonth} of{" "}
                {account.entitlements.subscriptionMonthlyLimit} generations used.{" "}
                {account.entitlements.subscriptionGenerationsRemainingThisMonth} remaining.
              </p>
            </div>
          ) : null}

          {!compact ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" onClick={() => handleCheckout("tabletop")} disabled={isBusy}>
                  <CreditCard className="size-4" suppressHydrationWarning />
                  Buy One Tabletop
                </Button>
                <Button onClick={() => handleCheckout("subscription")} disabled={isBusy}>
                  <ShieldCheck className="size-4" suppressHydrationWarning />
                  Start Subscription
                </Button>
              </div>
              <TabletopHistory tabletops={tabletops} />
            </>
          ) : null}

          {notice ? <p className="text-sm text-primary">{notice}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5 text-primary" suppressHydrationWarning />
          Sign In
        </CardTitle>
        <CardDescription>
          Sign in to use your free tabletop generation and keep paid credits tied to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor={compact ? "compactEmail" : "accountEmail"}>Email</Label>
            <Input
              id={compact ? "compactEmail" : "accountEmail"}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor={compact ? "compactPassword" : "accountPassword"}>Password</Label>
            <Input
              id={compact ? "compactPassword" : "accountPassword"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button onClick={handlePasswordSignIn} disabled={isBusy || email.trim().length < 5 || password.length < 1}>
            Sign In
          </Button>
          <Button variant="outline" onClick={handleSendCode} disabled={isBusy || email.trim().length < 5}>
            Send Code
          </Button>
        </div>

        {isCodeSent ? (
          <div className="space-y-4 rounded-md border border-primary/25 bg-primary/10 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor={compact ? "compactCode" : "accountCode"}>Verification code</Label>
                <Input
                  id={compact ? "compactCode" : "accountCode"}
                  inputMode="numeric"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  placeholder="6-digit code"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="outline" onClick={handleCodeSignIn} disabled={isBusy || verificationCode.trim().length < 6}>
                Sign In With Code
              </Button>
              <Button onClick={handleCreateAccount} disabled={isBusy || verificationCode.trim().length < 6 || password.length < 10}>
                Create Verified Account
              </Button>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Account creation requires this code so someone cannot register using an email address they do not control.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">1 free generation</Badge>
          <Badge variant="outline">Paid credits ready</Badge>
          <Badge variant="outline">Subscription ready</Badge>
        </div>

        {notice ? <p className="text-sm text-primary">{notice}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function TabletopHistory({ tabletops }: { tabletops: AccountTabletop[] }) {
  return (
    <section className="rounded-md border border-border bg-background/45 p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="size-4 text-primary" suppressHydrationWarning />
        <h3 className="text-sm font-semibold text-foreground">Recent Tabletop Generations</h3>
      </div>
      {tabletops.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">Generated tabletops will appear here after you create them.</p>
      ) : (
        <div className="space-y-2">
          {tabletops.slice(0, 8).map((tabletop) => (
            <div key={tabletop.id} className="rounded-md border border-border bg-background/55 p-3">
              <p className="text-sm font-medium text-foreground">{tabletop.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {[tabletop.scenarioType, tabletop.industry, tabletop.maturityLevel].filter(Boolean).join(" | ") || "Tabletop generation"}{" "}
                - {new Date(tabletop.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AccountMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function formatPlan(plan: string, status: string) {
  if (plan === "subscription") {
    return status === "active" || status === "trialing" ? "Subscription" : `Subscription ${status}`;
  }

  return "Free";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
