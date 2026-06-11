"use client";

import { useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clipboard,
  ClipboardList,
  Download,
  Lightbulb,
  ListTodo,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { buildCompletedSessionHtmlReport, downloadTextFile, safeFilename } from "@/lib/report-export";
import { saveCompletedSession } from "@/lib/storage";
import type {
  CompletedSession,
  CompletedSessionDecision,
  CompletedSessionImprovementPlanItem,
  GeneratedExercise,
  SessionScoreCategory,
} from "@/lib/types";

interface Inject {
  id: string;
  text: string;
  fact: string;
  unknown: string;
}

interface RevealedInject extends Inject {
  stepTitle: string;
}

interface FacilitatorStep {
  title: string;
  label: string;
  duration: string;
  pressure: "Low" | "Medium" | "High" | "Critical" | "Recovery";
  pressureNote: string;
  facilitatorScript: string;
  scenarioBrief?: string;
  knownFacts: string[];
  unknowns: string[];
  prompts: string[];
  decisions: string[];
  injects: Inject[];
}

export function FacilitatorSession({ exercise }: { exercise: GeneratedExercise }) {
  const steps = useMemo(() => buildFacilitatorSteps(exercise), [exercise]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealedInjects, setRevealedInjects] = useState<RevealedInject[]>([]);
  const [decisionStatuses, setDecisionStatuses] = useState<Record<string, boolean>>({});
  const [customInject, setCustomInject] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [completedSession, setCompletedSession] = useState<CompletedSession | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [skippedInjectIds, setSkippedInjectIds] = useState<string[]>([]);
  const [facilitatorHint, setFacilitatorHint] = useState("");

  const activeStep = steps[activeIndex];
  const progress = Math.round(((activeIndex + 1) / steps.length) * 100);
  const hasHumanFacilitator = exercise.overview.hasHumanFacilitator;
  const activeRevealedInjects = revealedInjects.filter((inject) => inject.stepTitle === activeStep.title);
  const knownFacts = [...activeStep.knownFacts, ...activeRevealedInjects.map((inject) => inject.fact)];
  const unknowns = [...activeStep.unknowns, ...activeRevealedInjects.map((inject) => inject.unknown)];
  const availableInjects = activeStep.injects.filter(
    (inject) => !revealedInjects.some((revealed) => revealed.id === inject.id) && !skippedInjectIds.includes(inject.id),
  );

  function revealInject() {
    const nextInject = availableInjects[0];

    if (nextInject) {
      setRevealedInjects((current) => [...current, { ...nextInject, stepTitle: activeStep.title }]);
    }
  }

  function skipInject() {
    const nextInject = availableInjects[0];

    if (nextInject) {
      setSkippedInjectIds((current) => [...current, nextInject.id]);
      setExportNotice("Inject skipped. You can keep the discussion focused on the current situation.");
    }
  }

  function addCustomInject() {
    const trimmed = customInject.trim();

    if (!trimmed) {
      return;
    }

    setRevealedInjects((current) => [
      ...current,
      {
        id: `${activeStep.title}:custom:${Date.now()}`,
        text: trimmed,
        fact: trimmed,
        unknown: "How does this new development change scope, impact, ownership, or communications?",
        stepTitle: activeStep.title,
      },
    ]);
    setCustomInject("");
  }

  function moveStep(direction: -1 | 1) {
    setActiveIndex((current) => Math.min(steps.length - 1, Math.max(0, current + direction)));
    setFacilitatorHint("");
  }

  function resetSession() {
    setActiveIndex(0);
    setRevealedInjects([]);
    setDecisionStatuses({});
    setCompletedSteps({});
    setSkippedInjectIds([]);
    setFacilitatorHint("");
    setCustomInject("");
    setSessionNotes("");
    setActionItems("");
    setExportNotice("");
    setCompletedSession(null);
    setIsPaused(false);
  }

  function toggleDecision(decision: string, checked: boolean) {
    setDecisionStatuses((current) => ({ ...current, [decisionKey(activeStep.title, decision)]: checked }));
  }

  function toggleStepComplete(checked: boolean) {
    setCompletedSteps((current) => ({ ...current, [activeStep.title]: checked }));
  }

  async function copySessionSummary() {
    await navigator.clipboard.writeText(
      completedSession?.markdownReport ?? buildSessionSummary(exercise, revealedInjects, steps, decisionStatuses, {}, completedSteps, sessionNotes, actionItems),
    );
    setExportNotice(completedSession ? "Scorecard summary copied." : "Session summary copied.");
  }

  function downloadReadableSummary() {
    if (completedSession) {
      downloadTextFile(
        buildCompletedSessionHtmlReport(completedSession),
        `${safeFilename(completedSession.organization)}-scorecard-report.html`,
        "text/html;charset=utf-8",
      );
      setExportNotice("Readable scorecard report downloaded.");
      return;
    }

    const draftSession = buildCompletedSession(exercise, revealedInjects, steps, decisionStatuses, {}, completedSteps, sessionNotes, actionItems);
    downloadTextFile(
      buildCompletedSessionHtmlReport(draftSession),
      `${safeFilename(exercise.overview.organization)}-session-report.html`,
      "text/html;charset=utf-8",
    );
    setExportNotice("Readable session report downloaded.");
  }

  function endExercise() {
    const scorecard = buildCompletedSession(exercise, revealedInjects, steps, decisionStatuses, {}, completedSteps, sessionNotes, actionItems);
    saveCompletedSession(scorecard);
    setCompletedSession(scorecard);
    setExportNotice("Exercise ended. Scorecard saved in this browser.");
    setIsPaused(false);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[0.74fr_1.26fr]">
        <Card className="bg-background/45">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Session Flow</CardTitle>
              <Badge variant="outline">{hasHumanFacilitator ? "Human-led" : "App-led"}</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step, index) => (
              <button
                key={step.title}
                className={`w-full rounded-md border p-3 text-left transition ${
                  index === activeIndex
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background/40 text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setActiveIndex(index)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{step.label}</span>
                  <span className="text-xs">{completedSteps[step.title] ? "Complete" : step.duration}</span>
                </div>
                <p className="mt-1 flex items-center gap-2 text-sm">
                  {completedSteps[step.title] ? <CheckCircle2 className="size-4 text-primary" suppressHydrationWarning /> : null}
                  {step.title}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{activeStep.label}</Badge>
                  <Badge variant="outline">
                    <Clock className="mr-1 size-3" suppressHydrationWarning />
                    Suggested {activeStep.duration}
                  </Badge>
                  <Badge
                    variant={activeStep.pressure === "High" ? "secondary" : "outline"}
                    className={activeStep.pressure === "Critical" ? "border-destructive/60 text-destructive" : ""}
                  >
                    {activeStep.pressure} pressure
                  </Badge>
                </div>
                <CardTitle>{activeStep.title}</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setIsPaused((current) => !current)}>
                  {isPaused ? <Play className="size-4" suppressHydrationWarning /> : <Pause className="size-4" suppressHydrationWarning />}
                  {isPaused ? "Resume" : "Pause"}
                </Button>
                <Button variant="outline" onClick={resetSession}>
                  <RefreshCw className="size-4" suppressHydrationWarning />
                  Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isPaused ? (
              <section className="rounded-md border border-accent/35 bg-accent/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-accent">
                  <Pause className="size-4" suppressHydrationWarning />
                  Exercise Paused
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Use this break to answer comfort questions, clarify roles, or let the group catch up before continuing.
                </p>
              </section>
            ) : null}

            <section className="rounded-md border border-primary/30 bg-primary/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="size-4" suppressHydrationWarning />
                {hasHumanFacilitator ? "Facilitator Script" : "TabletopForge Facilitator"}
              </div>
              <p className="leading-7 text-muted-foreground">{activeStep.facilitatorScript}</p>
            </section>

            <section className="rounded-md border border-border bg-background/55 p-4">
              <div>
                <div className="text-sm font-medium text-foreground">Suggested Time And Facilitation Cue</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{activeStep.pressureNote}</p>
              </div>
            </section>

            {activeStep.scenarioBrief ? (
              <section className="rounded-md border border-border bg-background/55 p-4">
                <div className="mb-2 text-sm font-medium text-foreground">
                  {hasHumanFacilitator ? "Read Aloud Scenario" : "Current Situation"}
                </div>
                <p className="leading-7 text-muted-foreground">{activeStep.scenarioBrief}</p>
              </section>
            ) : null}

            <TriageBoard
              knownFacts={knownFacts}
              unknowns={unknowns}
              decisions={activeStep.decisions}
              stepTitle={activeStep.title}
              decisionStatuses={decisionStatuses}
              onToggleDecision={toggleDecision}
            />

            <PromptList title={hasHumanFacilitator ? "Ask The Room" : "Discuss This Now"} items={activeStep.prompts} />

            <section className="space-y-3 rounded-md border border-border bg-background/45 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <Checkbox checked={completedSteps[activeStep.title] === true} onCheckedChange={(value) => toggleStepComplete(value === true)} className="mt-1" />
                  <div>
                    <p className="text-sm font-medium">Mark this section complete</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">Use this after the group has discussed the prompts and key decisions.</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setFacilitatorHint(buildStuckHint(activeStep, hasHumanFacilitator))}>
                  <Lightbulb className="size-4" suppressHydrationWarning />
                  The team is stuck
                </Button>
              </div>
              {facilitatorHint ? <p className="rounded-md bg-muted p-3 text-sm leading-6 text-muted-foreground">{facilitatorHint}</p> : null}
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Injects</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hasHumanFacilitator
                      ? "Reveal a new development when discussion slows or when the team needs pressure."
                      : "Use this when the team is ready for the situation to evolve."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={revealInject} disabled={availableInjects.length === 0}>
                    <Sparkles className="size-4" suppressHydrationWarning />
                    {hasHumanFacilitator ? "Reveal Inject" : "Reveal Next Development"}
                  </Button>
                  <Button variant="outline" onClick={skipInject} disabled={availableInjects.length === 0}>
                    Skip Inject
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {activeRevealedInjects.length > 0 ? (
                  activeRevealedInjects.map((inject, index) => (
                    <div key={inject.id} className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm leading-6">
                      <span className="font-medium text-accent">Inject {index + 1}: </span>
                      <span className="text-muted-foreground">{inject.text}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                    No injects revealed yet.
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Textarea
                  value={customInject}
                  onChange={(event) => setCustomInject(event.target.value)}
                  placeholder={
                    hasHumanFacilitator
                      ? "Add your own inject, such as: The CEO asks whether customers need to be notified by end of day."
                      : "Add a live development for TabletopForge to present, such as: The CEO asks whether customers need to be notified by end of day."
                  }
                  className="min-h-[88px]"
                />
                <Button variant="secondary" onClick={addCustomInject} className="sm:self-start">
                  <Plus className="size-4" suppressHydrationWarning />
                  Add Live Inject
                </Button>
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button variant="outline" onClick={() => moveStep(-1)} disabled={activeIndex === 0}>
                <ChevronLeft className="size-4" suppressHydrationWarning />
                Back
              </Button>
              {activeIndex === steps.length - 1 ? (
                <Button onClick={endExercise}>
                  <Award className="size-4" suppressHydrationWarning />
                  End Exercise
                </Button>
              ) : (
                <Button onClick={() => moveStep(1)}>
                  Next
                  <ChevronRight className="size-4" suppressHydrationWarning />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {completedSession ? <Scorecard session={completedSession} /> : null}

      <Card className="bg-background/45">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="size-5 text-primary" suppressHydrationWarning />
                {hasHumanFacilitator ? "Facilitator Notes" : "Session Notes"}
              </CardTitle>
              {exportNotice ? <p className="mt-2 text-sm text-primary">{exportNotice}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={copySessionSummary}>
                <Clipboard className="size-4" suppressHydrationWarning />
                Copy Summary
              </Button>
              <Button variant="outline" onClick={downloadReadableSummary}>
                <Download className="size-4" suppressHydrationWarning />
                Download Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Discussion notes</label>
            <Textarea
              value={sessionNotes}
              onChange={(event) => setSessionNotes(event.target.value)}
              placeholder={
                hasHumanFacilitator
                  ? "Capture unclear answers, ownership questions, timeline issues, and communication gaps."
                  : "Capture what the group says, unclear answers, ownership questions, and communication gaps."
              }
              className="min-h-[180px]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Action items</label>
            <Textarea
              value={actionItems}
              onChange={(event) => setActionItems(event.target.value)}
              placeholder="Action item | Owner | Due date | Priority"
              className="min-h-[180px]"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PromptList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="mb-3 font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}-${item}`} className="rounded-md border border-border bg-background/45 p-3 text-sm leading-6 text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TriageBoard({
  knownFacts,
  unknowns,
  decisions,
  stepTitle,
  decisionStatuses,
  onToggleDecision,
}: {
  knownFacts: string[];
  unknowns: string[];
  decisions: string[];
  stepTitle: string;
  decisionStatuses: Record<string, boolean>;
  onToggleDecision: (decision: string, checked: boolean) => void;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <BoardList title="Facts Known" items={knownFacts} />
      <BoardList title="Unknowns" items={unknowns} />
      <DecisionList
        title="Decisions Needed"
        items={decisions}
        stepTitle={stepTitle}
        decisionStatuses={decisionStatuses}
        onToggleDecision={onToggleDecision}
      />
    </section>
  );
}

function BoardList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border bg-background/45 p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}-${item}`} className="text-sm leading-6 text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecisionList({
  title,
  items,
  stepTitle,
  decisionStatuses,
  onToggleDecision,
}: {
  title: string;
  items: string[];
  stepTitle: string;
  decisionStatuses: Record<string, boolean>;
  onToggleDecision: (decision: string, checked: boolean) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background/45 p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-3">
        {items.map((item, index) => {
          const checked = decisionStatuses[decisionKey(stepTitle, item)] === true;

          return (
            <li key={`${stepTitle}-${index}-${item}`} className="flex gap-3 text-sm leading-6 text-muted-foreground">
              <Checkbox checked={checked} onCheckedChange={(value) => onToggleDecision(item, value === true)} className="mt-1" />
              <div className="space-y-1">
                <p>{item}</p>
                <Badge variant={checked ? "secondary" : "outline"}>{checked ? "Decided" : "Unresolved"}</Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function buildStuckHint(step: FacilitatorStep, hasHumanFacilitator: boolean) {
  const firstDecision = step.decisions[0] ?? "the next decision";
  const firstUnknown = step.unknowns[0] ?? "the most important unknown";
  const voice = hasHumanFacilitator ? "Ask the room" : "Pause and discuss";

  return `${voice}: "What do we know, what do we still need, and who is allowed to decide ${firstDecision.toLowerCase()}?" If the team still stalls, capture "${firstUnknown}" as an unresolved unknown and move to the next decision.`;
}

function Scorecard({ session }: { session: CompletedSession }) {
  const irpCoverage = session.categoryScores.find((category) => category.id === "irpCoverage");
  const readinessTier = session.readinessTier ?? buildReadinessTier(session.overallScore);
  const topRisks = session.topRisks ?? session.gaps.slice(0, 3);
  const recommendedActionItems = session.recommendedActionItems ?? buildRecommendedActionItems(session.categoryScores, session.unresolvedUnknowns, session.actionItems);
  const improvementPlan = session.improvementPlan ?? buildImprovementPlan(session.categoryScores, session.unresolvedUnknowns);

  return (
    <Card className="border-primary/30 bg-card/90">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Award className="size-5 text-primary" suppressHydrationWarning />
              Exercise Scorecard
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Saved in this browser as a completed session. IRP coverage is scored only when an IRP was uploaded or pasted.
            </p>
          </div>
          <div className="rounded-md border border-primary/35 bg-primary/10 px-4 py-3 text-center">
            <p className="text-xs uppercase text-muted-foreground">{readinessTier}</p>
            <p className="text-3xl font-semibold text-primary">{session.overallScore}/100</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {session.categoryScores.map((category) => (
            <div key={category.id} className="rounded-md border border-border bg-background/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{category.label}</h3>
                <Badge variant={category.score === null ? "outline" : category.score >= 75 ? "secondary" : "outline"}>
                  {category.score === null ? "N/A" : `${category.score}/100`}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{category.summary}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <BoardList title="Strengths" items={session.strengths} />
          <BoardList title="Gaps To Improve" items={session.gaps} />
        </div>

        <BoardList title="Unresolved Unknowns" items={session.unresolvedUnknowns} />

        <div className="grid gap-4 lg:grid-cols-2">
          <BoardList title="Top Risks" items={topRisks} />
          <div className="rounded-md border border-border bg-background/45 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListTodo className="size-4 text-primary" suppressHydrationWarning />
              Suggested Action Items
            </h3>
            <ul className="space-y-2">
              {recommendedActionItems.map((item, index) => (
                <li key={`action-${index}-${item}`} className="text-sm leading-6 text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-md border border-border bg-background/45 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="size-4 text-primary" suppressHydrationWarning />
            30 / 60 / 90 Day Improvement Plan
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            {improvementPlan.map((item) => (
              <div key={item.window} className="rounded-md border border-border bg-background/55 p-3">
                <Badge variant="secondary">{item.window}</Badge>
                <p className="mt-2 text-sm font-medium">{item.focus}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.outcome}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-accent/35 bg-accent/10 p-4">
          <h3 className="text-sm font-semibold text-accent">Recommended Next Tabletop</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{session.recommendedNextTabletop}</p>
          {irpCoverage?.score === null ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Uploading an IRP next time will add plan coverage scoring and more specific remediation guidance.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function buildFacilitatorSteps(exercise: GeneratedExercise): FacilitatorStep[] {
  const focusGaps = exercise.irpAnalysis?.findings.filter((finding) => finding.status !== "found").slice(0, 3) ?? [];
  const gapPrompts = focusGaps.map((finding) => `The IRP scan flagged ${finding.label.toLowerCase()}. How would the team handle that gap during this incident?`);
  const hasHumanFacilitator = exercise.overview.hasHumanFacilitator;
  const schedule = buildStepSchedule(exercise.overview.duration);
  const pressureProfile = buildPressureProfile(exercise.overview.maturityLevel);
  const maturityAdditions = buildMaturityAdditions(exercise.overview.maturityLevel);
  const injectCount = buildInjectCount(exercise.overview.maturityLevel);

  return [
    {
      label: "Step 1",
      title: "Kickoff And Ground Rules",
      duration: schedule.kickoff,
      pressure: pressureProfile.kickoff,
      pressureNote: `${schedule.kickoff} suggested. Use this stage to establish roles and scope before the scenario pressure starts.`,
      facilitatorScript: hasHumanFacilitator
        ? `Start by reminding the group that this is a no-fault discussion for ${exercise.overview.organization}. The goal is to test decision-making, ownership, and the IRP, not to prove technical expertise.`
        : `Welcome to the ${exercise.overview.organization} tabletop exercise. This is a no-fault discussion. Your goal is to talk through decisions, ownership, communications, and IRP gaps. Assign one person to read responses aloud and one person to capture notes before moving on.`,
      prompts: [
        "Who is participating today, and what role are they representing?",
        "Who will capture decisions, unclear answers, and action items?",
        ...exercise.objectives.slice(0, 2),
        ...maturityAdditions.kickoffPrompts,
      ],
      knownFacts: [
        `${exercise.overview.organization} is running a ${exercise.overview.duration} tabletop exercise.`,
        `The selected scenario is ${exercise.overview.scenario}.`,
        `The goal is to test the IRP and decision-making at a ${exercise.overview.maturityLevel.toLowerCase()} maturity level.`,
      ],
      unknowns: [
        "Whether every required business, technical, and leadership role is represented.",
        "Who will capture decisions, action items, and unclear answers.",
        "Which systems, teams, or business processes are out of scope today.",
      ],
      decisions: [
        "Who is the facilitator?",
        "Who owns note taking?",
        "What is in scope for today's discussion?",
        ...maturityAdditions.kickoffDecisions,
      ],
      injects: buildInjects(exercise, "kickoff", [
        "A senior leader joins late and asks for a simple explanation of what the exercise is trying to prove.",
        "One participant says they have never seen the incident response plan before today.",
        "A department lead asks whether the exercise should include vendors and outside service providers.",
        "The note taker asks whether action items should be captured as risks, tasks, or both.",
      ], injectCount),
    },
    {
      label: "Step 2",
      title: "Initial Report",
      duration: schedule.initial,
      pressure: pressureProfile.initial,
      pressureNote: `${schedule.initial} suggested. The team should triage at a pace that matches the selected maturity level.`,
      facilitatorScript: hasHumanFacilitator
        ? `Read the scenario aloud, then ask the group to describe the first 15 minutes of response. Keep pulling the conversation back to who owns each action and where it is written down.`
        : `Read the scenario below as if it just happened. Discuss the first 15 minutes of response. Do not jump straight to technical fixes. Name who receives the report, who owns each action, and where the IRP supports that answer.`,
      scenarioBrief: exercise.scenarioSummary,
      prompts: [
        ...exercise.discussionQuestions.slice(0, 4),
        ...gapPrompts.slice(0, 1),
        ...maturityAdditions.initialPrompts,
      ],
      knownFacts: [
        "An initial report has been received and needs triage.",
        "The team has not yet confirmed full scope, severity, or business impact.",
        "Early decisions should be documented before the team moves into containment.",
      ],
      unknowns: [
        "How many users, systems, vendors, or business processes may be affected.",
        "Whether the IRP threshold for declaring a formal incident has been met.",
        "Which evidence, messages, logs, or records must be preserved immediately.",
      ],
      decisions: [...exercise.expectedDecisions.slice(0, 3), ...maturityAdditions.initialDecisions],
      injects: buildInjects(exercise, "initial", [
        "A second employee reports a similar issue, suggesting this may not be isolated.",
        "The original reporter is unavailable for follow-up because they left for a meeting.",
        "Leadership asks whether this is officially an incident yet.",
        "The help desk receives a vague report from another team but does not have enough detail to classify it.",
        "A manager asks whether normal business activity should continue while the team investigates.",
      ], injectCount),
    },
    {
      label: "Step 3",
      title: "Escalation And Containment",
      duration: schedule.containment,
      pressure: pressureProfile.containment,
      pressureNote: `${schedule.containment} suggested. Containment choices may create business impact, so decisions should become sharper here.`,
      facilitatorScript: hasHumanFacilitator
        ? "Increase pressure slightly. Ask what the team can do immediately, what needs approval, and what business risk each containment choice creates."
        : "The situation is getting more serious. Before you reveal another development, decide what the team can do immediately, what requires approval, and what business risk each containment choice creates.",
      prompts: [
        ...exercise.discussionQuestions.slice(4, 8),
        ...exercise.gapDiscoveryQuestions.slice(0, 3),
        ...gapPrompts.slice(1, 2),
        ...maturityAdditions.containmentPrompts,
      ],
      knownFacts: [
        "The incident is serious enough to consider containment actions.",
        "Some containment choices may interrupt normal business operations.",
        "Approval authority matters if the response could affect customers, revenue, or critical services.",
      ],
      unknowns: [
        "Which accounts, devices, applications, or data stores are currently exposed.",
        "Who can approve high-impact containment if the usual approver is unavailable.",
        "Whether evidence preservation must happen before containment or recovery actions.",
      ],
      decisions: [...exercise.expectedDecisions.slice(2, 6), ...maturityAdditions.containmentDecisions],
      injects: buildInjects(exercise, "containment", [
        "A department manager says the proposed containment step will interrupt a critical business process.",
        "The team cannot immediately reach the person who normally approves high-impact IT actions.",
        "Someone asks whether evidence should be preserved before containment begins.",
        "The IT lead says they can act quickly, but the business owner wants a written approval first.",
        "A responder finds partial evidence but is not sure whether it is enough to justify containment.",
      ], injectCount),
    },
    {
      label: "Step 4",
      title: "Communications And Impact",
      duration: schedule.communications,
      pressure: pressureProfile.communications,
      pressureNote: `${schedule.communications} suggested. Pressure is highest here because leadership, legal, and stakeholder messaging can diverge quickly.`,
      facilitatorScript: hasHumanFacilitator
        ? "Shift to communication, leadership updates, legal/compliance involvement, and stakeholder expectations. Ask the group to avoid vague answers like 'we would notify people' and name the audience, owner, and message."
        : "Now focus on communications and impact. Avoid vague answers like 'we would notify people.' Name the audience, message owner, approval path, and what facts are confirmed before any update is sent.",
      prompts: [
        ...exercise.discussionQuestions.slice(8, 12),
        ...exercise.gapDiscoveryQuestions.slice(3, 7),
        ...gapPrompts.slice(2, 3),
        ...maturityAdditions.communicationsPrompts,
      ],
      knownFacts: [
        "Leadership and business stakeholders may need a status update.",
        "Some facts are confirmed, while others are still assumptions.",
        "External communication may create legal, regulatory, customer, or vendor impact.",
      ],
      unknowns: [
        "Who needs to be briefed now versus later.",
        "What the team can say confidently without overpromising or speculating.",
        "Whether legal, compliance, cyber insurance, or outside response partners should be engaged.",
      ],
      decisions: [
        "Whether leadership needs an immediate briefing.",
        "Whether legal, compliance, or cyber insurance should be involved.",
        "Whether employees, customers, vendors, or regulators need communication.",
        ...maturityAdditions.communicationsDecisions,
      ],
      injects: buildInjects(exercise, "communications", [
        "An executive asks for a status update they can forward to leadership within 10 minutes.",
        "A customer-facing manager hears rumors and asks what they are allowed to say.",
        "Legal asks what facts are confirmed versus assumed.",
        "A department head wants to send their own message before the official update is ready.",
        "A vendor asks whether they should prepare a statement for their support team.",
      ], injectCount),
    },
    {
      label: "Step 5",
      title: "Recovery And Lessons Learned",
      duration: schedule.recovery,
      pressure: "Recovery",
      pressureNote: `${schedule.recovery} suggested. Shift from urgent response to ownership, follow-through, and proof that gaps will be fixed.`,
      facilitatorScript: hasHumanFacilitator
        ? "Close by turning gaps into improvements. Every unclear answer should become an action item with an owner, due date, and priority."
        : "Close the exercise by turning every unclear answer into an improvement item. Do not leave this section until each major gap has an owner, due date, and priority.",
      prompts: [
        ...exercise.gapDiscoveryQuestions.slice(7, 12),
        "What slowed the response in this discussion?",
        "What would need to be updated in the IRP before this scenario happened for real?",
        "What training or tabletop should happen next?",
        ...maturityAdditions.recoveryPrompts,
      ],
      knownFacts: [
        "The exercise has surfaced decisions, unclear answers, and potential IRP gaps.",
        "Every unresolved issue should become an action item or an accepted risk.",
        "The team needs a way to verify improvements after the exercise.",
      ],
      unknowns: [
        "Which improvement items matter most for reducing real incident risk.",
        "Who owns each update after the tabletop ends.",
        "When the team will retest the improved process.",
      ],
      decisions: [
        "Which action items are high priority?",
        "Who owns each IRP update?",
        "When will the team validate that improvements were completed?",
        ...maturityAdditions.recoveryDecisions,
      ],
      injects: buildInjects(exercise, "recovery", [
        "The facilitator asks each participant to name one thing they would change in the IRP.",
        "Leadership wants the top three improvement items by tomorrow morning.",
        "A participant says the team should rerun this exercise after updates are complete.",
        "The team realizes one action item depends on another department that was not represented.",
        "Someone asks how leadership will know whether the fixes actually worked.",
      ], injectCount),
    },
  ];
}

type StepSchedule = Record<InjectStage, string>;

function buildStepSchedule(duration: GeneratedExercise["overview"]["duration"]): StepSchedule {
  const schedules: Record<GeneratedExercise["overview"]["duration"], StepSchedule> = {
    "30 minutes": {
      kickoff: "3 min",
      initial: "7 min",
      containment: "8 min",
      communications: "7 min",
      recovery: "5 min",
    },
    "60 minutes": {
      kickoff: "5 min",
      initial: "10 min",
      containment: "15 min",
      communications: "15 min",
      recovery: "15 min",
    },
    "90 minutes": {
      kickoff: "10 min",
      initial: "15 min",
      containment: "25 min",
      communications: "20 min",
      recovery: "20 min",
    },
    "2 hours": {
      kickoff: "10 min",
      initial: "20 min",
      containment: "30 min",
      communications: "30 min",
      recovery: "30 min",
    },
  };

  return schedules[duration];
}

function buildPressureProfile(maturity: GeneratedExercise["overview"]["maturityLevel"]): Record<InjectStage, FacilitatorStep["pressure"]> {
  if (maturity === "Basic") {
    return {
      kickoff: "Low",
      initial: "Low",
      containment: "Medium",
      communications: "High",
      recovery: "Recovery",
    };
  }

  if (maturity === "Advanced") {
    return {
      kickoff: "Medium",
      initial: "High",
      containment: "Critical",
      communications: "Critical",
      recovery: "Recovery",
    };
  }

  return {
    kickoff: "Low",
    initial: "Medium",
    containment: "High",
    communications: "Critical",
    recovery: "Recovery",
  };
}

function buildInjectCount(maturity: GeneratedExercise["overview"]["maturityLevel"]) {
  if (maturity === "Basic") {
    return 2;
  }

  if (maturity === "Advanced") {
    return 4;
  }

  return 3;
}

function buildMaturityAdditions(maturity: GeneratedExercise["overview"]["maturityLevel"]) {
  if (maturity === "Basic") {
    return {
      kickoffPrompts: ["What would make this exercise feel successful and practical for the team?"],
      initialPrompts: ["What is the simplest first step the team can agree on?"],
      containmentPrompts: ["What action can reduce risk without creating unnecessary disruption?"],
      communicationsPrompts: ["Who needs a plain-language update first?"],
      recoveryPrompts: ["What one improvement should be fixed first after the exercise?"],
      kickoffDecisions: [],
      initialDecisions: [],
      containmentDecisions: [],
      communicationsDecisions: [],
      recoveryDecisions: [],
    };
  }

  if (maturity === "Advanced") {
    return {
      kickoffPrompts: ["What assumptions should be challenged during this exercise instead of accepted at face value?"],
      initialPrompts: [
        "What evidence would move this from suspected incident to confirmed incident?",
        "What decision would change if the affected data or system belonged to a regulated business process?",
      ],
      containmentPrompts: [
        "What containment option preserves the most evidence while reducing the most risk?",
        "What business process has to be protected if the technical response becomes disruptive?",
      ],
      communicationsPrompts: [
        "What facts must be confirmed before leadership, legal, customers, vendors, or regulators receive an update?",
        "What message changes if this becomes public before the organization is ready?",
      ],
      recoveryPrompts: [
        "How will the team prove the fix worked instead of only documenting that a fix was assigned?",
        "What metric, artifact, or retest would show readiness improved after this tabletop?",
      ],
      kickoffDecisions: ["Which assumptions are in scope to challenge during the exercise?"],
      initialDecisions: ["What evidence threshold confirms incident severity?"],
      containmentDecisions: ["Which containment option balances business impact, risk reduction, and evidence preservation?"],
      communicationsDecisions: ["What facts must be approved before external messaging?"],
      recoveryDecisions: ["How will improvement completion be validated and retested?"],
    };
  }

  return {
    kickoffPrompts: [],
    initialPrompts: ["What would cause the team to escalate this beyond normal IT handling?"],
    containmentPrompts: ["What approval path is needed if containment affects business operations?"],
    communicationsPrompts: ["What update should leadership receive if facts are still incomplete?"],
    recoveryPrompts: ["Which action items need owners before the team leaves the room?"],
    kickoffDecisions: [],
    initialDecisions: [],
    containmentDecisions: [],
    communicationsDecisions: [],
    recoveryDecisions: [],
  };
}

type InjectStage = "kickoff" | "initial" | "containment" | "communications" | "recovery";

const scenarioInjects: Record<GeneratedExercise["overview"]["scenario"], Partial<Record<InjectStage, string[]>>> = {
  "Phishing / Business Email Compromise": {
    initial: [
      "Finance reports that a payment request in the suspicious email resembles a real vendor conversation.",
      "A user says they approved an MFA prompt shortly after entering credentials.",
      "The security tool flags a new mailbox forwarding rule on the affected account.",
      "An executive assistant asks whether the senior executive's account was impersonated or compromised.",
    ],
    containment: [
      "The affected user is in the middle of approving time-sensitive invoices.",
      "IT can revoke sessions, but doing so may interrupt access for a traveling executive.",
      "A mailbox audit search finds suspicious inbox rules but the team has not preserved the original email yet.",
    ],
    communications: [
      "Finance asks whether all payment approvers should be warned before the investigation is complete.",
      "An executive wants a short statement explaining whether any money left the organization.",
      "Employees are forwarding screenshots of the phishing email in a group chat.",
    ],
  },
  Ransomware: {
    initial: [
      "A second team reports renamed files on a different shared drive.",
      "The help desk receives a screenshot of a ransom note from another workstation.",
      "A user says their computer became slow shortly before files stopped opening.",
    ],
    containment: [
      "Disconnecting the shared drive would pause a critical business workflow.",
      "The backup owner says the latest backup status has not been verified today.",
      "A responder wants to rebuild a workstation, but evidence has not been captured.",
    ],
    communications: [
      "Operations asks what to tell employees who cannot access shared files.",
      "Leadership asks whether customers will notice an outage today.",
      "Legal asks whether law enforcement or cyber insurance should be contacted before recovery starts.",
    ],
  },
  "Data Exfiltration": {
    initial: [
      "A monitoring alert shows unusual outbound traffic from a file server.",
      "A manager reports that a sensitive folder was accessed outside normal hours.",
      "The team sees a large archive file created shortly before the alert.",
    ],
    containment: [
      "Blocking outbound traffic could interrupt a legitimate partner data transfer.",
      "The suspected system owner is unavailable to confirm whether the transfer was authorized.",
      "The team needs to decide whether to preserve network logs before changing firewall rules.",
    ],
    communications: [
      "Legal asks whether the data involved could trigger notification obligations.",
      "A business owner asks whether the affected customer list can be named yet.",
      "An executive wants to know whether this should be treated as a confirmed breach.",
    ],
  },
  "Compromised Admin Account": {
    initial: [
      "An admin account signs in from an unfamiliar location shortly after hours.",
      "A privileged configuration change appears in the audit log with no matching change ticket.",
      "The admin user says they did not perform the action shown in the alert.",
    ],
    containment: [
      "Disabling the admin account may block urgent operational support.",
      "The team finds active sessions but is not sure which systems trust the account.",
      "Another administrator can help, but their access has not been recently reviewed.",
    ],
    communications: [
      "Leadership asks whether administrative access to critical systems is still trustworthy.",
      "Compliance asks whether privileged access review records are current.",
      "A system owner wants to know whether they should pause planned maintenance.",
    ],
  },
  "Lost or Stolen Laptop": {
    initial: [
      "The employee cannot remember whether the laptop was locked when it went missing.",
      "The asset record is missing the latest encryption status.",
      "The employee says client files may have been saved locally for travel.",
    ],
    containment: [
      "Remote wipe is available, but the device has not checked in recently.",
      "The team needs to decide whether to disable the user's sessions before confirming theft.",
      "The user's manager says the employee needs immediate access to continue work.",
    ],
    communications: [
      "Legal asks whether the laptop contained regulated or customer data.",
      "HR asks what the employee should document about the loss.",
      "A customer manager asks whether client-facing teams need a prepared answer.",
    ],
  },
  "Vendor / Third-Party Breach": {
    initial: [
      "A vendor sends a vague notice saying they are investigating unauthorized access.",
      "A business owner says the vendor supports a critical workflow but does not know what data they store.",
      "The vendor portal becomes unavailable shortly after the notice.",
    ],
    containment: [
      "Suspending the vendor connection may interrupt customer service.",
      "The contract owner cannot immediately find the breach notification clause.",
      "IT can rotate shared credentials, but the vendor has not confirmed whether credentials were exposed.",
    ],
    communications: [
      "Leadership asks whether the vendor breach affects your organization directly.",
      "Legal asks for the contract, data processing terms, and notification timeline.",
      "A customer-facing team asks whether they can mention the vendor by name.",
    ],
  },
  "Insider Threat": {
    initial: [
      "A manager reports unusual access by an employee who recently gave notice.",
      "Audit logs show bulk downloads from folders outside the employee's normal role.",
      "HR says there is an active employee relations issue involving the user.",
    ],
    containment: [
      "Disabling access could tip off the employee before HR and legal are ready.",
      "The team needs to preserve logs without spreading sensitive allegations.",
      "The user's manager asks whether they should confront the employee directly.",
    ],
    communications: [
      "HR asks who can know about the investigation.",
      "Legal asks whether evidence handling has been documented clearly.",
      "Leadership wants to understand business impact without exposing personnel details.",
    ],
  },
  "Cloud Misconfiguration": {
    initial: [
      "A researcher reports that a cloud storage location may be publicly accessible.",
      "A developer says the setting may have been changed during a recent deployment.",
      "A scanner flags exposed data but does not clearly identify whether anyone accessed it.",
    ],
    containment: [
      "Locking down the cloud resource could break an integration used by customers.",
      "The team needs to decide whether to snapshot logs before changing permissions.",
      "The resource owner is not sure which application depends on the exposed storage.",
    ],
    communications: [
      "Leadership asks whether the exposure is confirmed or only suspected.",
      "A product owner wants to notify customers quickly, but legal asks for more facts first.",
      "Compliance asks whether access logs are retained long enough to assess exposure.",
    ],
  },
};

function buildInjects(exercise: GeneratedExercise, stage: InjectStage, commonInjects: string[], count = 3) {
  const scenarioSpecific = scenarioInjects[exercise.overview.scenario][stage] ?? [];
  const pool = [...scenarioSpecific, ...commonInjects];
  return seededShuffle(pool, `${exercise.id}:${stage}:${exercise.overview.scenario}`)
    .slice(0, count)
    .map((text, index) => ({
      id: `${stage}:${index}:${hashSeed(`${exercise.id}:${text}`)}`,
      text,
      fact: text,
      unknown: stageUnknowns[stage],
    }));
}

const stageUnknowns: Record<InjectStage, string> = {
  kickoff: "Does this change who needs to participate or what should be in scope?",
  initial: "Does this change incident severity, scope, reporting path, or evidence needs?",
  containment: "Does this change containment authority, business impact, or evidence preservation?",
  communications: "Does this change who must be briefed, what can be said, or what approvals are needed?",
  recovery: "Does this change action-item priority, ownership, validation, or retest timing?",
};

function seededShuffle(items: string[], seedText: string) {
  const shuffled = [...items];
  let seed = hashSeed(seedText);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed);
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function nextSeed(seed: number) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function decisionKey(stepTitle: string, decision: string) {
  return `${stepTitle}:${decision}`;
}

function buildSessionSummary(
  exercise: GeneratedExercise,
  revealedInjects: RevealedInject[],
  steps: FacilitatorStep[],
  decisionStatuses: Record<string, boolean>,
  stepNotes: Record<string, string>,
  completedSteps: Record<string, boolean>,
  sessionNotes: string,
  actionItems: string,
) {
  const lines = [
    exercise.markdownReport,
    "",
    "## Live Session Summary",
    `- Session exported: ${new Date().toISOString()}`,
    `- Session mode: ${exercise.overview.hasHumanFacilitator ? "Human facilitator assisted" : "TabletopForge facilitated"}`,
    "",
    "### Revealed Injects",
  ];

  if (revealedInjects.length === 0) {
    lines.push("- None revealed.");
  } else {
    revealedInjects.forEach((inject) => lines.push(`- ${inject.stepTitle}: ${inject.text}`));
  }

  lines.push("");
  lines.push("### Decisions");
  steps.forEach((step) => {
    lines.push(`#### ${step.title}`);
    lines.push(`- Discussion complete: ${completedSteps[step.title] ? "Yes" : "No"}`);
    step.decisions.forEach((decision) => {
      lines.push(`- [${decisionStatuses[decisionKey(step.title, decision)] ? "x" : " "}] ${decision}`);
    });
    if (stepNotes[step.title]?.trim()) {
      lines.push("");
      lines.push("Section notes:");
      lines.push(stepNotes[step.title].trim());
    }
    lines.push("");
  });

  lines.push("### Discussion Notes");
  lines.push(sessionNotes.trim() || "No discussion notes captured.");
  lines.push("");
  lines.push("### Action Items");
  lines.push(actionItems.trim() || "No action items captured.");
  lines.push("");

  return lines.join("\n");
}

