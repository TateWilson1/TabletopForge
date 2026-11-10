"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MonitorPlay, RefreshCw, Users } from "lucide-react";
import { LiveRoom } from "@/components/live/LiveRoom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAccount, getStoredSessionToken, isAccountApiConfigured } from "@/lib/account";
import { createRoom } from "@/lib/rooms";
import { getExerciseSimulation } from "@/lib/sim";
import type { Simulation } from "@/lib/sim/types";
import { useLocalRoom } from "@/lib/sim/useRoom";
import type { GeneratedExercise } from "@/lib/types";

function SoloRoom({ sim }: { sim: Simulation }) {
  const controller = useLocalRoom(sim);
  return <LiveRoom controller={controller} exitHref="/saved" />;
}

// Entry point for playing a generated exercise live: solo on one screen, or with the team.
export function LiveLauncher({ exercise }: { exercise: GeneratedExercise }) {
  const router = useRouter();
  const sim = useMemo(() => getExerciseSimulation(exercise), [exercise]);
  const [mode, setMode] = useState<"choose" | "solo">("choose");
  const [facilitatorName, setFacilitatorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [maxParticipants, setMaxParticipants] = useState<number | null>(null);
  const apiReady = isAccountApiConfigured();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    // Resume a solo run that is already in progress.
    try {
      const saved = window.localStorage.getItem(`tabletopforge.liveState.${sim.id}`);
      if (saved && JSON.parse(saved).status !== "lobby") {
        setMode("solo");
      }
    } catch {
      // Ignore unreadable saved state.
    }

    if (apiReady && getStoredSessionToken()) {
      setSignedIn(true);
      fetchAccount()
        .then((account) => setMaxParticipants(account.entitlements.maxRoomParticipants ?? null))
        .catch(() => setSignedIn(false));
    }
  }, [sim.id, apiReady]);

  async function openRoom() {
    setCreating(true);
    setError("");
    try {
      const snapshot = await createRoom(sim, { facilitatorName: facilitatorName.trim() || undefined, tabletopId: exercise.id });
      router.push(`/room?id=${snapshot.room.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open a team room.");
      setCreating(false);
    }
  }

  if (mode === "solo") {
    return <SoloRoom sim={sim} />;
  }

  const decisions = sim.injects.filter((inject) => Boolean((inject as { decision?: unknown }).decision)).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Run this exercise live</h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          {sim.roles.length} roles, {decisions} decision points, and consequences that depend on what the team chooses. Ends with an after-action report you can hand
          to leadership or an auditor.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="flex flex-col rounded-lg border border-primary/40 bg-card/85 p-6">
          <Users className="size-7 text-primary" />
          <h3 className="mt-4 text-xl font-semibold">Invite your team</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
            Everyone joins from their own device with a room code. Each person plays a role, receives the messages that role would really get, and votes on
            decisions. Works in a conference room or fully remote.
          </p>
          {apiReady && signedIn ? (
            <div className="mt-5 space-y-3">
              <Input value={facilitatorName} onChange={(event) => setFacilitatorName(event.target.value)} placeholder="Your name (shown as facilitator)" maxLength={60} />
              <Button className="w-full" size="lg" disabled={creating} onClick={openRoom}>
                {creating ? <RefreshCw className="animate-spin" /> : <Users />} Open a team room
              </Button>
              {maxParticipants ? <p className="text-xs text-muted-foreground">Up to {maxParticipants} participants on your current plan.</p> : null}
              {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <Button asChild className="w-full" size="lg" variant="outline">
                <Link href="/account">{apiReady ? "Sign in to open a team room" : "Team rooms need the hosted backend"}</Link>
              </Button>
            </div>
          )}
        </section>

        <section className="flex flex-col rounded-lg border border-border bg-card/85 p-6">
          <MonitorPlay className="size-7 text-primary" />
          <h3 className="mt-4 text-xl font-semibold">Run it on this screen</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
            Put it on a projector and talk through each decision as a group, or rehearse on your own before the real session. Nothing to set up; progress is saved
            in this browser.
          </p>
          <Button className="mt-5 w-full" size="lg" variant="outline" onClick={() => setMode("solo")}>
            <MonitorPlay /> Start on this screen
          </Button>
        </section>
      </div>
    </div>
  );
}
