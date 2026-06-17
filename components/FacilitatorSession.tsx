"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clipboard,
  Dices,
  Download,
  Lightbulb,
  ListTodo,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { getStoredSessionToken } from "@/lib/account";
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

interface AiInjectResponse {
  inject: {
    injectTitle: string;
    injectText: string;
    pressureLevel: "low" | "medium" | "high" | "critical";
    followUpQuestion: string;
    expectedDecision: string;
  };
}

interface AiAssistResponse {
  answer: string;
  irpFinding?: string;
  recommendedNextStep?: string;
  missingInfo?: string[];
}

type FocusStageId = "brief" | "updates" | "facts" | "decision" | "question" | "capture";

const focusStages: Array<{ id: FocusStageId; label: string }> = [
  { id: "brief", label: "Situation" },
  { id: "updates", label: "Updates" },
  { id: "facts", label: "Knowns" },
  { id: "decision", label: "Decision" },
  { id: "question", label: "Discuss" },
  { id: "capture", label: "Capture" },
];

const TABLETOPFORGE_API_URL = (process.env.NEXT_PUBLIC_TABLETOPFORGE_API_URL || "").replace(/\/$/, "");
const AI_ACCESS_CODE_STORAGE_KEY = "tabletopforge.aiAccessCode";

export function FacilitatorSession({ exercise }: { exercise: GeneratedExercise }) {
  const steps = useMemo(() => buildFacilitatorSteps(exercise), [exercise]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeFocusIndex, setActiveFocusIndex] = useState(0);
  const [decisionIndexes, setDecisionIndexes] = useState<Record<string, number>>({});
  const [revealedInjects, setRevealedInjects] = useState<RevealedInject[]>([]);
  const [decisionStatuses, setDecisionStatuses] = useState<Record<string, boolean>>({});
  const [sessionNotes, setSessionNotes] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [completedSession, setCompletedSession] = useState<CompletedSession | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [facilitatorHint, setFacilitatorHint] = useState("");
  const [injectTimerSeconds, setInjectTimerSeconds] = useState(() => buildInjectTimerSeconds(steps[0]?.duration ?? "5 min"));
  const [diceRoll, setDiceRoll] = useState<{ value: number; injectText: string } | null>(null);
  const [isRollingDice, setIsRollingDice] = useState(false);
  const [rollingValue, setRollingValue] = useState(1);
  const [promptIndexes, setPromptIndexes] = useState<Record<string, number>>({});
  const [aiAccessCode, setAiAccessCode] = useState("");
  const [hasSessionToken, setHasSessionToken] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantNotice, setAssistantNotice] = useState("");
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const diceIntervalRef = useRef<number | null>(null);
  const diceTimeoutRef = useRef<number | null>(null);

  const activeStep = steps[activeIndex];
  const progress = Math.round(((activeIndex + 1) / steps.length) * 100);
  const activeRevealedInjects = useMemo(
    () => revealedInjects.filter((inject) => inject.stepTitle === activeStep.title),
    [activeStep.title, revealedInjects],
  );
  const knownFacts = useMemo(
    () => [...activeStep.knownFacts, ...activeRevealedInjects.map((inject) => inject.fact)],
    [activeRevealedInjects, activeStep.knownFacts],
  );
  const unknowns = useMemo(
    () => [...activeStep.unknowns, ...activeRevealedInjects.map((inject) => inject.unknown)],
    [activeRevealedInjects, activeStep.unknowns],
  );
  const availableInjects = useMemo(
    () => activeStep.injects.filter((inject) => !revealedInjects.some((revealed) => revealed.id === inject.id)),
    [activeStep.injects, revealedInjects],
  );
  const activePromptIndex = Math.min(promptIndexes[activeStep.title] ?? 0, Math.max(0, activeStep.prompts.length - 1));
  const activePrompt = activeStep.prompts[activePromptIndex] ?? "";
  const activeFocus = focusStages[activeFocusIndex] ?? focusStages[0];
  const nextFocusLabel = focusStages[activeFocusIndex + 1]?.label ?? "";
  const activeDecisionIndex = Math.min(decisionIndexes[activeStep.title] ?? 0, Math.max(0, activeStep.decisions.length - 1));
  const activeDecision = activeStep.decisions[activeDecisionIndex] ?? "Confirm the next decision the team needs to make.";
  const canUseAiInjects = TABLETOPFORGE_API_URL.length > 0 && (hasSessionToken || aiAccessCode.trim().length > 0);

  const clearDiceTimers = useCallback(() => {
    if (diceIntervalRef.current !== null) {
      window.clearInterval(diceIntervalRef.current);
      diceIntervalRef.current = null;
    }

    if (diceTimeoutRef.current !== null) {
      window.clearTimeout(diceTimeoutRef.current);
      diceTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setInjectTimerSeconds(buildRandomInjectTimerSeconds(activeStep.duration));
    setDiceRoll(null);
    setIsRollingDice(false);
    setRollingValue(1);
    setActiveFocusIndex(0);
    setFacilitatorHint("");
    clearDiceTimers();
  }, [activeStep.duration, activeStep.title, clearDiceTimers]);

  useEffect(() => {
    setAiAccessCode(window.localStorage.getItem(AI_ACCESS_CODE_STORAGE_KEY) ?? "");
    setHasSessionToken(Boolean(getStoredSessionToken()));
  }, []);

  useEffect(() => {
    if (isPaused || isRollingDice || diceRoll || availableInjects.length === 0 || injectTimerSeconds === 0) {
      return;
    }

    const timerId = window.setInterval(() => {
      setInjectTimerSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [availableInjects.length, diceRoll, injectTimerSeconds, isPaused, isRollingDice]);

  const triggerInjectRoll = useCallback(() => {
    const nextInject = availableInjects[0];

    if (!nextInject || isRollingDice || diceRoll) {
      return;
    }

    const finalValue = buildDiceRoll(nextInject);
    let tick = 0;

    clearDiceTimers();
    setDiceRoll(null);
    setIsRollingDice(true);
    setRollingValue(((hashSeed(`${nextInject.id}:start`) % 20) + 1));

    diceIntervalRef.current = window.setInterval(() => {
      tick += 1;
      setRollingValue((hashSeed(`${nextInject.id}:${tick}`) % 20) + 1);
    }, 70);

    diceTimeoutRef.current = window.setTimeout(async () => {
      clearDiceTimers();
      setRollingValue(finalValue);
      const resolvedInject = await resolveInject({
        fallbackInject: nextInject,
        exercise,
        activeStep,
        knownFacts,
        unknowns,
        revealedInjects,
        sessionNotes,
        aiAccessCode,
        useAi: canUseAiInjects,
        onNotice: () => undefined,
      });
      setRevealedInjects((current) =>
        current.some((inject) => inject.id === nextInject.id) ? current : [...current, { ...resolvedInject, stepTitle: activeStep.title }],
      );
      setDiceRoll({ value: finalValue, injectText: resolvedInject.text });
      setInjectTimerSeconds(availableInjects.length > 1 ? buildRandomInjectTimerSeconds(activeStep.duration) : 0);
      setIsRollingDice(false);
    }, 900);
  }, [
    activeStep,
    aiAccessCode,
    availableInjects,
    canUseAiInjects,
    clearDiceTimers,
    diceRoll,
    exercise,
    isRollingDice,
    knownFacts,
    revealedInjects,
    sessionNotes,
    unknowns,
  ]);

  useEffect(() => {
    if (!isPaused && injectTimerSeconds === 0 && availableInjects.length > 0) {
      triggerInjectRoll();
    }
  }, [availableInjects.length, injectTimerSeconds, isPaused, triggerInjectRoll]);

  useEffect(() => clearDiceTimers, [clearDiceTimers]);

  function moveStep(direction: -1 | 1) {
    setActiveIndex((current) => Math.min(steps.length - 1, Math.max(0, current + direction)));
    setActiveFocusIndex(0);
    setFacilitatorHint("");
  }

  function moveFocus(direction: -1 | 1) {
    setActiveFocusIndex((current) => Math.min(focusStages.length - 1, Math.max(0, current + direction)));
    setFacilitatorHint("");
  }

  function resetSession() {
    setActiveIndex(0);
    setActiveFocusIndex(0);
    setRevealedInjects([]);
    setDecisionStatuses({});
    setCompletedSteps({});
    setPromptIndexes({});
    setDecisionIndexes({});
    setFacilitatorHint("");
    setDiceRoll(null);
    setIsRollingDice(false);
    setRollingValue(1);
    clearDiceTimers();
    setSessionNotes("");
    setActionItems("");
    setExportNotice("");
    setCompletedSession(null);
    setIsPaused(false);
    setInjectTimerSeconds(buildRandomInjectTimerSeconds(steps[0]?.duration ?? "5 min"));
  }

  function toggleDecision(decision: string, checked: boolean) {
    setDecisionStatuses((current) => ({ ...current, [decisionKey(activeStep.title, decision)]: checked }));
  }

  function toggleStepComplete(checked: boolean) {
    setCompletedSteps((current) => ({ ...current, [activeStep.title]: checked }));
  }

  function movePrompt(direction: -1 | 1) {
    setPromptIndexes((current) => ({
      ...current,
      [activeStep.title]: Math.min(activeStep.prompts.length - 1, Math.max(0, activePromptIndex + direction)),
    }));
  }

  function moveDecision(direction: -1 | 1) {
    setDecisionIndexes((current) => ({
      ...current,
      [activeStep.title]: Math.min(activeStep.decisions.length - 1, Math.max(0, activeDecisionIndex + direction)),
    }));
    setFacilitatorHint("");
  }

  async function askAssistant(questionOverride?: string) {
    const question = (questionOverride ?? assistantQuestion).trim();
    if (!question || isAssistantThinking) {
      return;
    }

    setAssistantQuestion(question);
    setAssistantNotice("");
    setIsAssistantOpen(true);
    setIsAssistantThinking(true);

    try {
      const answer = await requestAiAssistance({
        question,
        exercise,
        activeStep,
        knownFacts,
        unknowns,
        activeDecision,
        activePrompt,
        revealedInjects,
        sessionNotes,
        actionItems,
        aiAccessCode,
        canUseAi: TABLETOPFORGE_API_URL.length > 0 && (hasSessionToken || aiAccessCode.trim().length > 0),
      });
      setAssistantAnswer(formatAssistantResponse(answer));
      setAssistantNotice("Answered with TabletopForge AI.");
    } catch {
      setAssistantAnswer(
        buildLocalAssistanceAnswer({
          question,
          exercise,
          activeStep,
          knownFacts,
          unknowns,
          activeDecision,
          activePrompt,
          revealedInjects,
          sessionNotes,
          actionItems,
        }),
      );
      setAssistantNotice("Answered with built-in guidance. AI will take over here once enabled.");
    } finally {
      setIsAssistantThinking(false);
    }
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
      <InjectOverlay
        diceRoll={diceRoll}
        isRolling={isRollingDice}
        rollingValue={rollingValue}
        onDismiss={() => setDiceRoll(null)}
      />

      <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-4">
          <Card className="bg-background/45">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg">Session Flow</CardTitle>
                <Badge variant="outline">App-led</Badge>
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

          <SessionNotesPanel sessionNotes={sessionNotes} onChange={setSessionNotes} />
        </div>

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

            <FocusStepper activeIndex={activeFocusIndex} injectCount={revealedInjects.length} onSelect={setActiveFocusIndex} />

            <AssistantPanel
              question={assistantQuestion}
              answer={assistantAnswer}
              notice={assistantNotice}
              isThinking={isAssistantThinking}
              isOpen={isAssistantOpen}
              onQuestionChange={setAssistantQuestion}
              onAsk={() => askAssistant()}
              onQuickAsk={askAssistant}
              onToggle={() => setIsAssistantOpen((current) => !current)}
            />

            {activeFocus.id === "brief" ? (
              <section className="space-y-4 rounded-md border border-primary/30 bg-primary/10 p-5">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                    <Sparkles className="size-4" suppressHydrationWarning />
                    TabletopForge Facilitator
                  </div>
                  <ReadingText text={activeStep.facilitatorScript} className="leading-7 text-muted-foreground" speed={32} />
                </div>
                {activeStep.scenarioBrief ? (
                  <div className="rounded-md border border-border/70 bg-background/45 p-4">
                    <div className="mb-2 text-sm font-medium text-foreground">Current Situation</div>
                    <ReadingText text={activeStep.scenarioBrief} className="leading-7 text-muted-foreground" speed={18} />
                  </div>
                ) : (
                  <div className="rounded-md border border-border/70 bg-background/45 p-4">
                    <ReadingText text={knownFacts[0] ?? activeStep.pressureNote} className="leading-7 text-muted-foreground" speed={28} />
                  </div>
                )}
                <div className="rounded-md border border-border/70 bg-background/45 p-4">
                  <div className="text-sm font-medium text-foreground">Suggested Time</div>
                  <ReadingText text={activeStep.pressureNote} className="mt-1 text-sm leading-6 text-muted-foreground" speed={30} />
                </div>
              </section>
            ) : null}

            {activeFocus.id === "updates" ? (
              <ScenarioUpdates
                activeStepTitle={activeStep.title}
                activeRevealedInjects={activeRevealedInjects}
                revealedInjects={revealedInjects}
              />
            ) : null}

            {activeFocus.id === "facts" ? <TriageFacts knownFacts={knownFacts} unknowns={unknowns} /> : null}

            {activeFocus.id === "decision" ? (
              <section className="rounded-md border border-border bg-background/45 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Make One Decision</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Decision {Math.min(activeDecisionIndex + 1, activeStep.decisions.length)} of {activeStep.decisions.length}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => moveDecision(-1)} disabled={activeDecisionIndex === 0}>
                      <ChevronLeft className="size-4" suppressHydrationWarning />
                      Previous Decision
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => moveDecision(1)} disabled={activeDecisionIndex >= activeStep.decisions.length - 1}>
                      Next Decision
                      <ChevronRight className="size-4" suppressHydrationWarning />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex gap-3 rounded-md border border-primary/25 bg-primary/10 p-4">
                  <Checkbox
                    checked={decisionStatuses[decisionKey(activeStep.title, activeDecision)] === true}
                    onCheckedChange={(value) => toggleDecision(activeDecision, value === true)}
                    className="mt-1"
                  />
                  <div className="space-y-2">
                    <ReadingText text={activeDecision} className="text-base leading-7 text-foreground" speed={34} />
                    <Badge variant={decisionStatuses[decisionKey(activeStep.title, activeDecision)] ? "secondary" : "outline"}>
                      {decisionStatuses[decisionKey(activeStep.title, activeDecision)] ? "Decided" : "Unresolved"}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => askAssistant(`Help us decide: ${activeDecision}`)}>
                    <Bot className="size-4" suppressHydrationWarning />
                    Ask For Help
                  </Button>
                  <Button variant="outline" onClick={() => setFacilitatorHint(buildStuckHint(activeStep))}>
                    <Lightbulb className="size-4" suppressHydrationWarning />
                    The team is stuck
                  </Button>
                </div>
                {facilitatorHint ? (
                  <ReadingText text={facilitatorHint} className="mt-4 rounded-md bg-muted p-3 text-sm leading-6 text-muted-foreground" speed={26} />
                ) : null}
              </section>
            ) : null}

            {activeFocus.id === "question" ? (
              <PromptCard
                prompt={activePrompt}
                currentIndex={activePromptIndex}
                total={activeStep.prompts.length}
                onBack={() => movePrompt(-1)}
                onNext={() => movePrompt(1)}
              />
            ) : null}

            {activeFocus.id === "capture" ? (
              <section className="space-y-4 rounded-md border border-border bg-background/45 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Checkbox checked={completedSteps[activeStep.title] === true} onCheckedChange={(value) => toggleStepComplete(value === true)} className="mt-1" />
                    <div>
                      <p className="text-sm font-medium">Mark this section complete</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">Capture only what matters: decisions, unanswered questions, and follow-up work.</p>
                    </div>
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
                {exportNotice ? <p className="text-sm text-primary">{exportNotice}</p> : null}
                <div className="rounded-md border border-border bg-background/45 p-4">
                  <p className="text-sm font-medium">Notes stay open in the left panel.</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Use the notes area throughout the exercise for improvements, decisions, unclear answers, and follow-up ideas.
                  </p>
                </div>
              </section>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={() => (activeFocusIndex === 0 ? moveStep(-1) : moveFocus(-1))}
                disabled={activeIndex === 0 && activeFocusIndex === 0}
              >
                <ChevronLeft className="size-4" suppressHydrationWarning />
                Back
              </Button>
              {activeFocusIndex < focusStages.length - 1 ? (
                <Button onClick={() => moveFocus(1)}>
                  Go To {nextFocusLabel}
                  <ChevronRight className="size-4" suppressHydrationWarning />
                </Button>
              ) : activeIndex === steps.length - 1 ? (
                <Button onClick={endExercise}>
                  <Award className="size-4" suppressHydrationWarning />
                  End Exercise
                </Button>
              ) : (
                <Button onClick={() => moveStep(1)}>
                  Next Section
                  <ChevronRight className="size-4" suppressHydrationWarning />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {completedSession ? <Scorecard session={completedSession} /> : null}
    </div>
  );
}

function FocusStepper({
  activeIndex,
  injectCount,
  onSelect,
}: {
  activeIndex: number;
  injectCount: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="rounded-md border border-border bg-background/35 p-3">
      <div className="flex flex-wrap gap-2">
        {focusStages.map((stage, index) => (
          <button
            key={stage.id}
            className={`rounded-md border px-3 py-2 text-sm transition ${
              index === activeIndex
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-background/40 text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => onSelect(index)}
          >
            <span className="mr-2 text-xs">{index + 1}</span>
            {stage.label}
            {stage.id === "updates" && injectCount > 0 ? (
              <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
                {injectCount}
              </Badge>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function SessionNotesPanel({ sessionNotes, onChange }: { sessionNotes: string; onChange: (value: string) => void }) {
  return (
    <Card className="bg-background/45">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clipboard className="size-5 text-primary" suppressHydrationWarning />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          value={sessionNotes}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Capture improvements, decisions, unclear answers, and follow-up ideas."
          className="min-h-[220px]"
        />
      </CardContent>
    </Card>
  );
}

function ScenarioUpdates({
  activeStepTitle,
  activeRevealedInjects,
  revealedInjects,
}: {
  activeStepTitle: string;
  activeRevealedInjects: RevealedInject[];
  revealedInjects: RevealedInject[];
}) {
  const earlierInjects = revealedInjects.filter((inject) => inject.stepTitle !== activeStepTitle);

  return (
    <section className="space-y-4 rounded-md border border-accent/35 bg-accent/10 p-5">
      <div>
        <h3 className="font-semibold">Scenario Updates</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Re-read the situation changes here when the discussion questions need more context.
        </p>
      </div>

      {revealedInjects.length === 0 ? (
        <div className="rounded-md border border-border/70 bg-background/45 p-4">
          <p className="text-sm leading-6 text-muted-foreground">
            No scenario updates have dropped yet. Continue the discussion and TabletopForge will introduce new developments when the timing feels right.
          </p>
        </div>
      ) : null}

      {activeRevealedInjects.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Current Section</h4>
          {activeRevealedInjects.map((inject, index) => (
            <ScenarioUpdateCard key={inject.id} inject={inject} index={index} />
          ))}
        </div>
      ) : null}

      {earlierInjects.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Earlier Updates</h4>
          {earlierInjects.map((inject, index) => (
            <ScenarioUpdateCard key={inject.id} inject={inject} index={index} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ScenarioUpdateCard({ inject, index }: { inject: RevealedInject; index: number }) {
  return (
    <div
      className="session-list-item rounded-md border border-border/70 bg-background/50 p-4"
      style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{inject.stepTitle}</Badge>
        <Badge variant="outline">Update</Badge>
      </div>
      <ReadingText text={inject.text} className="text-sm leading-6 text-foreground" speed={20} />
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{inject.unknown}</p>
    </div>
  );
}

function AssistantPanel({
  question,
  answer,
  notice,
  isThinking,
  isOpen,
  onQuestionChange,
  onAsk,
  onQuickAsk,
  onToggle,
}: {
  question: string;
  answer: string;
  notice: string;
  isThinking: boolean;
  isOpen: boolean;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
  onQuickAsk: (question: string) => void;
  onToggle: () => void;
}) {
  const quickQuestions = [
    "Who should we contact first?",
    "What does the IRP support?",
    "What should we decide now?",
    "Explain this for non-technical leaders.",
  ];

  return (
    <section className="rounded-md border border-primary/25 bg-background/55 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Bot className="size-4 text-primary" suppressHydrationWarning />
            Ask TabletopForge
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Available any time for IRP and decision help.</p>
        </div>
        <Button variant="outline" onClick={onToggle}>
          <MessageSquare className="size-4" suppressHydrationWarning />
          {isOpen ? "Hide Help" : "Ask For Help"}
        </Button>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((item) => (
              <Button key={item} type="button" variant="outline" size="sm" onClick={() => onQuickAsk(item)} disabled={isThinking}>
                <MessageSquare className="size-3.5" suppressHydrationWarning />
                {item}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Textarea
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              placeholder="Ask what to do next, who owns a decision, or where the IRP supports the answer."
              className="min-h-[84px]"
            />
            <Button className="md:self-end" onClick={onAsk} disabled={isThinking || question.trim().length === 0}>
              <Send className="size-4" suppressHydrationWarning />
              {isThinking ? "Thinking..." : "Ask"}
            </Button>
          </div>
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          {answer ? (
            <div className="rounded-md border border-primary/20 bg-primary/10 p-4">
              <ReadingText text={answer} className="text-sm leading-6 text-foreground" speed={18} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TriageFacts({ knownFacts, unknowns }: { knownFacts: string[]; unknowns: string[] }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <BoardList title="Facts Known" items={knownFacts} />
      <BoardList title="Unknowns To Resolve" items={unknowns} />
    </section>
  );
}

function PromptCard({
  prompt,
  currentIndex,
  total,
  onBack,
  onNext,
}: {
  prompt: string;
  currentIndex: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <section className="rounded-md border border-border bg-background/45 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Discuss This Now</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Question {Math.min(currentIndex + 1, total)} of {total}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack} disabled={currentIndex === 0}>
            <ChevronLeft className="size-4" suppressHydrationWarning />
            Previous Question
          </Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={currentIndex >= total - 1}>
            Next Question
            <ChevronRight className="size-4" suppressHydrationWarning />
          </Button>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-primary/25 bg-primary/10 p-4">
        <ReadingText text={prompt} className="text-base leading-7 text-foreground" speed={34} />
      </div>
    </section>
  );
}

function ReadingText({ text, className = "", speed = 34 }: { text: string; className?: string; speed?: number }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setVisibleCount(words.length);
      return;
    }

    setVisibleCount(0);

    if (words.length === 0) {
      return;
    }

    const batchSize = words.length > 90 ? 3 : words.length > 45 ? 2 : 1;
    let nextCount = 0;
    const timerId = window.setInterval(() => {
      nextCount = Math.min(words.length, nextCount + batchSize);
      setVisibleCount(nextCount);

      if (nextCount >= words.length) {
        window.clearInterval(timerId);
      }
    }, speed);

    return () => window.clearInterval(timerId);
  }, [prefersReducedMotion, speed, text, words.length]);

  return (
    <p className={className} aria-label={text}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          aria-hidden="true"
          className={index < visibleCount ? "reading-word-visible" : "reading-word-hidden"}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function InjectOverlay({
  diceRoll,
  isRolling,
  rollingValue,
  onDismiss,
}: {
  diceRoll: { value: number; injectText: string } | null;
  isRolling: boolean;
  rollingValue: number;
  onDismiss: () => void;
}) {
  if (!isRolling && !diceRoll) {
    return null;
  }

  const displayedValue = isRolling ? rollingValue : diceRoll?.value;

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-background/95 px-4 py-8 backdrop-blur-md">
      <div className="w-full max-w-3xl text-center">
        <Badge variant="secondary" className="mb-4 border-accent/50 bg-accent/20 text-accent">
          Scenario Evolved
        </Badge>
        <h2 className="text-3xl font-semibold text-foreground sm:text-5xl">Oh no. The situation changed.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          The group has to react to the new information before moving on.
        </p>

        <div className="my-8 flex justify-center">
          <div className={`dice-roll-face flex size-48 flex-col items-center justify-center rounded-2xl border border-accent/60 bg-accent/15 shadow-2xl shadow-accent/20 sm:size-64 ${isRolling ? "" : "dice-roll-landed"}`}>
            <Dices className="mb-3 size-14 text-accent sm:size-20" suppressHydrationWarning />
            <p className="text-xs font-semibold uppercase text-muted-foreground">d20 roll</p>
            <p className="text-7xl font-semibold text-accent sm:text-8xl">{displayedValue}</p>
          </div>
        </div>

        {isRolling ? (
          <p className="text-lg font-medium text-foreground">Rolling the next development...</p>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="rounded-md border border-primary/35 bg-primary/10 p-5 text-left">
              <p className="text-sm font-semibold text-primary">New information</p>
              <ReadingText text={diceRoll?.injectText ?? ""} className="mt-2 text-lg leading-8 text-foreground" speed={28} />
            </div>
            <Button size="lg" onClick={onDismiss}>
              Return To Discussion
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

async function resolveInject({
  fallbackInject,
  exercise,
  activeStep,
  knownFacts,
  unknowns,
  revealedInjects,
  sessionNotes,
  aiAccessCode,
  useAi,
  onNotice,
}: {
  fallbackInject: Inject;
  exercise: GeneratedExercise;
  activeStep: FacilitatorStep;
  knownFacts: string[];
  unknowns: string[];
  revealedInjects: RevealedInject[];
  sessionNotes: string;
  aiAccessCode: string;
  useAi: boolean;
  onNotice: (notice: string) => void;
}): Promise<Inject> {
  if (!useAi) {
    return fallbackInject;
  }

  try {
    const aiInject = await requestAiInject({
      exercise,
      activeStep,
      knownFacts,
      unknowns,
      revealedInjects,
      sessionNotes,
      aiAccessCode,
    });

    onNotice("AI generated this twist.");
    return {
      id: fallbackInject.id,
      text: aiInject.injectText,
      fact: aiInject.injectText,
      unknown: aiInject.followUpQuestion,
    };
  } catch {
    onNotice("AI is unavailable right now, so TabletopForge used a built-in twist.");
    return fallbackInject;
  }
}

async function requestAiInject({
  exercise,
  activeStep,
  knownFacts,
  unknowns,
  revealedInjects,
  sessionNotes,
  aiAccessCode,
}: {
  exercise: GeneratedExercise;
  activeStep: FacilitatorStep;
  knownFacts: string[];
  unknowns: string[];
  revealedInjects: RevealedInject[];
  sessionNotes: string;
  aiAccessCode: string;
}): Promise<AiInjectResponse["inject"]> {
  const sessionToken = getStoredSessionToken();
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  if (aiAccessCode.trim()) {
    headers.set("x-tabletopforge-ai-access-code", aiAccessCode.trim());
  }

  const response = await fetch(`${TABLETOPFORGE_API_URL}/api/ai/generate-inject`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      exercise: {
        organization: exercise.overview.organization,
        industry: exercise.overview.industry,
        organizationSize: exercise.overview.organizationSize,
        scenario: exercise.overview.scenario,
        maturityLevel: exercise.overview.maturityLevel,
        duration: exercise.overview.duration,
        summary: exercise.scenarioSummary,
        objectives: exercise.objectives,
      },
      irpAnalysis: exercise.irpAnalysis
        ? {
            overallSummary: exercise.irpAnalysis.overallSummary,
            strengths: exercise.irpAnalysis.strengths,
            findings: exercise.irpAnalysis.findings,
          }
        : null,
      currentStep: {
        title: activeStep.title,
        knownFacts,
        unknowns,
        decisions: activeStep.decisions,
      },
      previousInjects: revealedInjects.map((inject) => inject.text),
      sessionNotes,
    }),
  });

  if (!response.ok) {
    throw new Error("AI backend request failed.");
  }

  const data = (await response.json()) as AiInjectResponse;

  if (
    !data.inject ||
    typeof data.inject.injectText !== "string" ||
    typeof data.inject.followUpQuestion !== "string"
  ) {
    throw new Error("AI backend returned an invalid inject.");
  }

  return data.inject;
}

async function requestAiAssistance({
  question,
  exercise,
  activeStep,
  knownFacts,
  unknowns,
  activeDecision,
  activePrompt,
  revealedInjects,
  sessionNotes,
  actionItems,
  aiAccessCode,
  canUseAi,
}: {
  question: string;
  exercise: GeneratedExercise;
  activeStep: FacilitatorStep;
  knownFacts: string[];
  unknowns: string[];
  activeDecision: string;
  activePrompt: string;
  revealedInjects: RevealedInject[];
  sessionNotes: string;
  actionItems: string;
  aiAccessCode: string;
  canUseAi: boolean;
}): Promise<AiAssistResponse> {
  if (!canUseAi) {
    throw new Error("AI assistance is not configured.");
  }

  const sessionToken = getStoredSessionToken();
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  if (aiAccessCode.trim()) {
    headers.set("x-tabletopforge-ai-access-code", aiAccessCode.trim());
  }

  const response = await fetch(`${TABLETOPFORGE_API_URL}/api/ai/assist`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      question,
      exercise: buildAiExerciseContext(exercise),
      currentStep: {
        title: activeStep.title,
        knownFacts,
        unknowns,
        decisions: activeStep.decisions,
        activeDecision,
        activePrompt,
      },
      previousInjects: revealedInjects.map((inject) => inject.text),
      sessionNotes,
      actionItems,
      irpAnalysis: exercise.irpAnalysis
        ? {
            overallSummary: exercise.irpAnalysis.overallSummary,
            strengths: exercise.irpAnalysis.strengths,
            findings: exercise.irpAnalysis.findings,
          }
        : null,
    }),
  });

  if (!response.ok) {
    throw new Error("AI assistance request failed.");
  }

  const data = (await response.json()) as AiAssistResponse;
  if (!data || typeof data.answer !== "string") {
    throw new Error("AI assistance returned an invalid response.");
  }

  return data;
}

function buildAiExerciseContext(exercise: GeneratedExercise) {
  return {
    organization: exercise.overview.organization,
    industry: exercise.overview.industry,
    organizationSize: exercise.overview.organizationSize,
    scenario: exercise.overview.scenario,
    maturityLevel: exercise.overview.maturityLevel,
    duration: exercise.overview.duration,
    summary: exercise.scenarioSummary,
    objectives: exercise.objectives,
  };
}

function formatAssistantResponse(response: AiAssistResponse) {
  return [
    response.answer,
    response.irpFinding ? `IRP check: ${response.irpFinding}` : "",
    response.recommendedNextStep ? `Next step: ${response.recommendedNextStep}` : "",
    response.missingInfo?.length ? `Missing info: ${response.missingInfo.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildLocalAssistanceAnswer({
  question,
  exercise,
  activeStep,
  knownFacts,
  unknowns,
  activeDecision,
  activePrompt,
  revealedInjects,
  sessionNotes,
  actionItems,
}: {
  question: string;
  exercise: GeneratedExercise;
  activeStep: FacilitatorStep;
  knownFacts: string[];
  unknowns: string[];
  activeDecision: string;
  activePrompt: string;
  revealedInjects: RevealedInject[];
  sessionNotes: string;
  actionItems: string;
}) {
  const lowerQuestion = question.toLowerCase();
  const contextText = [
    question,
    activeStep.title,
    activeDecision,
    activePrompt,
    ...knownFacts,
    ...unknowns,
    ...revealedInjects.map((inject) => inject.text),
    sessionNotes,
    actionItems,
  ]
    .join(" ")
    .toLowerCase();
  const irpFindings = exercise.irpAnalysis?.findings ?? [];
  const irpStrengths = exercise.irpAnalysis?.strengths ?? [];
  const vendorTerms = /vendor|outside|third[- ]party|provider|msp|insurance|breach coach|legal|counsel|call tree|contact|escalat|support/i;
  const relevantFindings = irpFindings.filter((finding) =>
    vendorTerms.test(`${finding.label} ${finding.summary} ${finding.improvement} ${finding.evidence.join(" ")}`),
  );
  const relevantStrength = irpStrengths.find((strength) => vendorTerms.test(strength));
  const relevantGap = relevantFindings.find((finding) => finding.status !== "found");
  const relevantFound = relevantFindings.find((finding) => finding.status === "found");
  const asksVendorQuestion = vendorTerms.test(lowerQuestion) || vendorTerms.test(contextText);

  if (asksVendorQuestion) {
    if (relevantFound || relevantStrength) {
      return `Start with the contact path the IRP already identifies. I found IRP support related to ${relevantFound?.label ?? "vendor or escalation contacts"}. Have the team name the system owner, the outside provider tied to that system, and the person authorized to call them. If the contact list is not in front of the group, capture that as an action item before moving on.`;
    }

    if (relevantGap) {
      return `The IRP appears weak or incomplete for ${relevantGap.label.toLowerCase()}. For this tabletop, decide who owns the affected system first, then contact the outside provider that supports that system. If this may involve legal notification, cyber insurance, or breach response, escalate to leadership or legal before external messaging. Capture this IRP gap: ${relevantGap.improvement}`;
    }

    if (!exercise.irpAnalysis) {
      return "No IRP was uploaded, so I cannot verify a call tree. For the exercise, start with the internal incident owner, then the outside vendor tied to the affected system, then legal or cyber insurance if severity, data exposure, or notification duties are possible. Add an action item to create a vendor call tree with owner, backup contact, phone, email, contract number, and after-hours path.";
    }

    return "I do not see a clear vendor call tree in the available IRP findings. Treat that as a gap. For now, choose the vendor based on the affected system, confirm who has authority to contact them, and document what information the team is allowed to share.";
  }

  if (lowerQuestion.includes("irp") || lowerQuestion.includes("plan")) {
    const firstGap = irpFindings.find((finding) => finding.status !== "found");
    if (!exercise.irpAnalysis) {
      return "No IRP is attached to this exercise, so TabletopForge can only guide from the scenario. Ask the group where the plan should define this answer, then mark the missing IRP reference as an improvement item.";
    }

    if (firstGap) {
      return `The IRP scan found a likely gap: ${firstGap.label}. ${firstGap.summary} Use the current discussion to decide whether that gap slows response, then capture this improvement: ${firstGap.improvement}`;
    }

    return `The IRP scan did not flag a major gap for this question. Use the plan as the source of truth, but still ask the team to name the owner, approval path, and evidence they would preserve.`;
  }

  if (lowerQuestion.includes("non-technical") || lowerQuestion.includes("plain") || exercise.overview.maturityLevel === "Basic") {
    return `Plain-language version: ${exercise.overview.organization} is practicing who should be called, what facts matter first, and who can make decisions during a ${exercise.overview.scenario.toLowerCase()} event. For this step, ask one question: "${activeDecision}" Keep the answer focused on people, ownership, and business impact.`;
  }

  return `Focus the group on the next concrete decision: "${activeDecision}" The most important unknown is "${unknowns[0] ?? "what information is still missing"}." If nobody can answer, assign an owner to find it, write down the gap, and continue the exercise.`;
}

function BoardList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border bg-background/45 p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}-${item}`}
            className="session-list-item text-sm leading-6 text-muted-foreground"
            style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildStuckHint(step: FacilitatorStep) {
  const firstDecision = step.decisions[0] ?? "the next decision";
  const firstUnknown = step.unknowns[0] ?? "the most important unknown";

  return `Pause and discuss: "What do we know, what do we still need, and who is allowed to decide ${firstDecision.toLowerCase()}?" If the team still stalls, capture "${firstUnknown}" as an unresolved unknown and move to the next decision.`;
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
      facilitatorScript: `Welcome to the ${exercise.overview.organization} tabletop exercise. This is a no-fault discussion. Your goal is to talk through decisions, ownership, communications, and IRP gaps. Assign one person to capture notes before moving on.`,
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
      facilitatorScript: `Read the scenario below as if it just happened. Discuss the first 15 minutes of response. Do not jump straight to technical fixes. Name who receives the report, who owns each action, and where the IRP supports that answer.`,
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
      facilitatorScript: "The situation is getting more serious. Before you reveal another development, decide what the team can do immediately, what requires approval, and what business risk each containment choice creates.",
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
      facilitatorScript: "Now focus on communications and impact. Avoid vague answers like 'we would notify people.' Name the audience, message owner, approval path, and what facts are confirmed before any update is sent.",
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
      facilitatorScript: "Close the exercise by turning every unclear answer into an improvement item. Do not leave this section until each major gap has an owner, due date, and priority.",
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
        "TabletopForge asks each participant to name one thing they would change in the IRP.",
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
      kickoffPrompts: ["In plain language, what should everyone know before the scenario begins?"],
      initialPrompts: [
        "What would a non-technical employee notice, and who should they tell first?",
        "What is the simplest first step the team can agree on?",
      ],
      containmentPrompts: [
        "What simple action can reduce risk while the team waits for more details?",
        "Who can explain the business impact if a system, account, or service has to be paused?",
      ],
      communicationsPrompts: [
        "Who needs a plain-language update first?",
        "How would you explain this to leadership without technical terms?",
      ],
      recoveryPrompts: [
        "What one practical improvement would make this easier next time?",
        "What should be written down so a new employee could follow it?",
      ],
      kickoffDecisions: [],
      initialDecisions: ["Who is the first person or team to call?"],
      containmentDecisions: ["What basic step is safe to take now?"],
      communicationsDecisions: ["What plain-language message should staff receive?"],
      recoveryDecisions: ["What practical fix should be done first?"],
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
  const contextual = buildContextualInjects(exercise, stage);
  const pool = [...contextual, ...scenarioSpecific, ...commonInjects];
  return seededShuffle(pool, `${exercise.id}:${stage}:${exercise.overview.scenario}`)
    .slice(0, count)
    .map((text, index) => ({
      id: `${stage}:${index}:${hashSeed(`${exercise.id}:${text}`)}`,
      text,
      fact: text,
      unknown: stageUnknowns[stage],
    }));
}

function buildContextualInjects(exercise: GeneratedExercise, stage: InjectStage) {
  return [
    ...buildIndustryInjects(exercise, stage),
    ...buildSizeInjects(exercise, stage),
    ...buildMaturityInjects(exercise, stage),
    ...buildIrpGapInjects(exercise, stage),
  ];
}

function buildIndustryInjects(exercise: GeneratedExercise, stage: InjectStage) {
  const industry = exercise.overview.industry;
  const industryInjects: Partial<Record<GeneratedExercise["overview"]["industry"], Partial<Record<InjectStage, string[]>>>> = {
    Healthcare: {
      containment: ["Clinical operations says the proposed containment step may delay patient care unless a downtime workflow starts first."],
      communications: ["The privacy officer asks whether the facts support a patient privacy review or only an operational status update."],
    },
    Education: {
      communications: ["A campus leader asks what staff can tell families if classroom systems or student services are affected."],
      recovery: ["The team realizes the recovery plan does not say how teachers or staff will be updated before the next school day."],
    },
    "Financial Services": {
      initial: ["Fraud operations asks whether transaction monitoring or customer verification should be tightened immediately."],
      communications: ["A customer operations lead wants guidance before frontline staff answer account holder questions."],
    },
    Manufacturing: {
      containment: ["Operations warns that isolating the affected system could stop a production line or delay shipping commitments."],
      recovery: ["The plant manager asks which system must recover first to avoid safety, production, or shipping impact."],
    },
    "Local Government": {
      communications: ["An elected official asks for a resident-facing update before the team has confirmed the full scope."],
      recovery: ["A public service owner asks whether continuity procedures need to stay active into the next business day."],
    },
    Nonprofit: {
      communications: ["A board member asks whether donors, volunteers, or grant contacts need to hear anything today."],
      recovery: ["Program staff say the incident may affect a grant deadline or community service event this week."],
    },
    "Small Business": {
      initial: ["The owner is unavailable, and the team has to decide who can call the outside IT provider first."],
      containment: ["Outside IT asks for approval before making a change that may interrupt customer-facing work."],
    },
    "MSP / IT Provider": {
      initial: ["The service desk receives client tickets that may or may not be related to the same incident."],
      containment: ["Restricting a shared management tool could protect clients but slow urgent support work."],
    },
    Other: {
      initial: ["A business process owner asks whether their team should continue normal work while scope is unclear."],
    },
  };

  return industryInjects[industry]?.[stage] ?? [];
}

function buildSizeInjects(exercise: GeneratedExercise, stage: InjectStage) {
  const size = exercise.overview.organizationSize;
  const sizeInjects: Partial<Record<GeneratedExercise["overview"]["organizationSize"], Partial<Record<InjectStage, string[]>>>> = {
    "1-25": {
      initial: ["The person who usually handles IT issues is unavailable for the next hour."],
      containment: ["The team has to choose between waiting for outside support or taking a simple containment step now."],
    },
    "26-100": {
      initial: ["Two managers assume the other one owns the next update, creating a handoff gap."],
      communications: ["Staff in another department hear about the incident informally and ask who is coordinating updates."],
    },
    "101-500": {
      containment: ["Two departments disagree about whether the affected service can be paused."],
      communications: ["Separate teams are preparing separate updates, and the group needs one approved message."],
    },
    "501-1000": {
      initial: ["Leadership asks whether a formal incident coordination group should activate."],
      communications: ["Legal, communications, and operations each need different facts before approving an update."],
    },
    "1000+": {
      containment: ["A regional team asks whether they have authority to act before enterprise incident command is fully assembled."],
      communications: ["A business unit outside the initial scope reports possible impact and asks for regional guidance."],
    },
  };

  return sizeInjects[size]?.[stage] ?? [];
}

function buildMaturityInjects(exercise: GeneratedExercise, stage: InjectStage) {
  if (exercise.overview.maturityLevel === "Basic") {
    const basicInjects: Partial<Record<InjectStage, string[]>> = {
      initial: ["A non-technical employee asks for a simple explanation of what they should report and who they should tell."],
      containment: ["Someone asks what action is safe to take now without understanding the technical details."],
      communications: ["A leader asks for a plain-language update with no acronyms."],
    };
    return basicInjects[stage] ?? [];
  }

  if (exercise.overview.maturityLevel === "Advanced") {
    const advancedInjects: Partial<Record<InjectStage, string[]>> = {
      initial: ["A new fact challenges the initial severity rating and forces the team to justify the threshold they chose."],
      containment: ["The highest-risk containment option may destroy or overwrite evidence unless the team sequences actions carefully."],
      communications: ["Legal asks for a fact pattern, decision rationale, and approval trail before any external message is sent."],
      recovery: ["Leadership asks how the team will prove the IRP gap was fixed instead of only assigning an owner."],
    };
    return advancedInjects[stage] ?? [];
  }

  const intermediateInjects: Partial<Record<InjectStage, string[]>> = {
    initial: ["The team gets one more signal that increases concern but still leaves scope uncertain."],
    containment: ["A business owner asks for the risk tradeoff before approving disruption."],
    communications: ["Leadership wants a concise update that separates confirmed facts from assumptions."],
  };

  return intermediateInjects[stage] ?? [];
}

function buildIrpGapInjects(exercise: GeneratedExercise, stage: InjectStage) {
  const gaps = exercise.irpAnalysis?.findings.filter((finding) => finding.status !== "found") ?? [];
  const stageGapIds: Record<InjectStage, string[]> = {
    kickoff: ["roles", "severity"],
    initial: ["severity", "roles", "third-party"],
    containment: ["containment", "evidence", "recovery"],
    communications: ["communications", "legal-compliance", "third-party"],
    recovery: ["lessons-learned", "recovery"],
  };
  const stageGaps = gaps.filter((finding) => stageGapIds[stage].includes(finding.id)).slice(0, exercise.overview.maturityLevel === "Advanced" ? 3 : 1);

  return stageGaps.map((finding) => {
    if (exercise.overview.maturityLevel === "Basic") {
      return `The team looks for a simple answer in the IRP, but the plan is unclear about ${finding.label.toLowerCase()}.`;
    }

    if (exercise.overview.maturityLevel === "Advanced") {
      return `The situation now directly tests the IRP gap for ${finding.label.toLowerCase()}: ${finding.summary}`;
    }

    return `The IRP appears weak on ${finding.label.toLowerCase()}, so the team needs to decide how to proceed without a perfect plan.`;
  });
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

function buildInjectTimerSeconds(duration: string) {
  const minutes = Number.parseInt(duration, 10);
  const baseSeconds = Number.isFinite(minutes) ? Math.round((minutes * 60) / 3) : 90;
  return Math.max(45, Math.min(300, baseSeconds));
}

function buildRandomInjectTimerSeconds(duration: string) {
  const baseSeconds = buildInjectTimerSeconds(duration);
  const minSeconds = Math.max(30, Math.round(baseSeconds * 0.65));
  const maxSeconds = Math.max(minSeconds + 15, Math.round(baseSeconds * 1.35));
  return Math.min(360, minSeconds + Math.floor(Math.random() * (maxSeconds - minSeconds + 1)));
}

function buildDiceRoll(inject: Inject) {
  return (hashSeed(inject.id) % 20) + 1;
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
    "- Session mode: TabletopForge facilitated",
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