function buildCompletedSession(
  exercise: GeneratedExercise,
  revealedInjects: RevealedInject[],
  steps: FacilitatorStep[],
  decisionStatuses: Record<string, boolean>,
  stepNotes: Record<string, string>,
  completedSteps: Record<string, boolean>,
  sessionNotes: string,
  actionItems: string,
): CompletedSession {
  const decisions = steps.flatMap((step) =>
    step.decisions.map((decision) => ({
      stepTitle: step.title,
      decision,
      decided: decisionStatuses[decisionKey(step.title, decision)] === true,
    })),
  );
  const completedInjects = revealedInjects.map((inject) => ({ stepTitle: inject.stepTitle, text: inject.text }));
  const unresolvedUnknowns = buildUnresolvedUnknowns(steps, revealedInjects, decisionStatuses);
  const categoryScores = buildCategoryScores(exercise, steps, decisions, revealedInjects, sessionNotes, actionItems);
  const scoredCategories = categoryScores.filter((category) => category.score !== null);
  const overallScore = Math.round(scoredCategories.reduce((total, category) => total + (category.score ?? 0), 0) / Math.max(1, scoredCategories.length));
  const strengths = buildStrengths(categoryScores, decisions, revealedInjects, actionItems);
  const gaps = buildGaps(categoryScores, unresolvedUnknowns, decisions, actionItems);
  const topRisks = buildTopRisks(categoryScores, unresolvedUnknowns, decisions);
  const recommendedActionItems = buildRecommendedActionItems(categoryScores, unresolvedUnknowns, actionItems);
  const improvementPlan = buildImprovementPlan(categoryScores, unresolvedUnknowns);
  const recommendedNextTabletop = buildRecommendedNextTabletop(exercise, categoryScores);
  const readinessTier = buildReadinessTier(overallScore);
  const completedStepTitles = steps.filter((step) => completedSteps[step.title]).map((step) => step.title);
  const aiContext = {
    schemaVersion: "tabletopforge.session.v2" as const,
    exerciseId: exercise.id,
    organization: exercise.overview.organization,
    scenario: exercise.overview.scenario,
    maturityLevel: exercise.overview.maturityLevel,
    hasIrpAnalysis: Boolean(exercise.irpAnalysis),
    irpFindings:
      exercise.irpAnalysis?.findings.map((finding) => ({
        id: finding.id,
        label: finding.label,
        status: finding.status,
        summary: finding.summary,
      })) ?? [],
    decisions,
    revealedInjects: completedInjects,
    unresolvedUnknowns,
    completedSteps: completedStepTitles,
    stepNotes,
    readinessTier,
    topRisks,
    recommendedActionItems,
    improvementPlan,
    sessionNotes,
    actionItems,
  };
  const completedAt = new Date().toISOString();
  const session: CompletedSession = {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    completedAt,
    organization: exercise.overview.organization,
    scenario: exercise.overview.scenario,
    overallScore,
    readinessTier,
    categoryScores,
    strengths,
    gaps,
    topRisks,
    recommendedActionItems,
    improvementPlan,
    unresolvedUnknowns,
    recommendedNextTabletop,
    decisions,
    revealedInjects: completedInjects,
    completedSteps: completedStepTitles,
    stepNotes,
    sessionNotes,
    actionItems,
    aiContext,
    markdownReport: "",
  };

  return {
    ...session,
    markdownReport: buildCompletedSessionMarkdown(exercise, session),
  };
}

