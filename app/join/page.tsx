"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAccountApiConfigured } from "@/lib/account";
import { joinRoom, lookupRoom } from "@/lib/rooms";
import type { RoomLookup } from "@/lib/rooms";
import { cn } from "@/lib/utils";

function JoinForm() {
  const router = useRouter();
  const initialCode = (useSearchParams().get("code") ?? "").toUpperCase().slice(0, 6);
  const [code, setCode] = useState(initialCode);
  const [lookup, setLookup] = useState<RoomLookup | null>(null);
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function findRoom(value: string) {
    setBusy(true);
    setError("");
    try {
      setLookup(await lookupRoom(value));
    } catch (caught) {
      setLookup(null);
      setError(caught instanceof Error ? caught.message : "Could not find that exercise.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialCode.length === 6 && isAccountApiConfigured()) {
      findRoom(initialCode);
    }
  }, [initialCode]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (!lookup) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await joinRoom(lookup.room.joinCode, name, roleId);
      router.push(`/room?id=${result.room.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join the exercise.");
      setBusy(false);
    }
  }

  if (!isAccountApiConfigured()) {
    return <p className="text-muted-foreground">Team exercises are not available on this deployment.</p>;
  }

  if (!lookup) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          findRoom(code);
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="room-code">Room code</Label>
          <Input
            id="room-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="ABC123"
            autoComplete="off"
            autoFocus
            inputMode="text"
            className="mt-2 h-14 text-center font-mono text-2xl tracking-[0.4em]"
          />
        </div>
        {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={code.length !== 6 || busy}>
          {busy ? <RefreshCw className="animate-spin" /> : null} Continue <ArrowRight />
        </Button>
      </form>
    );
  }

  const ended = lookup.room.status === "ended";

  return (
    <form onSubmit={join} className="space-y-5">
      <div className="rounded-md border border-border bg-background/50 p-4">
        <p className="text-sm text-muted-foreground">You are joining</p>
        <p className="mt-1 text-lg font-semibold">{lookup.room.title}</p>
        <p className="text-sm text-muted-foreground">Facilitated by {lookup.facilitatorName}</p>
      </div>

      {ended || lookup.full ? (
        <p className="text-sm text-amber-300" role="alert">
          {ended ? "This exercise has already ended." : "This exercise is full. Ask the facilitator to free a seat."}
        </p>
      ) : (
        <>
          <div>
            <Label htmlFor="join-name">Your name</Label>
            <Input id="join-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus autoComplete="name" className="mt-2" />
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Your role in this exercise</legend>
            <p className="mt-1 text-xs text-muted-foreground">Pick the role closest to your real job. More than one person can share a role.</p>
            <div className="mt-3 space-y-2">
              {[...lookup.roles, { id: "", title: "Observer", focus: "Watch and take notes without a role.", takenBy: [] as string[] }].map((role) => (
                <label
                  key={role.id || "observer"}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition",
                    roleId === role.id ? "border-primary bg-primary/10" : "border-border bg-background/50 hover:border-primary/50",
                  )}
                >
                  <input type="radio" name="role" value={role.id} checked={roleId === role.id} onChange={() => setRoleId(role.id)} className="mt-1 accent-emerald-400" />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {role.title}
                      {role.takenBy.length > 0 ? <span className="ml-2 text-xs font-normal text-muted-foreground">({role.takenBy.join(", ")})</span> : null}
                    </span>
                    <span className="block text-sm leading-6 text-muted-foreground">{role.focus}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={!name.trim() || busy}>
            {busy ? <RefreshCw className="animate-spin" /> : null} Take my seat
          </Button>
        </>
      )}
      <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setLookup(null)}>
        Use a different code
      </button>
    </form>
  );
}

export default function JoinPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <div className="rounded-lg border border-border bg-card/85 p-6 shadow-signal sm:p-8">
        <h1 className="text-2xl font-semibold">Join an exercise</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">Enter the 6-character code your facilitator shared. No account needed.</p>
        <Suspense fallback={null}>
          <JoinForm />
        </Suspense>
      </div>
    </main>
  );
}
