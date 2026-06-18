import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { SessionFromQuery } from "@/components/SessionFromQuery";
import { Card, CardContent } from "@/components/ui/card";

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <Card className="bg-card/80">
            <CardContent className="p-8 text-center text-muted-foreground">Loading session...</CardContent>
          </Card>
        </main>
      }
    >
      <AuthGate>
        <SessionFromQuery />
      </AuthGate>
    </Suspense>
  );
}