function buildCategoryScores(
  exercise: GeneratedExercise,
  steps: FacilitatorStep[],
  decisions: CompletedSessionDecision[],
  revealedInjects: RevealedInject[],
  sessionNotes: string,
  actionItems: string,
): SessionScoreCategory[] {
  return [
    scoreDecisionCategory("escalation", "Escalation", decisions, ["Kickoff And Ground Rules", "Initial Report"], 8, "roles, triage, and incident declaration"),
    scoreDecisionCategory("containment", "Containment", decisions, ["Escalation And Containment"], 6, "containment authority and business impact"),
    scoreDecisionCategory("communications", "Communications", decisions, ["Communications And Impact"], 6, "leadership, legal, and stakeholder updates"),
    scoreEvidenceHandling(exercise, decisions, revealedInjects),
    scoreRecovery(decisions, actionItems, sessionNotes),
    scoreIrpCoverage(exercise),
  ];
}

function scoreDecisionCategory(
  id: SessionScoreCategory["id"],
  label: string,
  decisions: CompletedSessionDecision[],
  stepTitles: string[],
  bonus: number,
  focus: string,
): SessionScoreCategory {
  const relevant = decisions.filter((decision) => stepTitles.includes(decision.stepTitle));
  const score = boundedScore(Math.round(decisionRatio(relevant) * 84 + bonus));
  return {
    id,
    label,
    score,
    summary: `${score >= 75 ? "Strong" : score >= 50 ? "Partial" : "Weak"} coverage of ${focus}; ${relevant.filter((decision) => decision.decided).length} of ${relevant.length} decisions were marked decided.`,
  };
}

