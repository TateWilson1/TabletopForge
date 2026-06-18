"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clearSessionToken, fetchAccount, getStoredSessionToken, isAccountApiConfigured } from "@/lib/account";

type GateState = "checking" | "allowed" | "blocked";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>(isAccountApiConfigured() ? "checking" : "allowed");

  useEffect(() => {
    let isMounted = true;

    async function checkAccount() {
      if (!isAccountApiConfigured()) {
        setState("allowed");
        return;
      }

      if (!getStoredSessionToken()) {
        setState("blocked");
        return;
      }

      try {
        await fetchAccount();
        if (isMounted) {
          setState("allowed");
        }
      } catch {
        clearSessionToken();
        if (isMounted) {
          setState("blocked");
        }
      }
    }

    checkAccount();

    return () => {
      isMounted = false;
    };
  }, []);

  function goToAccount() {
    const query = typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, "");
    const next = `${pathname}${query ? `?${query}` : ""}`;
    router.push(`/account?next=${encodeURIComponent(next)}`);
  }

  if (state === "allowed") {
    return <>{children}</>;
  }

  if (state === "checking") {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <Card className="w-full max-w-xl bg-card/85">
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <RefreshCw className="size-5 animate-spin text-primary" suppressHydrationWarning />
            Checking your secure session...
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <Card className="w-full max-w-xl bg-card/85">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-5 text-primary" suppressHydrationWarning />
            Sign In Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            TabletopForge keeps generations, credits, and AI usage tied to a verified account.
          </p>
          <Button onClick={goToAccount}>Go To Sign In</Button>
        </CardContent>
      </Card>
    </main>
  );
}
