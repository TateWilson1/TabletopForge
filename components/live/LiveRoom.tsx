"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Flag,
  Lightbulb,
  Play,
  RefreshCw,
  Share2,
  Sparkles,
  StickyNote,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { InjectCard } from "@/components/live/InjectCard";
import { ReportView } from "@/components/live/ReportView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { METER_LABELS } from "@/lib/sim";
import type { MeterId, RoomNote, RoomView } from "@/lib/sim/types";
import type { RoomController } from "@/lib/sim/useRoom";
import { cn } from "@/lib/utils";

const METER_ORDER: MeterId[] = ["containment", "operations", "trust", "compliance"];
const NOTE_KINDS: Array<{ id: RoomNote["kind"]; label: string }> = [
  { id: "observation", label: "Observation" },
  { id: "gap", label: "Gap" },
  { id: "action", label: "Action item" },
];

export function LiveRoom({ controller, aiEnabled = false, exitHref = "/saved" }: { controller: RoomController; aiEnabled?: boolean; exitHref?: string }) {
  const { view, fatalError, loading } = controller;

  if (fatalError) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card/85 p-8 text-center">
          <h1 className="text-2xl font-semibold">This exercise is not available</h1>
          <p className="mt-3 text-muted-foreground">{fatalError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild>
              <Link href="/join">Join with a code</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/account">Sign in</Link>
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  if (loading || !view) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
          <RefreshCw className="size-5 animate-spin text-primary" /> Connecting to the exercise…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {controller.offline ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200" role="status">
          <WifiOff className="size-4" /> Connection lost. Reconnecting — your seat is saved.
        </div>
      ) : null}
      {controller.actionError ? (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
          <span>{controller.actionError}</span>
          <button type="button" onClick={controller.clearActionError} aria-label="Dismiss" className="rounded p-0.5 hover:bg-red-500/20">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {view.status === "lobby" ? <Lobby controller={controller} view={view} /> : null}
      {view.status === "running" ? <Running controller={controller} view={view} aiEnabled={aiEnabled} /> : null}
      {view.status === "ended" ? <ReportView controller={controller} view={view} aiEnabled={aiEnabled} exitHref={exitHref} /> : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1500px]">{children}</div>;
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function InviteCard({ controller }: { controller: RoomController }) {
  const [copied, setCopied] = useState(false);
  const room = controller.room;
  if (!room) {
    return null;
  }
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";
  const link = typeof window === "undefined" ? "" : `${window.location.origin}${basePath}/join/?code=${room.joinCode}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Invite your team</p>
      <p className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-foreground" aria-label={`Room code ${room.joinCode.split("").join(" ")}`}>
        {room.joinCode}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Participants open the join page and enter this code. No account needed. Up to {room.maxParticipants} participants on your plan.
      </p>
      <Button variant="outline" className="mt-3" onClick={copy}>
        {copied ? <Check /> : <Copy />} {copied ? "Link copied" : "Copy invite link"}
      </Button>
    </div>
  );
}

function Lobby({ controller, view }: { controller: RoomController; view: RoomView }) {
  const isFacilitator = view.viewer.kind === "facilitator";
  const emptyRoles = view.sim.roles.filter((role) => !view.participants.some((participant) => participant.roleId === role.id));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-lg border border-border bg-card/85 p-6 shadow-signal sm:p-8">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{view.sim.scenarioType}</Badge>
          {view.sim.industry ? <Badge variant="outline">{view.sim.industry}</Badge> : null}
          <Badge variant="outline">{view.sim.durationMinutes} min</Badge>
          <Badge variant="outline">{view.sim.maturityLevel}</Badge>
          {view.sim.source === "ai" ? (
            <Badge variant="outline" className="border-primary/40 text-primary">
              <Sparkles className="mr-1 size-3" /> AI-tailored
            </Badge>
          ) : null}
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{view.sim.title}</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground/90">{view.sim.briefing}</p>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ground rules</h2>
        <ul className="mt-3 space-y-2">
          {view.sim.groundRules.map((rule) => (
            <li key={rule} className="flex items-start gap-3 text-[15px] leading-7">
              <Check className="mt-1.5 size-4 shrink-0 text-primary" /> {rule}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {isFacilitator ? (
            <Button size="lg" disabled={controller.busy} onClick={() => controller.dispatch({ type: "start" })}>
              <Play /> Start the exercise
            </Button>
          ) : (
            <p className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin text-primary" /> Waiting for {view.facilitatorName} to start the exercise…
            </p>
          )}
          {isFacilitator && controller.mode === "remote" && emptyRoles.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Open seats: {emptyRoles.map((role) => role.title).join(", ")}. You can start anyway and cover them yourself.
            </p>
          ) : null}
        </div>
      </section>

      <aside className="space-y-5">
        {isFacilitator && controller.mode === "remote" ? <InviteCard controller={controller} /> : null}
        <Roster controller={controller} view={view} showFocus />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

function Roster({ controller, view, showFocus = false }: { controller: RoomController; view: RoomView; showFocus?: boolean }) {
  const isFacilitator = view.viewer.kind === "facilitator";
  const unassigned = view.participants.filter((participant) => !participant.roleId);

  return (
    <section className="rounded-lg border border-border bg-card/85 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="size-4" /> The response team
      </h2>
      <ul className="mt-3 space-y-3">
        {view.sim.roles.map((role) => {
          const seated = view.participants.filter((participant) => participant.roleId === role.id);
          const isMine = view.viewer.roleId === role.id;
          return (
            <li key={role.id} className={cn("rounded-md border p-3", isMine ? "border-primary/50 bg-primary/5" : "border-border bg-background/50")}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{role.title}</p>
                {seated.length > 0 ? (
                  <span className="truncate text-sm text-primary">{seated.map((participant) => participant.name).join(", ")}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{controller.mode === "local" ? "You" : "Open seat"}</span>
                )}
              </div>
              {showFocus ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{role.focus}</p> : null}
              {view.viewer.kind === "participant" && !isMine && view.status === "lobby" ? (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                  onClick={() => controller.dispatch({ type: "setRole", roleId: role.id })}
                >
                  Take this role
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {unassigned.length > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Observers: {unassigned.map((participant) => participant.name).join(", ")}</p>
      ) : null}
      {isFacilitator && view.participants.length > 0 && view.status !== "ended" ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Manage participants</summary>
          <ul className="mt-2 space-y-1">
            {view.participants.map((participant) => (
              <li key={participant.id} className="flex items-center justify-between gap-2">
                <span>{participant.name}</span>
                <button
                  type="button"
                  className="text-xs text-red-300 hover:underline"
                  onClick={() => controller.dispatch({ type: "removeParticipant", participantId: participant.id })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Running exercise
// ---------------------------------------------------------------------------

function Meter({ id, value }: { id: MeterId; value: number }) {
  const previous = useRef(value);
  const [delta, setDelta] = useState(0);

  useEffect(() => {
    if (previous.current !== value) {
      setDelta(value - previous.current);
      previous.current = value;
      const timer = setTimeout(() => setDelta(0), 4000);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const tone = value >= 60 ? "bg-emerald-400" : value >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{METER_LABELS[id]}</p>
        <p className="text-sm font-semibold tabular-nums">
          {value}
          {delta !== 0 ? <span className={cn("ml-1 text-xs", delta > 0 ? "text-emerald-300" : "text-red-300")}>{delta > 0 ? `+${delta}` : delta}</span> : null}
        </p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={METER_LABELS[id]}>
        <div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatusBar({ controller, view }: { controller: RoomController; view: RoomView }) {
  const myRole = view.sim.roles.find((role) => role.id === view.viewer.roleId);
  return (
    <header className="mb-4 rounded-lg border border-border bg-card/85 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{view.sim.title}</p>
          <p className="text-sm text-muted-foreground">
            {view.viewer.kind === "facilitator"
              ? controller.mode === "local"
                ? "Solo run — you play every role"
                : `Facilitating · ${view.participants.length} participant${view.participants.length === 1 ? "" : "s"}`
              : `${view.viewer.name} · ${myRole?.title ?? "Observer"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controller.room ? (
            <span className="rounded-md border border-border px-2.5 py-1 font-mono text-sm tracking-widest" title="Room code">
              {controller.room.joinCode}
            </span>
          ) : null}
          <ol className="flex flex-wrap items-center gap-1" aria-label="Exercise phases">
            {view.sim.phases.map((phase, index) => (
              <li
                key={phase.id}
                aria-current={index === view.currentPhaseIndex ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
                  index === view.currentPhaseIndex ? "bg-primary text-primary-foreground" : index < view.currentPhaseIndex ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {index < view.currentPhaseIndex ? <Check className="size-3" /> : null}
                {phase.name}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
        {METER_ORDER.map((meter) => (
          <Meter key={meter} id={meter} value={view.meters[meter]} />
        ))}
      </div>
    </header>
  );
}

function FacilitatorConsole({ controller, view, aiEnabled }: { controller: RoomController; view: RoomView; aiEnabled: boolean }) {
  const [showCurveball, setShowCurveball] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const current = view.feed[view.feed.length - 1];
  const decisionOpen = Boolean(view.openDecisionId);
  const finished = !decisionOpen && view.remainingInjects === 0;

  async function sendCurveball() {
    if (await controller.dispatch({ type: "curveball", inject: { title, body } })) {
      setTitle("");
      setBody("");
      setShowCurveball(false);
    }
  }

  return (
    <section className="rounded-lg border border-primary/30 bg-card/90 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">Facilitator console</h2>

      {finished ? (
        <Button className="mt-3 w-full" size="lg" disabled={controller.busy} onClick={() => controller.dispatch({ type: "end" })}>
          <Flag /> End exercise and build the report
        </Button>
      ) : (
        <Button className="mt-3 w-full" size="lg" disabled={!view.canAdvance || controller.busy} onClick={() => controller.dispatch({ type: "advance" })}>
          Next development <ChevronRight />
        </Button>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {decisionOpen
          ? "Waiting on the open decision. Let the team argue it out, then commit."
          : finished
            ? "The script is complete. Wrap up the discussion, then end the exercise."
            : `${view.remainingInjects} development${view.remainingInjects === 1 ? "" : "s"} remaining on the current path.`}
      </p>

      {current?.facilitatorNotes.length ? (
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
            <Lightbulb className="size-3.5" /> Ask the room
          </p>
          <ul className="mt-2 space-y-2">
            {current.facilitatorNotes.map((note) => (
              <li key={note} className="text-sm leading-6">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {current?.restricted && controller.mode === "remote" ? (
        <Button variant="outline" className="mt-3 w-full" disabled={controller.busy} onClick={() => controller.dispatch({ type: "share", injectId: current.id })}>
          <Share2 /> Reveal this message to everyone
        </Button>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-4">
        <Button variant="outline" size="sm" onClick={() => setShowCurveball((value) => !value)}>
          Throw a curveball
        </Button>
        {aiEnabled && controller.requestCurveball ? (
          <Button variant="outline" size="sm" disabled={controller.busy} onClick={() => controller.requestCurveball?.(body)}>
            <Sparkles /> AI curveball
          </Button>
        ) : null}
        {!finished ? (
          confirmEnd ? (
            <Button variant="destructive" size="sm" disabled={controller.busy} onClick={() => controller.dispatch({ type: "end" })}>
              Confirm: end now
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmEnd(true)}>
              End early
            </Button>
          )
        ) : null}
      </div>

      {showCurveball ? (
        <div className="mt-3 space-y-2">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Headline, e.g. The CEO is unreachable" maxLength={160} />
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What just happened? (Also used as a hint for the AI curveball.)" maxLength={1200} />
          <Button size="sm" disabled={!title.trim() || !body.trim() || controller.busy} onClick={sendCurveball}>
            Send to the room
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function NotesPanel({ controller, view }: { controller: RoomController; view: RoomView }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<RoomNote["kind"]>("gap");
  const canWrite = view.viewer.kind !== "observer";

  async function add() {
    if (text.trim() && (await controller.dispatch({ type: "note", text, kind }))) {
      setText("");
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card/85 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <StickyNote className="size-4" /> Shared notes
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Gaps and action items go straight into the after-action report.</p>
      {canWrite ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Note type">
            {NOTE_KINDS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={kind === item.id}
                onClick={() => setKind(item.id)}
                className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", kind === item.id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                add();
              }
            }}
            placeholder={kind === "action" ? "e.g. Print the call tree and keep a copy offsite" : kind === "gap" ? "e.g. Nobody knows who can approve a shutdown" : "What did you notice?"}
            maxLength={600}
            className="min-h-[72px]"
          />
          <Button size="sm" variant="outline" disabled={!text.trim() || controller.busy} onClick={add}>
            Add note
          </Button>
        </div>
      ) : null}
      {view.notes.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {[...view.notes].reverse().map((note) => (
            <li key={note.id} className="rounded-md border border-border bg-background/50 p-3 text-sm leading-6">
              <span
                className={cn(
                  "mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                  note.kind === "gap" ? "bg-red-500/15 text-red-300" : note.kind === "action" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {note.kind === "action" ? "Action" : note.kind}
              </span>
              {note.text}
              <span className="ml-2 text-xs text-muted-foreground">— {note.author}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Running({ controller, view, aiEnabled }: { controller: RoomController; view: RoomView; aiEnabled: boolean }) {
  const isFacilitator = view.viewer.kind === "facilitator";
  const feed = [...view.feed].reverse();
  const latestId = feed[0]?.id;
  const topRef = useRef<HTMLDivElement>(null);

  // Bring a new development into view when it lands.
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [latestId]);

  return (
    <>
      <StatusBar controller={controller} view={view} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <section aria-label="Incident feed" aria-live="polite" className="space-y-4">
          <div ref={topRef} />
          {!isFacilitator && !view.openDecisionId ? (
            <p className="flex items-center gap-2 rounded-md border border-border bg-background/50 px-4 py-3 text-sm text-muted-foreground">
              <ArrowRight className="size-4 text-primary" /> Discuss what you know. The facilitator will release the next development.
            </p>
          ) : null}
          {feed.map((inject) => (
            <InjectCard key={inject.id} inject={inject} view={view} isLatest={inject.id === latestId} busy={controller.busy} dispatch={controller.dispatch} />
          ))}
        </section>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {isFacilitator ? <FacilitatorConsole controller={controller} view={view} aiEnabled={aiEnabled} /> : null}
          <NotesPanel controller={controller} view={view} />
          {controller.mode === "remote" ? <Roster controller={controller} view={view} /> : null}
        </aside>
      </div>
    </>
  );
}