function scoreEvidenceHandling(exercise: GeneratedExercise, decisions: CompletedSessionDecision[], revealedInjects: RevealedInject[]): SessionScoreCategory {
  const evidenceSignals = decisions.filter((decision) => /evidence|preserv|log|record|audit|mailbox/i.test(decision.decision));
  const scenarioEvidenceBoost = /Data Exfiltration|Compromised Admin Account|Cloud Misconfiguration|Phishing|Ransomware/.test(exercise.overview.scenario) ? 8 : 4;
  const injectEvidenceBoost = revealedInjects.some((inject) => /evidence|log|audit|mailbox|backup|snapshot/i.test(inject.text)) ? 8 : 0;
  const score = boundedScore(Math.round(decisionRatio(evidenceSignals.length ? evidenceSignals : decisions.slice(0, 3)) * 76 + scenarioEvidenceBoost + injectEvidenceBoost));
  return {
    id: "evidence",
    label: "Evidence Handling",
    score,
    summary: `${score >= 75 ? "Good" : score >= 50 ? "Developing" : "Limited"} attention to evidence, logs, audit data, and preservation needs.`,
  };
}

function scoreRecovery(decisions: CompletedSessionDecision[], actionItems: string, sessionNotes: string): SessionScoreCategory {
  const recoveryDecisions = decisions.filter((decision) => decision.stepTitle === "Recovery And Lessons Learned");
  const actionItemBoost = actionItems.trim().length > 0 ? 18 : 0;
  const notesBoost = sessionNotes.trim().length > 0 ? 8 : 0;
  const score = boundedScore(Math.round(decisionRatio(recoveryDecisions) * 68 + actionItemBoost + notesBoost));
  return {
    id: "recovery",
    label: "Recovery / Lessons Learned",
    score,
    summary: `${score >= 75 ? "Actionable" : score >= 50 ? "Partially actionable" : "Thin"} closeout based on decisions, notes, and captured action items.`,
  };
}

