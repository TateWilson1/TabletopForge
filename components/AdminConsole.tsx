"use client";

import { useEffect, useState } from "react";
import { BadgeDollarSign, Database, KeyRound, RefreshCw, ShieldCheck, Sparkles, UserCog, Users } from "lucide-react";
import { AccountPanel } from "@/components/AccountPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchAdminOverview,
  fetchAdminUsers,
  grantAdminCredits,
  isAccountApiConfigured,
  resetAdminFreeGeneration,
  type AdminOverview,
  type AdminUserRow,
} from "@/lib/account";

export function AdminConsole() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState(1);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (isAccountApiConfigured()) {
      refreshAdmin();
    }
  }, []);

  async function refreshAdmin() {
    setIsBusy(true);
    setError("");
    try {
      const [nextOverview, nextUsers] = await Promise.all([fetchAdminOverview(), fetchAdminUsers()]);
      setOverview(nextOverview);
      setUsers(nextUsers);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGrantCredits() {
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      await grantAdminCredits(email, credits);
      setNotice(`Granted ${credits} test credit${credits === 1 ? "" : "s"} to ${email}.`);
      await refreshAdmin();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResetFreeGeneration() {
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      await resetAdminFreeGeneration(email);
      setNotice(`Reset free generation for ${email}.`);
      await refreshAdmin();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  if (!isAccountApiConfigured()) {
    return (
      <Card className="bg-card/85">
        <CardHeader>
          <CardTitle>Admin Console</CardTitle>
          <CardDescription>The backend URL is not configured in this build.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-card/90">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="size-5 text-primary" suppressHydrationWarning />
                Operations Console
              </CardTitle>
              <CardDescription>
                Unlinked admin view. Backend access is restricted by TABLETOPFORGE_ADMIN_EMAILS.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={refreshAdmin} disabled={isBusy}>
              <RefreshCw className="size-4" suppressHydrationWarning />
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      <AccountPanel compact onAccountChange={(account) => {
        if (account) {
          refreshAdmin();
        }
      }} />

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-primary/35 bg-primary/10 p-4 text-sm text-primary">
          {notice}
        </div>
      ) : null}

      {overview ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdminMetric icon={Users} label="Users" value={overview.stats.totalUsers} />
            <AdminMetric icon={Sparkles} label="Tabletops" value={overview.stats.totalTabletops} />
            <AdminMetric icon={BadgeDollarSign} label="Generations This Month" value={overview.stats.generationsThisMonth} />
            <AdminMetric icon={Database} label="AI Runs" value={overview.stats.totalAiRuns} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <Card className="bg-background/45">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserCog className="size-5 text-primary" suppressHydrationWarning />
                  Test Access
                </CardTitle>
                <CardDescription>Grant yourself credits or reset a test account free generation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">User email</Label>
                  <Input id="adminEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminCredits">Credits to grant</Label>
                  <Input
                    id="adminCredits"
                    type="number"
                    min={1}
                    max={50}
                    value={credits}
                    onChange={(event) => setCredits(Number.parseInt(event.target.value, 10) || 1)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleGrantCredits} disabled={isBusy || email.trim().length < 5}>
                    Grant Credits
                  </Button>
                  <Button variant="outline" onClick={handleResetFreeGeneration} disabled={isBusy || email.trim().length < 5}>
                    Reset Free Generation
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-background/45">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <KeyRound className="size-5 text-primary" suppressHydrationWarning />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <StatusPill label="Stripe" active={overview.stats.stripeConfigured} />
                <StatusPill label="AI Feature" active={overview.stats.aiFeatureEnabled} />
                <StatusPill label="Database Bootstrap" active={overview.stats.databaseBootstrap.ok} />
                <div className="rounded-md border border-border bg-background/50 p-3">
                  <p className="text-sm font-medium">AI Tokens</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {overview.stats.inputTokens} in / {overview.stats.outputTokens} out
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <AdminList title="Recent Tabletops" items={overview.recentTabletops.map((item) => `${item.title} - ${item.email ?? "No user"} - ${item.scenarioType ?? "Scenario"}`)} />
            <AdminList title="Recent Billing Events" items={overview.recentBillingEvents.map((item) => `${item.eventType} - ${formatDate(item.createdAt)}`)} />
          </section>

          <AdminUsersTable users={users} />
        </>
      ) : null}
    </div>
  );
}

function AdminMetric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card className="bg-background/45">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <Icon className="size-5 text-primary" suppressHydrationWarning />
      </CardContent>
    </Card>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <p className="text-sm font-medium">{label}</p>
      <Badge className="mt-2" variant={active ? "secondary" : "outline"}>
        {active ? "Ready" : "Off"}
      </Badge>
    </div>
  );
}

function AdminList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="bg-background/45">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={`${title}-${index}-${item}`} className="text-sm leading-6 text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AdminUsersTable({ users }: { users: AdminUserRow[] }) {
  return (
    <Card className="bg-background/45">
      <CardHeader>
        <CardTitle className="text-lg">Users</CardTitle>
        <CardDescription>Latest 100 accounts.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Free</th>
              <th className="py-2 pr-3 font-medium">Credits</th>
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 pr-3 font-medium">Tabletops</th>
              <th className="py-2 pr-3 font-medium">Generations</th>
              <th className="py-2 pr-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border/60">
                <td className="py-3 pr-3 text-foreground">{user.email}</td>
                <td className="py-3 pr-3 text-muted-foreground">{user.freeGenerationsRemaining}</td>
                <td className="py-3 pr-3 text-muted-foreground">{user.generationCredits}</td>
                <td className="py-3 pr-3 text-muted-foreground">{user.billingPlan} / {user.subscriptionStatus}</td>
                <td className="py-3 pr-3 text-muted-foreground">{user.tabletopCount}</td>
                <td className="py-3 pr-3 text-muted-foreground">{user.generationCount}</td>
                <td className="py-3 pr-3 text-muted-foreground">{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
