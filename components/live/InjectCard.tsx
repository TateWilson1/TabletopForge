"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AtSign,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  Landmark,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  Newspaper,
  Phone,
  ShieldAlert,
  Timer,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { METER_LABELS, formatDuration } from "@/lib/sim";
import type { DecisionQuality, MeterId, Meters, RoomAction, RoomView, SimChannel, ViewInject } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

const CHANNEL_META: Record<SimChannel, { label: string; icon: LucideIcon; accent: string }> = {
  email: { label: "Email", icon: Mail, accent: "text-sky-300 border-sky-400/30 bg-sky-400/10" },
  siem: { label: "Security alert", icon: ShieldAlert, accent: "text-red-300 border-red-400/40 bg-red-500/10" },
  chat: { label: "Chat", icon: MessageSquare, accent: "text-violet-300 border-violet-400/30 bg-violet-400/10" },
  phone: { label: "Phone call", icon: Phone, accent: "text-amber-300 border-amber-400/30 bg-amber-400/10" },
  news: { label: "News", icon: Newspaper, accent: "text-orange-300 border-orange-400/30 bg-orange-400/10" },
  ticket: { label: "Incident log", icon: ClipboardList, accent: "text-teal-300 border-teal-400/30 bg-teal-400/10" },
  ransom_note: { label: "Ransom note", icon: Lock, accent: "text-red-300 border-red-500/50 bg-red-500/15" },
  social: { label: "Social media", icon: AtSign, accent: "text-pink-300 border-pink-400/30 bg-pink-400/10" },
  regulator: { label: "Regulator", icon: Landmark, accent: "text-indigo-300 border-indigo-400/30 bg-indigo-400/10" },
  briefing: { label: "Exercise control", icon: Megaphone, accent: "text-primary border-primary/30 bg-primary/10" },
};

export const QUALITY_META: Record<DecisionQuality | "undecided", { label: string; className: string }> = {
  strong: { label: "Strong response", className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" },
  acceptable: { label: "Workable, with a cost", className: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  risky: { label: "Risky response", className: "border-red-400/40 bg-red-500/10 text-red-300" },
  undecided: { label: "No decision", className: "border-border bg-muted text-muted-foreground" },
};

export function MeterDeltas({ deltas }: { deltas: Partial<Meters> }) {
  const entries = (Object.entries(deltas) as Array<[MeterId, number]>).filter(([, delta]) => delta !== 0);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([meter, delta]) => (
        <span
          key={meter}
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium tabular-nums",
            delta > 0 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-red-400/30 bg-red-500/10 text-red-300",
          )}
        >
          {METER_LABELS[meter]} {delta > 0 ? `+${delta}` : delta}
        </span>
      ))}
    </div>
  );
}

function ArtifactBody({ inject }: { inject: ViewInject }) {
  if (!inject.canRead) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
        <EyeOff className="mt-0.5 size-4 shrink-0" />
        <p>{inject.body}</p>
      </div>
    );
  }

  switch (inject.channel) {
    case "siem":
      return (
        <div className="rounded-md border border-red-400/25 bg-black/40 p-4 font-mono text-[13px] leading-6 text-red-100/90">
          <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-red-300">
            <Activity className="size-3.5" /> {inject.sender}
          </p>
          <p className="font-semibold text-red-200">{inject.title}</p>
          <p className="mt-2 whitespace-pre-line">{inject.body}</p>
        </div>
      );
    case "ransom_note":
      return (
        <div className="rounded-md border border-red-500/40 bg-black p-5 font-mono text-[13px] leading-6 text-red-400">
          <p className="mb-3 text-xs text-red-500/80">{inject.sender}</p>
          <p className="text-base font-bold uppercase tracking-wide">{inject.title}</p>
          <p className="mt-3 whitespace-pre-line">{inject.body}</p>
        </div>
      );
    case "email":
    case "regulator":
      return (
        <div className="overflow-hidden rounded-md border border-border bg-background/60">
          <div className="space-y-1 border-b border-border bg-muted/40 px-4 py-3 text-sm">
            <p>
              <span className="text-muted-foreground">From: </span>
              <span className="font-medium">{inject.sender}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Subject: </span>
              <span className="font-semibold text-foreground">{inject.title}</span>
            </p>
          </div>
          <p className="whitespace-pre-line px-4 py-4 text-[15px] leading-7">{inject.body}</p>
        </div>
      );
    case "phone":
      return (
        <div className="rounded-md border border-amber-400/25 bg-amber-400/5 p-4">
          <p className="text-sm font-medium text-amber-200">
            {inject.sender} — {inject.title}
          </p>
          <p className="mt-2 whitespace-pre-line text-[15px] italic leading-7">{inject.body}</p>
        </div>
      );
    case "chat":
      return (
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-violet-400/15 text-sm font-semibold text-violet-200">
            {inject.sender.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 rounded-md rounded-tl-none border border-border bg-background/60 px-4 py-3">
            <p className="text-sm font-semibold">{inject.sender}</p>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">{inject.title}</p>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-7">{inject.body}</p>
          </div>
        </div>
      );
    case "news":
    case "social":
      return (
        <div className="rounded-md border border-border bg-background/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{inject.sender}</p>
          <p className="mt-1 font-serif text-xl font-semibold leading-snug">{inject.title}</p>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-foreground/90">{inject.body}</p>
        </div>
      );
    default:
      return (
        <div className="rounded-md border border-border bg-background/60 p-4">
          <p className="text-sm font-semibold">{inject.title}</p>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-7">{inject.body}</p>
        </div>
      );
  }
}