function scoreIrpCoverage(exercise: GeneratedExercise): SessionScoreCategory {
  if (!exercise.irpAnalysis) {
    return {
      id: "irpCoverage",
      label: "IRP Coverage",
      score: null,
      summary: "Not assessed because no IRP was uploaded or pasted.",
    };
  }

  const findingScore = exercise.irpAnalysis.findings.reduce((total, finding) => {
    if (finding.status === "found") {
      return total + 100;
    }
    if (finding.status === "weak") {
      return total + 60;
    }
    return total + 25;
  }, 0);
  const score = boundedScore(Math.round(findingScore / Math.max(1, exercise.irpAnalysis.findings.length)));

  return {
    id: "irpCoverage",
    label: "IRP Coverage",
    score,
    summary: `${score >= 75 ? "Most core plan areas were visible" : score >= 50 ? "Several plan areas were weak" : "Major plan coverage gaps were likely"} in the uploaded IRP scan.`,
  };
}

function buildUnresolvedUnknowns(steps: FacilitatorStep[], revealedInjects: RevealedInject[], decisionStatuses: Record<string, boolean>) {
  const unresolved = steps.flatMap((step) => {
    const hasOpenDecision = step.decisions.some((decision) => decisionStatuses[decisionKey(step.title, decision)] !== true);
    return hasOpenDecision ? step.unknowns : [];
  });

  return uniqueStrings([...unresolved, ...revealedInjects.map((inject) => inject.unknown)]).slice(0, 10);
}

