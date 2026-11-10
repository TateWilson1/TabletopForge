"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LiveRoom } from "@/components/live/LiveRoom";
import { Button } from "@/components/ui/button";
import { buildLibrarySimulation } from "@/lib/sim";
import { useLocalRoom } from "@/lib/sim/useRoom";
import { scenarioTypes } from "@/lib/types";
import { cn } from "@/lib/utils";

const DEMO_ORG = { organizationName: "Northwind Health", industry: "Healthcare", organizationSize: "101-500", maturityLevel: "Intermediate", exerciseDuration: "60 minutes" };

export default function DemoPage() {
  const [scenarioType, setScenarioType] = useState<string>("Ransomware");
  const sim = useMemo(() => buildLibrarySimulation({ ...DEMO_ORG, scenarioType, seed: "demo" }), [scenarioType]);
  const controller = useLocalRoom(sim);
  const inLobby = controller.view?.status === "lobby";

  return (
    <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-5 lg:px-7">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
        <p className="text-sm">
          <span className="font-semibold text-accent">Live demo.</span>{" "}
          <span className="text-muted-foreground">
            A fictional clinic, played solo. Your own exercises are tailored to your organization and incident response plan, and your whole team can join.
          </span>
        </p>
        <Button asChild size="sm">
          <Link href="/generate">Build one for my organization</Link>
        </Button>
      </div>

      {inLobby ? (
        <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Demo scenario">
          {scenarioTypes.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={type === scenarioType}
              onClick={() => setScenarioType(type)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition",
                type === scenarioType ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {type}
            </button>
          ))}
        </div>
      ) : null}

      <LiveRoom controller={controller} exitHref="/generate" />
    </main>
  );
}
