"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  CheckCircle2,
  Dices,
  Gamepad2,
  ListTodo,
  Loader2,
  NotebookPen,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { boardSpaceCount, pawnOptions, type PawnKey } from "@/components/tabletop-board-config";
import type { GeneratedExercise } from "@/lib/types";

type CardKind = "brief" | "question" | "decision" | "gap" | "inject";

interface BoardCard {
  id: string;
  kind: CardKind;
  title: string;
  text: string;
  stage: string;
}

interface DecisionPathEntry {
  cardTitle: string;
  response: string;
}

const LazyTabletopBoardScene = dynamic(
  () => import("@/components/TabletopBoardScene").then((module) => module.TabletopBoardScene),
  {
    ssr: false,
    loading: () => <TableScenePlaceholder label="Loading 3D table..." />,
  },
);

export function TabletopBoardSession({
  exercise,
  onClassicMode,
}: {
  exercise: GeneratedExercise;
  onClassicMode: () => void;
}) {
  const deck = useMemo(() => buildBoardDeck(exercise), [exercise]);
  const injectDeck = useMemo(() => buildInjectDeck(exercise), [exercise]);
  const [selectedPawn, setSelectedPawn] = useState<PawnKey>("sentinel");
  const [hasStarted, setHasStarted] = useState(false);
  const [positionIndex, setPositionIndex] = useState(0);
  const [deckIndex, setDeckIndex] = useState(0);
  const [activeCard, setActiveCard] = useState<BoardCard>(() => deck[0]);
  const [rollResult, setRollResult] = useState(0);
  const [rollNonce, setRollNonce] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [injectCount, setInjectCount] = useState(0);
  const [notes, setNotes] = useState("");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [hasEnteredTable, setHasEnteredTable] = useState(false);
  const [teamResponse, setTeamResponse] = useState("");
  const [decisionPath, setDecisionPath] = useState<DecisionPathEntry[]>([]);
  const [isInjectOverlayOpen, setIsInjectOverlayOpen] = useState(false);
  const [pendingCard, setPendingCard] = useState<BoardCard | null>(null);
  const [learningMoment, setLearningMoment] = useState("");

  const selectedPawnOption = pawnOptions.find((pawn) => pawn.key === selectedPawn) ?? pawnOptions[0];
  const injectThreshold = getInjectThreshold(exercise.overview.maturityLevel);
  const currentCardNumber = Math.min(deckIndex + 1, deck.length);
  const deckProgressPercent = Math.round((currentCardNumber / Math.max(1, deck.length)) * 100);

  const roll = useCallback(() => {
    if (isRolling || isInjectOverlayOpen || deck.length === 0) {
      return;
    }

    const nextRoll = Math.floor(Math.random() * 20) + 1;
    const nextPosition = (positionIndex + 1) % boardSpaceCount;
    const shouldInject = hasStarted && nextRoll >= injectThreshold && injectDeck.length > 0;
    const nextDeckIndex = (deckIndex + 1) % deck.length;
    const nextCard = deck[nextDeckIndex];
    const nextVisibleCard = shouldInject
      ? buildDecisionAwareInject(injectDeck[injectCount % injectDeck.length], decisionPath)
      : nextCard;

    setIsRolling(true);
    setRollResult(nextRoll);
    setRollNonce((current) => current + 1);
    setPositionIndex(nextPosition);

    window.setTimeout(() => {
      setActiveCard(nextVisibleCard);
      setPendingCard(shouldInject ? nextCard : null);
      setIsInjectOverlayOpen(shouldInject);
      setTeamResponse("");
      setLearningMoment("");
      setDeckIndex(nextDeckIndex);
      if (shouldInject) {
        setInjectCount((current) => current + 1);
      }
      setHasStarted(true);
      setIsRolling(false);
    }, 1350);
  }, [deck, deckIndex, decisionPath, hasStarted, injectCount, injectDeck, injectThreshold, isInjectOverlayOpen, isRolling, positionIndex]);

  function closeInjectOverlay() {
    if (pendingCard) {
      setActiveCard(pendingCard);
    }
    setIsInjectOverlayOpen(false);
    setPendingCard(null);
  }

  function resetBoard() {
    setHasStarted(false);
    setPositionIndex(0);
    setDeckIndex(0);
    setActiveCard(deck[0]);
    setRollResult(0);
    setRollNonce(0);
    setIsRolling(false);
    setInjectCount(0);
    setTeamResponse("");
    setDecisionPath([]);
    setIsInjectOverlayOpen(false);
    setPendingCard(null);
    setLearningMoment("");
  }

  function captureResponse() {
    const response = teamResponse.trim();
    if (!response) {
      return;
    }

    setDecisionPath((current) => [...current, { cardTitle: activeCard.title, response }].slice(-8));
    setLearningMoment(buildLearningMoment(activeCard, response, exercise));
    setNotes((current) => {
      const nextLine = `${activeCard.title}: ${response}`;
      return current.trim() ? `${current.trim()}\n${nextLine}` : nextLine;
    });
    setTeamResponse("");
  }

  return (
    <section className="table-mode-shell overflow-hidden rounded-lg border border-primary/20 bg-background/60">
      {isInjectOverlayOpen && activeCard.kind === "inject" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
          <div className="w-full max-w-3xl text-center">
            <div className="mx-auto mb-6 flex size-24 items-center justify-center rounded-2xl border border-accent/45 bg-accent/15 shadow-2xl shadow-accent/20">
              <Dices className="size-12 text-accent" suppressHydrationWarning />
            </div>
            <Badge variant="secondary" className="mb-4 border-accent/50 bg-accent/20 text-accent">
              Scenario Evolution
            </Badge>
            <h2 className="text-4xl font-semibold text-foreground sm:text-6xl">OH NO...</h2>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-9 text-foreground">{activeCard.text}</p>
            <Button size="lg" className="mt-8" onClick={closeInjectOverlay}>
              Continue To Card {currentCardNumber}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-[calc(100vh-12rem)] lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="relative min-h-[28rem] bg-[radial-gradient(circle_at_center,rgba(40,199,144,0.16),transparent_38rem)]">
          {hasEnteredTable ? (
            <LazyTabletopBoardScene
              pawn={selectedPawn}
              positionIndex={positionIndex}
              rollNonce={rollNonce}
              rollResult={rollResult}
              isRolling={isRolling}
            />
          ) : (
            <TableScenePlaceholder label="Ready when you are." />
          )}

          {!hasEnteredTable ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/82 p-4 backdrop-blur-sm">
              <div className="max-w-2xl rounded-lg border border-primary/35 bg-card/90 p-6 text-center shadow-2xl shadow-black/40">
                <Badge variant="secondary" className="mb-4">TabletopForge Table Mode</Badge>
                <h2 className="text-3xl font-semibold text-foreground sm:text-5xl">Pull up a chair.</h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                  Choose a pawn, then roll through the exercise one card at a time. The 3D table loads only after you enter so the page does not feel stuck.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button size="lg" onClick={() => setHasEnteredTable(true)}>
                    <Gamepad2 className="size-5" suppressHydrationWarning />
                    Enter The Table
                  </Button>
                  <Button size="lg" variant="outline" onClick={onClassicMode}>
                    <ListTodo className="size-5" suppressHydrationWarning />
                    Classic Mode
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-start justify-between gap-3">
            <div className="pointer-events-auto rounded-md border border-border bg-background/80 p-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Table Mode</Badge>
                <Badge variant="outline">{exercise.overview.scenario}</Badge>
                <Badge variant="outline">{exercise.overview.maturityLevel}</Badge>
              </div>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Roll the d20, move the pawn, and let the board reveal the next discussion card.
              </p>
            </div>
            <div className="pointer-events-auto flex flex-wrap gap-2">
              <Button variant="outline" onClick={onClassicMode}>
                <ListTodo className="size-4" suppressHydrationWarning />
                Classic
              </Button>
              <Button variant="outline" onClick={resetBoard}>
                <RefreshCw className="size-4" suppressHydrationWarning />
                Reset
              </Button>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
            <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-3 rounded-md border border-border bg-background/88 p-4 shadow-2xl shadow-black/35 backdrop-blur md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Pawn: {selectedPawnOption.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{selectedPawnOption.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {pawnOptions.map((pawn) => (
                  <button
                    key={pawn.key}
                    type="button"
                    className={`size-10 rounded-full border-2 transition ${
                      pawn.key === selectedPawn ? "border-primary shadow-lg shadow-primary/20" : "border-border"
                    }`}
                    style={{ background: `linear-gradient(135deg, ${pawn.color}, ${pawn.accent})` }}
                    onClick={() => setSelectedPawn(pawn.key)}
                    aria-label={`Choose ${pawn.name} pawn`}
                    title={pawn.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className="flex min-h-[28rem] flex-col border-t border-border bg-card/80 lg:border-l lg:border-t-0">
          <div className="border-b border-border p-5">
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={activeCard.kind === "inject" ? "secondary" : "outline"}>
                  {activeCard.kind === "inject" ? "Interruption" : activeCard.stage}
                </Badge>
                <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                  Card {currentCardNumber} of {deck.length}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${deckProgressPercent}%` }} />
              </div>
            </div>
            <h2 className="text-2xl font-semibold leading-8 text-foreground">{activeCard.title}</h2>
            <p className="mt-4 text-base leading-8 text-muted-foreground">{activeCard.text}</p>
          </div>

          <div className="space-y-4 p-5">
            <Button size="lg" className="w-full" onClick={roll} disabled={isRolling || isInjectOverlayOpen}>
              <Dices className="size-5" suppressHydrationWarning />
              {isRolling ? "Rolling..." : hasStarted ? "Roll For Next Card" : "Roll To Begin"}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              Cards stay in order. The die controls pressure and surprise injects.
              {rollResult > 0 ? ` Last roll: ${rollResult}.` : ""}
            </p>

            {activeCard.kind !== "brief" ? (
              <div className="space-y-3 rounded-md border border-border bg-background/45 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="size-4 text-primary" suppressHydrationWarning />
                  Team answer
                </div>
                <Textarea
                  value={teamResponse}
                  onChange={(event) => setTeamResponse(event.target.value)}
                  placeholder="Talk it out, then capture one sentence if you want the next twist to react to it."
                  className="min-h-[92px]"
                />
                <Button variant="secondary" onClick={captureResponse} disabled={!teamResponse.trim()}>
                  Capture Response
                </Button>
                {learningMoment ? (
                  <div className="rounded-md border border-primary/25 bg-primary/10 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Sparkles className="size-4" suppressHydrationWarning />
                      Learning beat
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{learningMoment}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button variant="outline" className="w-full" onClick={() => setIsNotesOpen((current) => !current)}>
              <NotebookPen className="size-4" suppressHydrationWarning />
              {isNotesOpen ? "Hide Notes" : notes.trim() ? "Open Notes" : "Add Notes"}
            </Button>

            {isNotesOpen ? (
              <div className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Capture decisions, unclear answers, and improvements."
                  className="min-h-[160px]"
                />
              </div>
            ) : null}

            {decisionPath.length > 0 ? (
              <div className="rounded-md border border-accent/30 bg-accent/10 p-4">
                <p className="text-sm font-medium text-accent">Last captured answer</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {decisionPath.at(-1)?.response}
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function TableScenePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[28rem] w-full items-center justify-center p-6">
      <div className="relative aspect-[16/10] w-full max-w-4xl overflow-hidden rounded-lg border border-primary/25 bg-[radial-gradient(circle_at_center,rgba(35,211,155,0.16),transparent_32rem),linear-gradient(135deg,rgba(91,58,36,0.5),rgba(13,26,38,0.8))] p-6 shadow-2xl shadow-black/30">
        <div className="absolute inset-8 rounded-lg border border-primary/30 bg-background/35" />
        <div className="absolute inset-12 grid grid-cols-4 grid-rows-3 gap-3">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className={`rounded-md border ${
                index === 11 ? "border-accent/50 bg-accent/15" : "border-primary/25 bg-primary/10"
              }`}
            />
          ))}
        </div>
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg border border-border bg-background/80 p-5 text-center backdrop-blur">
          {label.includes("Loading") ? (
            <Loader2 className="size-8 animate-spin text-primary" suppressHydrationWarning />
          ) : (
            <Play className="size-8 text-primary" suppressHydrationWarning />
          )}
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">
            The page stays lightweight until the 3D board is opened.
          </p>
        </div>
      </div>
    </div>
  );
}

function buildBoardDeck(exercise: GeneratedExercise): BoardCard[] {
  const cards: BoardCard[] = [
    {
      id: "brief-0",
      kind: "brief",
      title: "Set The Scene",
      text: exercise.scenarioSummary,
      stage: "Brief",
    },
    ...exercise.discussionQuestions.slice(0, 8).map((question, index) => ({
      id: `question-${index}`,
      kind: "question" as const,
      title: `Discussion Card ${index + 1}`,
      text: question,
      stage: "Discuss",
    })),
    ...exercise.expectedDecisions.slice(0, 5).map((decision, index) => ({
      id: `decision-${index}`,
      kind: "decision" as const,
      title: `Choice Point ${index + 1}`,
      text: `Pick a path: ${decision}`,
      stage: "Decision",
    })),
    ...exercise.gapDiscoveryQuestions.slice(0, 5).map((question, index) => ({
      id: `gap-${index}`,
      kind: "gap" as const,
      title: `Gap Check ${index + 1}`,
      text: question,
      stage: "IRP Gap",
    })),
  ];

  return cards.length > 0 ? cards : [{ id: "fallback", kind: "brief", title: "Start", text: exercise.overview.purpose, stage: "Brief" }];
}

function buildInjectDeck(exercise: GeneratedExercise): BoardCard[] {
  const scenario = exercise.overview.scenario.toLowerCase();
  const org = exercise.overview.organization;
  const size = exercise.overview.organizationSize;
  const isAdvanced = exercise.overview.maturityLevel === "Advanced";
  const irpGap = exercise.irpAnalysis?.findings.find((finding) => finding.status !== "found");

  return [
    {
      id: "inject-scope",
      kind: "inject",
      title: "OH NO... scope just changed.",
      text: `A second report comes in from a different part of ${org}. The team has to decide whether this is still isolated or whether the incident should be escalated.`,
      stage: "Inject",
    },
    {
      id: "inject-leadership",
      kind: "inject",
      title: "OH NO... leadership wants an answer.",
      text: `A leader asks for a plain-language update in five minutes. The team must separate confirmed facts from assumptions before anyone sends a message.`,
      stage: "Inject",
    },
    {
      id: "inject-size",
      kind: "inject",
      title: "OH NO... the structure is getting tested.",
      text:
        size === "1-25"
          ? "The person who normally approves response actions is unavailable. Who can keep the response moving without overstepping?"
          : "Two teams begin taking separate actions. Who coordinates the response and keeps decisions from splitting apart?",
      stage: "Inject",
    },
    {
      id: "inject-gap",
      kind: "inject",
      title: "OH NO... the plan has a weak spot.",
      text: irpGap
        ? `The exercise hits the IRP gap around ${irpGap.label.toLowerCase()}. The group has to decide what to do now and what must be fixed after the exercise.`
        : `The ${scenario} response depends on a contact or approval path nobody can find quickly. Capture the missing owner before moving on.`,
      stage: "Inject",
    },
    {
      id: "inject-hard",
      kind: "inject",
      title: "OH NO... evidence may be slipping away.",
      text: isAdvanced
        ? "A key log source may rotate soon, and containment could change what evidence remains. The team must choose what to preserve before taking the next action."
        : "Someone asks what should be written down before the team changes anything. Decide what notes or screenshots matter most.",
      stage: "Inject",
    },
  ];
}

function buildDecisionAwareInject(baseInject: BoardCard, decisionPath: DecisionPathEntry[]): BoardCard {
  const latestDecision = decisionPath.at(-1)?.response.trim();
  if (!latestDecision) {
    return baseInject;
  }

  const normalized = latestDecision.toLowerCase();
  let text = `${baseInject.text} This directly tests the team's current path: "${latestDecision}".`;

  if (/\b(memory|volatile|forensic|evidence|image|preserve|logs?)\b/.test(normalized)) {
    text =
      "OH NO... the device reboots before evidence is fully preserved. The group has to decide what evidence remains trustworthy, who owns preservation, and whether the plan says what to do next.";
  } else if (/\b(isolate|contain|disconnect|disable|shut\s?down|block)\b/.test(normalized)) {
    text =
      "OH NO... containment works, but it breaks a business process another team says is critical. The group needs to decide who can approve that impact and what rollback path exists.";
  } else if (/\b(wait|monitor|investigate|observe|hold)\b/.test(normalized)) {
    text =
      "OH NO... while the team keeps investigating, another related report arrives. The group has to decide whether waiting improved confidence or let the incident grow.";
  } else if (/\b(notify|communicat|email|announce|customer|staff|public|regulator)\b/.test(normalized)) {
    text =
      "OH NO... someone forwards an update before the facts are fully confirmed. The group has to correct the message and decide who approves communications from here.";
  } else if (/\b(restore|backup|recover|rebuild)\b/.test(normalized)) {
    text =
      "OH NO... recovery starts, but the most recent backup validation is older than expected. The group has to decide whether to restore, keep investigating, or accept downtime.";
  }

  return {
    ...baseInject,
    id: `${baseInject.id}-path-${decisionPath.length}`,
    text,
  };
}

function buildLearningMoment(card: BoardCard, response: string, exercise: GeneratedExercise) {
  const normalized = response.toLowerCase();
  const isBasic = exercise.overview.maturityLevel === "Basic";

  if (/\b(owner|owns|responsible|approve|authority|decide)\b/.test(normalized)) {
    return isBasic
      ? "Good instinct: naming one owner keeps the group from waiting on everyone at once."
      : "Strong path: this turns a vague response into an authority decision that can be tested against the IRP.";
  }

  if (/\b(log|evidence|preserve|screenshot|forensic|memory|audit)\b/.test(normalized)) {
    return isBasic
      ? "Helpful: writing down what changed and when gives the team something reliable to review later."
      : "Good evidence thinking. The next question is whether the IRP says who preserves it and how fast it must happen.";
  }

  if (/\b(customer|staff|public|regulator|legal|notify|message|communication)\b/.test(normalized)) {
    return isBasic
      ? "Good communication choice: separate confirmed facts from guesses before anyone sends an update."
      : "Good pressure point. This should connect to approval authority, legal/compliance timing, and message ownership.";
  }

  if (/\b(restore|backup|recover|rebuild|downtime|continuity)\b/.test(normalized)) {
    return isBasic
      ? "Good recovery thinking: the team should know what matters most before choosing what comes back first."
      : "Good recovery path. Now test whether backup validation, business priority, and decision authority are all documented.";
  }

  if (card.kind === "gap") {
    return "This is exactly the kind of gap worth turning into an action item: owner, deadline, and the plan section that needs updating.";
  }

  return isBasic
    ? "Nice. Keep answers simple: who does it, who approves it, and what gets written down."
    : "Good. To make this actionable, connect the answer to authority, evidence, communications, and the exact IRP reference if one exists.";
}

function getInjectThreshold(maturityLevel: GeneratedExercise["overview"]["maturityLevel"]) {
  if (maturityLevel === "Advanced") {
    return 14;
  }

  if (maturityLevel === "Intermediate") {
    return 16;
  }

  return 18;
}