function buildStrengths(categoryScores: SessionScoreCategory[], decisions: CompletedSessionDecision[], revealedInjects: RevealedInject[], actionItems: string) {
  const strengths = categoryScores
    .filter((category) => (category.score ?? 0) >= 75)
    .map((category) => `${category.label} scored ${category.score}/100.`);

  if (decisions.some((decision) => decision.decided)) {
    strengths.push(`${decisions.filter((decision) => decision.decided).length} decisions were explicitly marked decided.`);
  }

  if (revealedInjects.length > 0) {
    strengths.push(`${revealedInjects.length} scenario injects were handled during the exercise.`);
  }

  if (actionItems.trim()) {
    strengths.push("Action items were captured before closeout.");
  }

  return strengths.length ? strengths.slice(0, 6) : ["The team completed the facilitated session and produced a baseline for improvement."];
}

function buildGaps(categoryScores: SessionScoreCategory[], unresolvedUnknowns: string[], decisions: CompletedSessionDecision[], actionItems: string) {
  const gaps = categoryScores
    .filter((category) => category.score !== null && category.score < 70)
    .map((category) => `${category.label}: ${category.summary}`);

  if (unresolvedUnknowns.length > 0) {
    gaps.push(`${unresolvedUnknowns.length} unresolved unknowns remained at closeout.`);
  }

  if (decisions.some((decision) => !decision.decided)) {
    gaps.push(`${decisions.filter((decision) => !decision.decided).length} decisions were still unresolved.`);
  }

  if (!actionItems.trim()) {
    gaps.push("No action items were captured.");
  }

  return gaps.length ? gaps.slice(0, 8) : ["No major gaps were flagged by the current scoring rules."];
}

