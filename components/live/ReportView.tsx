"use client";

import Link from "next/link";
import { Download, FileText, Printer, RefreshCw, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { QUALITY_META } from "@/components/live/InjectCard";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/sim";
import type { AfterActionReport, ReportFinding, RoomView } from "@/lib/sim/types";
import type { RoomController } from "@/lib/sim/useRoom";
import { cn } from "@/lib/utils";

const TIER_TONE: Record<AfterActionReport["overall"]["tier"], string> = {
  Developing: "text-red-300",
  Functional: "text-amber-300",
  Strong: "text-emerald-300",
  Resilient: "text-emerald-300",
};

const SEVERITY_TONE: Record<ReportFinding["severity"], string> = {
  High: "border-red-400/40 bg-red-500/10 text-red-300",
  Medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  Low: "border-border bg-muted text-muted-foreground",
};

function scoreTone(score: number) {
  return score >= 70 ? "bg-emerald-400" : score >= 50 ? "bg-amber-400" : "bg-red-400";
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ScoreRing({ score, tier }: { score: number; tier: AfterActionReport["overall"]["tier"] }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative size-36 shrink-0" role="img" aria-label={`Readiness score ${score} out of 100, rated ${tier}`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className={cn("stroke-current", TIER_TONE[tier])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("report-section rounded-lg border border-border bg-card/85 p-5 sm:p-6", className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ReportView({
  controller,
  view,
  aiEnabled,
  exitHref,
}: {
  controller: RoomController;
  view: RoomView;
  aiEnabled: boolean;
  exitHref: string;
}) {
  const report = controller.report;

  if (!report) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
        <RefreshCw className="size-5 animate-spin text-primary" /> Building the after-action report…
      </div>
    );
  }

  const isFacilitator = view.viewer.kind === "facilitator";
  const slug = report.exercise.organization.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exercise";
  const fileBase = `${slug}-after-action-${report.exercise.startedAt.slice(0, 10)}`;
  const narrative = report.narrative;

  return (
    <div className="report-root mx-auto max-w-5xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">The exercise has ended. This report is ready to share with leadership and auditors.</p>
        <div className="flex flex-wrap gap-2">
          {isFacilitator && aiEnabled && controller.requestNarrative && !narrative ? (
            <Button variant="outline" disabled={controller.busy} onClick={() => controller.requestNarrative?.()}>
              <Sparkles /> {controller.busy ? "Writing…" : "Add AI analysis"}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print / save PDF
          </Button>
          <Button variant="outline" onClick={() => download(`${fileBase}.md`, controller.markdown, "text/markdown")}>
            <Download /> Markdown
          </Button>
          <Button variant="outline" onClick={() => download(`${fileBase}.json`, JSON.stringify(report, null, 2), "application/json")}>
            <FileText /> JSON
          </Button>
          {controller.reset ? (
            <Button variant="outline" onClick={controller.reset}>
              <RotateCcw /> Run again
            </Button>
          ) : null}
          <Button asChild>
            <Link href={exitHref}>Done</Link>
          </Button>
        </div>
      </div>

      <section className="report-section rounded-lg border border-primary/30 bg-card/90 p-6 sm:p-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <ShieldCheck className="size-4" /> After-action report
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{report.exercise.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {report.exercise.startedAt.slice(0, 10)} · {report.exercise.actualMinutes} minutes · Facilitated by {report.facilitator} ·{" "}
          {report.participants.length} participant{report.participants.length === 1 ? "" : "s"} · {report.exercise.maturityLevel} level
        </p>

        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing score={report.overall.score} tier={report.overall.tier} />
          <div>
            <p className={cn("text-2xl font-semibold", TIER_TONE[report.overall.tier])}>Readiness: {report.overall.tier}</p>
            <p className="mt-2 max-w-2xl text-[15px] leading-7 text-foreground/90">{narrative?.executiveSummary || report.overall.summary}</p>
          </div>
        </div>
      </section>

      {narrative ? (
        <Section title="AI analysis">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { label: "What went well", items: narrative.whatWentWell },
              { label: "Key business risks", items: narrative.keyRisks },
              { label: "How the team worked", items: narrative.coachingNotes },
            ].map((group) => (
              <div key={group.label}>
                <p className="text-sm font-semibold text-muted-foreground">{group.label}</p>
                <ul className="mt-2 space-y-2 text-sm leading-6">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {narrative.nextExercise ? <p className="mt-4 text-sm text-muted-foreground">Next exercise: {narrative.nextExercise}</p> : null}
        </Section>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Response capabilities">
          <ul className="space-y-3">
            {report.capabilities.map((capability) => (
              <li key={capability.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{capability.label}</span>
                  <span className="font-semibold tabular-nums">{capability.score === null ? <span className="font-normal text-muted-foreground">Not exercised</span> : capability.score}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  {capability.score !== null ? <div className={cn("h-full rounded-full", scoreTone(capability.score))} style={{ width: `${capability.score}%` }} /> : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Impact at close">
          <ul className="space-y-3">
            {report.meters.map((meter) => {
              const delta = meter.value - meter.start;
              return (
                <li key={meter.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{meter.label}</span>
                    <span className="font-semibold tabular-nums">
                      {meter.value}
                      <span className={cn("ml-2 text-xs font-normal", delta >= 0 ? "text-emerald-300" : "text-red-300")}>{delta >= 0 ? `+${delta}` : delta}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", scoreTone(meter.value))} style={{ width: `${meter.value}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            {report.overall.onTimeRate}% of decisions were made within the target time. Every dimension started at {report.meters[0]?.start}.
          </p>
        </Section>
      </div>

      <Section title={`Findings and recommendations (${report.findings.length})`}>
        {report.findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No significant gaps were identified. Consider a harder scenario or a higher maturity level next time.</p>
        ) : (
          <ol className="space-y-4">
            {report.findings.map((finding) => (
              <li key={finding.id} className="rounded-md border border-border bg-background/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{finding.id}</span>
                  <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", SEVERITY_TONE[finding.severity])}>{finding.severity} priority</span>
                  <span className="text-xs text-muted-foreground">
                    {finding.capability}
                    {finding.csf ? ` · NIST CSF ${finding.csf}` : ""}
                  </span>
                </div>
                <p className="mt-2 font-semibold leading-snug">{finding.title}</p>
                <p className="mt-2 text-sm leading-6 text-foreground/90">{finding.observation}</p>
                {finding.recommendation ? (
                  <p className="mt-2 text-sm leading-6">
                    <span className="font-semibold text-primary">Recommendation: </span>
                    {finding.recommendation}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Suggested owner: {finding.owner || "To be assigned"} · Target: within {finding.dueInDays} days
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {report.strengths.length > 0 || report.actionItems.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {report.strengths.length > 0 ? (
            <Section title="What went well">
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
                {report.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Section>
          ) : null}
          {report.actionItems.length > 0 ? (
            <Section title="Action items raised by the team">
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
                {report.actionItems.map((item, index) => (
                  <li key={index}>
                    {item.text} <span className="text-muted-foreground">— {item.author}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : null}

      <Section title="Decision log">
        <ol className="space-y-3">
          {report.decisions.map((decision) => (
            <li key={decision.injectId} className="rounded-md border border-border bg-background/50 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{decision.clock}</span>
                <span>{decision.phase}</span>
                <span className={cn("rounded-md border px-2 py-0.5 font-semibold", QUALITY_META[decision.quality].className)}>{QUALITY_META[decision.quality].label}</span>
                <span className="ml-auto">
                  {decision.owner} · {decision.secondsToDecide === null ? "—" : formatDuration(decision.secondsToDecide)}
                  {decision.voters > 1 && decision.alignment !== null ? ` · ${Math.round(decision.alignment * 100)}% aligned` : ""}
                </span>
              </div>
              <p className="mt-2 font-medium leading-snug">{decision.prompt}</p>
              {decision.chosen ? <p className="mt-1 text-sm leading-6 text-foreground/90">{decision.chosen}</p> : null}
              {decision.rationales.length > 0 ? (
                <ul className="mt-2 space-y-1 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                  {decision.rationales.map((item, index) => (
                    <li key={index}>
                      “{item.text}” — {item.by}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Timeline">
          <ol className="space-y-2 text-sm">
            {report.timeline.map((item) => (
              <li key={item.injectId} className="flex gap-3">
                <span className="w-16 shrink-0 font-mono text-xs leading-6 text-muted-foreground">{item.clock}</span>
                <span className="leading-6">
                  {item.kind !== "inject" ? <span className={cn("mr-1 font-semibold", item.kind === "consequence" ? "text-red-300" : "text-accent")}>{item.kind === "consequence" ? "Consequence:" : "Curveball:"}</span> : null}
                  {item.title}
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Participants">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-3">
              <span>{report.facilitator}</span>
              <span className="text-muted-foreground">Facilitator</span>
            </li>
            {report.participants.map((participant, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>{participant.name}</span>
                <span className="text-right text-muted-foreground">{participant.role}</span>
              </li>
            ))}
          </ul>
          {report.participants.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Solo run. Invite the team next time to test how roles communicate.</p> : null}
        </Section>
      </div>

      <Section title="Framework coverage and exercise evidence">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">NIST CSF 2.0 outcomes exercised</p>
            <ul className="mt-2 space-y-2 text-sm">
              {report.frameworks.nistCsf.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="font-mono text-xs text-primary">{item.id}</span> {item.name}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{item.score}</span>
                </li>
              ))}
            </ul>
            {report.frameworks.mitre.length > 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">MITRE ATT&CK techniques simulated: {report.frameworks.mitre.join(", ")}</p>
            ) : null}
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">This exercise may support</p>
            <ul className="mt-2 space-y-2 text-sm">
              {report.frameworks.controls.map((control) => (
                <li key={control.framework}>
                  <span className="font-medium">
                    {control.framework} {control.control}
                  </span>
                  <span className="text-muted-foreground"> — {control.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
          This report documents that {report.exercise.organization} conducted a discussion-based incident response tabletop exercise on{" "}
          {report.exercise.startedAt.slice(0, 10)} (exercise ID {report.exercise.id}). It is supporting evidence, not a certification or legal opinion, and does not
          replace professional legal, compliance, or incident response advice.
        </p>
      </Section>
    </div>
  );
}