function DecisionTimer({ revealedAt, limitSeconds }: { revealedAt: number; limitSeconds: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.round((now - revealedAt) / 1000));
  const remaining = limitSeconds - elapsed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium tabular-nums",
        remaining > 60 ? "border-border text-muted-foreground" : remaining > 0 ? "border-amber-400/40 text-amber-300" : "border-red-400/40 text-red-300",
      )}
    >
      <Timer className="size-3.5" />
      {remaining > 0 ? `${formatDuration(remaining)} left` : `${formatDuration(-remaining)} over target`}
    </span>
  );
}

function DecisionBlock({
  inject,
  view,
  busy,
  dispatch,
}: {
  inject: ViewInject;
  view: RoomView;
  busy: boolean;
  dispatch: (action: RoomAction) => Promise<boolean>;
}) {
  const decision = inject.decision!;
  const [selected, setSelected] = useState(decision.myVote);
  const [rationale, setRationale] = useState("");
  const isFacilitator = view.viewer.kind === "facilitator";
  const ownerRole = view.sim.roles.find((role) => role.id === decision.ownerRoleId);
  const ownsDecision = view.viewer.kind === "participant" && view.viewer.roleId === decision.ownerRoleId;
  const solo = isFacilitator && view.participants.length === 0;
  const ownerSeated = view.participants.some((participant) => participant.roleId === decision.ownerRoleId);
  const canCommit = isFacilitator || ownsDecision;
  const canAct = view.viewer.kind !== "observer";

  useEffect(() => {
    setSelected(decision.myVote);
  }, [decision.myVote]);

  if (decision.outcome) {
    const outcome = decision.outcome;
    const chosen = decision.options.find((option) => option.id === outcome.optionId);
    const quality = outcome.skipped ? "undecided" : chosen?.quality ?? "undecided";
    return (
      <div className="mt-4 rounded-md border border-border bg-background/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decision · {decision.prompt}</p>
          <span className={cn("rounded-md border px-2 py-1 text-xs font-semibold", QUALITY_META[quality].className)}>{QUALITY_META[quality].label}</span>
        </div>
        {outcome.skipped ? (
          <p className="mt-3 text-sm text-muted-foreground">The team moved on without deciding. This is recorded as a gap in the after-action report.</p>
        ) : (
          <>
            <p className="mt-3 flex items-start gap-2 text-[15px] font-medium leading-6">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              {chosen?.label}
            </p>
            <div className="mt-3 rounded-md border-l-2 border-accent bg-accent/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">What happened next</p>
              <p className="mt-1 text-[15px] leading-7">{outcome.consequence}</p>
            </div>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MeterDeltas deltas={outcome.meterDeltas} />
          <span className="text-xs text-muted-foreground">
            {outcome.skipped ? "Skipped" : `Committed by ${outcome.committedBy}`} · {formatDuration(outcome.secondsToDecide)}
            {decision.voterCount > 1 ? ` · ${decision.voterCount} votes` : ""}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Zap className="size-3.5" /> Decision required
        </p>
        <DecisionTimer revealedAt={inject.revealedAt} limitSeconds={decision.timeLimitSeconds} />
      </div>
      <p className="mt-2 text-lg font-semibold leading-snug">{decision.prompt}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Decision authority: <span className="font-medium text-foreground">{ownerRole?.title ?? "Incident lead"}</span>
        {ownsDecision ? " — that is you. Hear the team, then commit." : solo ? "" : ownerSeated ? ". Everyone else advises." : " (no one is in this seat — the facilitator commits)."}
      </p>

      <div className="mt-4 space-y-2" role="radiogroup" aria-label={decision.prompt}>
        {decision.options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            disabled={!canAct || busy}
            onClick={() => setSelected(option.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-md border p-3 text-left text-[15px] leading-6 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
              selected === option.id ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:border-primary/50",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                selected === option.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
              )}
            >
              {"ABCDE"[index]}
            </span>
            <span className="flex-1">{option.label}</span>
            {isFacilitator && !solo ? (
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                <span className="block text-base font-semibold tabular-nums text-foreground">{option.votes ?? 0}</span>
                {option.quality}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {!solo && canAct ? (
        <Textarea
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="Why? One line helps the after-action report (optional)."
          maxLength={400}
          className="mt-3 min-h-[60px] bg-background/60"
        />
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {solo ? (
          <Button disabled={!selected || busy} onClick={() => dispatch({ type: "commit", injectId: inject.id, optionId: selected })}>
            Commit decision
          </Button>
        ) : (
          <>
            {canAct ? (
              <Button
                variant={canCommit ? "outline" : "default"}
                disabled={!selected || busy}
                onClick={() => dispatch({ type: "vote", injectId: inject.id, optionId: selected, rationale })}
              >
                {decision.myVote ? "Update my vote" : "Submit my vote"}
              </Button>
            ) : null}
            {canCommit ? (
              <Button
                disabled={busy || (!selected && decision.voterCount === 0)}
                onClick={() => dispatch({ type: "commit", injectId: inject.id, optionId: ownsDecision ? selected || undefined : undefined })}
                title={ownsDecision ? "Commit your selected option as the team's decision" : "Commit the option with the most votes"}
              >
                {ownsDecision ? "Commit decision" : `Commit team vote (${decision.voterCount})`}
              </Button>
            ) : null}
            {isFacilitator && selected ? (
              <Button variant="ghost" disabled={busy} onClick={() => dispatch({ type: "commit", injectId: inject.id, optionId: selected })}>
                Override with selected
              </Button>
            ) : null}
          </>
        )}
        {isFacilitator ? (
          <Button variant="ghost" disabled={busy} onClick={() => dispatch({ type: "skipDecision", injectId: inject.id })}>
            Skip
          </Button>
        ) : null}
        {!solo ? (
          <span className="text-xs text-muted-foreground">
            {decision.myVote ? "Your vote is in. " : ""}
            {decision.voterCount} voted
          </span>
        ) : null}
      </div>

      {isFacilitator && decision.rationales.length > 0 ? (
        <div className="mt-4 space-y-2 border-t border-border/70 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team reasoning</p>
          {decision.rationales.map((item, index) => (
            <p key={index} className="text-sm leading-6">
              <span className="font-medium">{item.by}</span>
              <span className="text-muted-foreground"> ({"ABCDE"[decision.options.findIndex((option) => option.id === item.optionId)]}): </span>
              {item.text}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function InjectCard({
  inject,
  view,
  isLatest,
  busy,
  dispatch,
}: {
  inject: ViewInject;
  view: RoomView;
  isLatest: boolean;
  busy: boolean;
  dispatch: (action: RoomAction) => Promise<boolean>;
}) {
  const meta = CHANNEL_META[inject.channel] ?? CHANNEL_META.briefing;
  const Icon = inject.isConsequence ? TriangleAlert : meta.icon;
  const audienceTitles = inject.audience.map((roleId) => view.sim.roles.find((role) => role.id === roleId)?.title).filter(Boolean);
  const mine = inject.restricted && view.viewer.kind === "participant" && inject.audience.includes(view.viewer.roleId);

  return (
    <article
      className={cn(
        "rounded-lg border bg-card/85 p-4 shadow-signal sm:p-5",
        isLatest ? "border-primary/40" : "border-border/80 opacity-95",
        inject.isConsequence && "border-red-400/40",
      )}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold", inject.isConsequence ? "border-red-400/40 bg-red-500/10 text-red-300" : meta.accent)}>
          <Icon className="size-3.5" />
          {inject.isConsequence ? "Consequence" : inject.custom ? "Curveball" : meta.label}
        </span>
        {inject.clock ? <span className="rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground">{inject.clock}</span> : null}
        {inject.restricted ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
            <Lock className="size-3" />
            {mine ? "Only your role received this — brief the team" : `Sent only to ${audienceTitles.join(", ")}`}
          </span>
        ) : null}
        {inject.mitre.length > 0 ? <span className="ml-auto font-mono text-[11px] text-muted-foreground">ATT&CK {inject.mitre.join(" · ")}</span> : null}
      </header>

      <ArtifactBody inject={inject} />

      {inject.isConsequence || Object.keys(inject.meterDeltas).length > 0 ? (
        <div className="mt-3">
          <MeterDeltas deltas={inject.meterDeltas} />
        </div>
      ) : null}

      {inject.decision ? <DecisionBlock inject={inject} view={view} busy={busy} dispatch={dispatch} /> : null}
    </article>
  );
}