function buildReadinessTier(score: number): CompletedSession["readinessTier"] {
  if (score >= 90) {
    return "Exercise Ready";
  }

  if (score >= 75) {
    return "Strong";
  }

  if (score >= 55) {
    return "Functional";
  }

  return "Developing";
}

function buildTopRisks(categoryScores: SessionScoreCategory[], unresolvedUnknowns: string[], decisions: CompletedSessionDecision[]) {
  const risks = categoryScores
    .filter((category) => category.score !== null && category.score < 70)
    .sort((first, second) => (first.score ?? 0) - (second.score ?? 0))
    .map((category) => `${category.label} may slow a real response because ${category.summary.toLowerCase()}`);

  if (unresolvedUnknowns.length > 0) {
    risks.push(`The team ended with unresolved unknowns that could delay response decisions: ${unresolvedUnknowns.slice(0, 2).join("; ")}.`);
  }

  const unresolvedDecisions = decisions.filter((decision) => !decision.decided);
  if (unresolvedDecisions.length > 0) {
    risks.push(`${unresolvedDecisions.length} decisions were not marked decided during the exercise.`);
  }

  return risks.length ? risks.slice(0, 3) : ["No major tabletop risks were flagged by the current scoring rules."];
}

function buildRecommendedActionItems(categoryScores: SessionScoreCategory[], unresolvedUnknowns: string[], actionItems: string) {
  const items = categoryScores
    .filter((category) => category.score !== null && category.score < 75)
    .sort((first, second) => (first.score ?? 0) - (second.score ?? 0))
    .slice(0, 4)
    .map((category) => `Assign an owner to improve ${category.label.toLowerCase()} and document the expected decision path.`);

  if (unresolvedUnknowns.length > 0) {
    items.push("Convert unresolved unknowns into action items with owners, due dates, and validation steps.");
  }

  if (!actionItems.trim()) {
    items.push("Create a tracked after-action list before closing the exercise.");
  }

  return uniqueStrings(items).slice(0, 5);
}

function buildImprovementPlan(categoryScores: SessionScoreCategory[], unresolvedUnknowns: string[]): CompletedSessionImprovementPlanItem[] {
  const weakest = categoryScores
    .filter((category) => category.score !== null)
    .sort((first, second) => (first.score ?? 0) - (second.score ?? 0));

  const first = weakest[0]?.label ?? "Incident response ownership";
  const second = weakest[1]?.label ?? "communications and evidence handling";
  const third = weakest[2]?.label ?? "recovery validation";

  return [
    {
      window: "30 days",
      focus: `Clarify ${first}`,
      outcome: "Update owners, decision thresholds, and the first-response checklist.",
    },
    {
      window: "60 days",
      focus: `Practice ${second}`,
      outcome: "Run a focused mini-drill and confirm the team can explain the process without guessing.",
    },
    {
      window: "90 days",
      focus: unresolvedUnknowns.length > 0 ? "Retest unresolved unknowns" : `Validate ${third}`,
      outcome: "Rerun the scenario or a related tabletop and compare scorecard results.",
    },
  ];
}

function buildRecommendedNextTabletop(exercise: GeneratedExercise, categoryScores: SessionScoreCategory[]) {
  const weakest = categoryScores
    .filter((category) => category.score !== null)
    .sort((first, second) => (first.score ?? 0) - (second.score ?? 0))[0];

  if (!weakest) {
    return `Run a follow-up ${exercise.overview.scenario.toLowerCase()} exercise with an uploaded IRP so plan coverage can be scored.`;
  }

  const recommendations: Record<SessionScoreCategory["id"], string> = {
    escalation: "Run a short escalation drill focused on incident declaration, owner handoff, and leadership notification thresholds.",
    containment: "Run a containment decision drill that forces the team to balance evidence preservation, business disruption, and approval authority.",
    communications: "Run a communications tabletop focused on leadership updates, legal review, customer messaging, and confirmed-versus-assumed facts.",
    evidence: "Run an evidence handling drill focused on log preservation, audit trails, screenshots, chain of custody, and timing before recovery.",
    recovery: "Run a recovery and after-action tabletop focused on action owners, due dates, validation, and retesting improvements.",
    irpCoverage: "Upload the latest IRP and run the same scenario again to validate whether the plan covers the weak areas.",
  };

  return recommendations[weakest.id];
}

function decisionRatio(decisions: CompletedSessionDecision[]) {
  if (decisions.length === 0) {
    return 0;
  }

  return decisions.filter((decision) => decision.decided).length / decisions.length;
}

function boundedScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildCompletedSessionMarkdown(exercise: GeneratedExercise, session: CompletedSession) {
  const lines = [
    buildSessionSummary(
      exercise,
      session.revealedInjects.map((inject) => ({ ...inject, id: inject.text, fact: inject.text, unknown: "", stepTitle: inject.stepTitle })),
      buildFacilitatorSteps(exercise),
      Object.fromEntries(session.decisions.map((decision) => [decisionKey(decision.stepTitle, decision.decision), decision.decided])),
      session.stepNotes,
      Object.fromEntries(session.completedSteps.map((stepTitle) => [stepTitle, true])),
      session.sessionNotes,
      session.actionItems,
    ),
    "",
    "## Exercise Scorecard",
    `- Completed: ${session.completedAt}`,
    `- Overall readiness: ${session.overallScore}/100`,
    `- Readiness tier: ${session.readinessTier}`,
    "",
    "### Category Scores",
    ...session.categoryScores.map((category) => `- ${category.label}: ${category.score === null ? "N/A" : `${category.score}/100`} - ${category.summary}`),
    "",
    "### Strengths",
    ...session.strengths.map((strength) => `- ${strength}`),
    "",
    "### Gaps",
    ...session.gaps.map((gap) => `- ${gap}`),
    "",
    "### Top Risks",
    ...session.topRisks.map((risk) => `- ${risk}`),
    "",
    "### Suggested Action Items",
    ...session.recommendedActionItems.map((item) => `- ${item}`),
    "",
    "### 30 / 60 / 90 Day Improvement Plan",
    ...session.improvementPlan.map((item) => `- ${item.window}: ${item.focus} - ${item.outcome}`),
    "",
    "### Unresolved Unknowns",
    ...session.unresolvedUnknowns.map((unknown) => `- ${unknown}`),
    "",
    "### Recommended Next Tabletop",
    session.recommendedNextTabletop,
    "",
    "### AI Context",
    "```json",
    JSON.stringify(session.aiContext, null, 2),
    "```",
    "",
  ];

  return lines.join("\n");
}
