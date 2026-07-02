"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Bot,
  CheckCircle2,
  Clipboard,
  Dices,
  Download,
  Gamepad2,
  Lightbulb,
  ListTodo,
  Loader2,
  Lock,
  MessageSquare,
  NotebookPen,
  Play,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildCyberBoardSpaces, pawnOptions, type PawnKey } from "@/components/tabletop-board-config";
import {
  isAccountApiConfigured,
  requestTabletopAiAssistance,
  requestTabletopAiInject,
  type TabletopAiAssistResponse,
} from "@/lib/account";
import { downloadTextFile, safeFilename } from "@/lib/report-export";
import type { GeneratedExercise } from "@/lib/types";

type CardKind = "brief" | "question" | "decision" | "gap" | "inject";
type ScoreCategoryId = "ownership" | "evidence" | "communications" | "continuity" | "irp";

interface BoardCard {
  id: string;
  kind: CardKind;
  title: string;
  text: string;
  stage: string;
  goal: string;
  scoreCategory: ScoreCategoryId;
}

interface DecisionPathEntry {
  cardId: string;
  cardTitle: string;
  stage: string;
  response: string;
  scoreCategory: ScoreCategoryId;
  skipped: boolean;
  createdAt: string;
}

interface RevealedGameInject {
  id: string;
  title: string;
  text: string;
  followUpQuestion: string;
  expectedDecision: string;
  source: "ai" | "fallback";
  roll: number;
  cardTitle: string;
}

interface GameScoreCategory {
  id: ScoreCategoryId;
  label: string;
  score: number;
  summary: string;
}

interface GameScorecard {
  completedAt: string;
  overallScore: number;
  readinessTier: "Developing" | "Functional" | "Strong" | "Exercise Ready";
  categories: GameScoreCategory[];
  strengths: string[];
  gaps: string[];
  actionItems: string[];
  nextTabletop: string;
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
  const boardSpaces = useMemo(() => buildCyberBoardSpaces(exercise), [exercise]);
  const [selectedPawn, setSelectedPawn] = useState<PawnKey>("sentinel");
  const [hasStarted, setHasStarted] = useState(false);
  const [positionIndex, setPositionIndex] = useState(0);
  const [deckIndex, setDeckIndex] = useState(0);
  const [activeCard, setActiveCard] = useState<BoardCard>(() => deck[0]);
  const [resolvedCards, setResolvedCards] = useState<Record<string, boolean>>({});
  const [rollResult, setRollResult] = useState(0);
  const [rollNonce, setRollNonce] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [isGeneratingInject, setIsGeneratingInject] = useState(false);
  const [notes, setNotes] = useState("");
  const [isNotesOpen, setIsNotesOpen] = useState(true);
  const [hasEnteredTable, setHasEnteredTable] = useState(false);
  const [teamResponse, setTeamResponse] = useState("");
  const [decisionPath, setDecisionPath] = useState<DecisionPathEntry[]>([]);
  const [revealedInjects, setRevealedInjects] = useState<RevealedGameInject[]>([]);
  const [isInjectOverlayOpen, setIsInjectOverlayOpen] = useState(false);
  const [overlayInject, setOverlayInject] = useState<RevealedGameInject | null>(null);
  const [pendingCard, setPendingCard] = useState<BoardCard | null>(null);
  const [learningMoment, setLearningMoment] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantNotice, setAssistantNotice] = useState("");
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [scorecard, setScorecard] = useState<GameScorecard | null>(null);

  const selectedPawnOption = pawnOptions.find((pawn) => pawn.key === selectedPawn) ?? pawnOptions[0];
  const injectThreshold = getInjectThreshold(exercise.overview.maturityLevel);
  const currentCardNumber = Math.min(deckIndex + 1, deck.length);
  const resolvedCount = deck.filter((card) => card.kind === "brief" || resolvedCards[card.id]).length;
  const deckProgressPercent = Math.round((resolvedCount / Math.max(1, deck.length)) * 100);
  const activeInject = revealedInjects.at(-1);
  const isCurrentCardResolved = activeCard.kind === "brief" || resolvedCards[activeCard.id] === true;
  const isFinalCard = deckIndex >= deck.length - 1;
  const canUseAi = isAccountApiConfigured();

  const roll = useCallback(() => {
    if (isRolling || isGeneratingInject || isInjectOverlayOpen || deck.length === 0 || scorecard) {
      return;
    }

    if (!isCurrentCardResolved) {
      setActionNotice("Capture the team answer or mark this card discussed before rolling again.");
      return;
    }

    if (isFinalCard) {
      const nextScorecard = buildGameScorecard(exercise, deck, decisionPath, revealedInjects, notes);
      setScorecard(nextScorecard);
      setActionNotice("Exercise complete. Scorecard is ready.");
      return;
    }

    const nextRoll = Math.floor(Math.random() * 20) + 1;
    const nextPosition = (positionIndex + 1) % boardSpaces.length;
    const shouldInject = hasStarted && nextRoll >= injectThreshold && injectDeck.length > 0;
    const nextDeckIndex = deckIndex + 1;
    const nextCard = deck[nextDeckIndex];

    setIsRolling(true);
    setRollResult(nextRoll);
    setRollNonce((current) => current + 1);
    setPositionIndex(nextPosition);
    setActionNotice(shouldInject ? "High roll. Drawing a scenario consequence..." : "");

    window.setTimeout(() => {
      void (async () => {
        if (shouldInject) {
          setIsGeneratingInject(true);
          const inject = await resolveInjectCard({
            exercise,
            fallbackInject: injectDeck[(revealedInjects.length + nextRoll) % injectDeck.length],
            decisionPath,
            revealedInjects,
            notes,
            roll: nextRoll,
            activeCard,
            canUseAi,
          });
          setRevealedInjects((current) => [...current, inject]);
          setOverlayInject(inject);
          setPendingCard(nextCard);
          setDeckIndex(nextDeckIndex);
          setIsInjectOverlayOpen(true);
          setIsGeneratingInject(false);
        } else {
          setDeckIndex(nextDeckIndex);
          setActiveCard(nextCard);
          setTeamResponse("");
          setLearningMoment("");
        }

        setHasStarted(true);
        setIsRolling(false);
      })();
    }, 1000);
  }, [
    activeCard,
    boardSpaces.length,
    canUseAi,
    deck,
    deckIndex,
    decisionPath,
    exercise,
    hasStarted,
    injectDeck,
    injectThreshold,
    isCurrentCardResolved,
    isFinalCard,
    isGeneratingInject,
    isInjectOverlayOpen,
    isRolling,
    notes,
    positionIndex,
    revealedInjects,
    scorecard,
  ]);

  function closeInjectOverlay() {
    if (pendingCard) {
      setActiveCard(pendingCard);
    }
    setIsInjectOverlayOpen(false);
    setOverlayInject(null);
    setPendingCard(null);
    setTeamResponse("");
    setLearningMoment("");
    setActionNotice("");
  }

  function resetBoard() {
    setHasStarted(false);
    setPositionIndex(0);
    setDeckIndex(0);
    setActiveCard(deck[0]);
    setResolvedCards({});
    setRollResult(0);
    setRollNonce(0);
    setIsRolling(false);
    setIsGeneratingInject(false);
    setTeamResponse("");
    setDecisionPath([]);
    setRevealedInjects([]);
    setIsInjectOverlayOpen(false);
    setOverlayInject(null);
    setPendingCard(null);
    setLearningMoment("");
    setActionNotice("");
    setAssistantQuestion("");
    setAssistantAnswer("");
    setAssistantNotice("");
    setScorecard(null);
  }

  function captureResponse(skipped = false) {
    if (activeCard.kind === "brief") {
      return;
    }

    const response = skipped ? "Discussed aloud; no written answer captured." : teamResponse.trim();
    if (!response) {
      setActionNotice("Write one sentence or use Discussed Aloud to keep moving.");
      return;
    }

    const entry: DecisionPathEntry = {
      cardId: activeCard.id,
      cardTitle: activeCard.title,
      stage: activeCard.stage,
      response,
      scoreCategory: activeCard.scoreCategory,
      skipped,
      createdAt: new Date().toISOString(),
    };

    setResolvedCards((current) => ({ ...current, [activeCard.id]: true }));
    setDecisionPath((current) => [...current.filter((item) => item.cardId !== activeCard.id), entry]);
    setLearningMoment(buildLearningMoment(activeCard, response, exercise, skipped));
    setActionNotice("");
    setNotes((current) => {
      const nextLine = `${activeCard.stage} - ${activeCard.title}: ${response}`;
      return current.trim() ? `${current.trim()}\n${nextLine}` : nextLine;
    });
    setTeamResponse("");
  }

  async function askAssistant(questionOverride?: string) {
    const question = (questionOverride ?? assistantQuestion).trim();
    if (!question || isAssistantThinking) {
      return;
    }

    setAssistantQuestion(question);
    setAssistantAnswer("");
    setAssistantNotice("");
    setIsAssistantOpen(true);
    setIsAssistantThinking(true);

    try {
      const answer = await requestTabletopAiAssistance({
        question,
        exercise: buildAiExercisePayload(exercise),
        currentStep: {
          title: activeCard.title,
          knownFacts: buildKnownFacts(exercise, activeInject),
          unknowns: buildUnknowns(exercise, activeCard),
          decisions: [activeCard.goal, ...exercise.expectedDecisions.slice(0, 6)],
          activeDecision: decisionPath.at(-1)?.response ?? activeCard.goal,
          activePrompt: activeCard.text,
        },
        irpAnalysis: exercise.irpAnalysis,
        previousInjects: revealedInjects.map((inject) => inject.text),
        sessionNotes: notes,
        actionItems: decisionPath.map((entry) => `${entry.stage}: ${entry.response}`).join("\n"),
      });
      setAssistantAnswer(formatAssistantAnswer(answer));
      setAssistantNotice("Answered by TabletopForge AI.");
    } catch {
      setAssistantAnswer(buildLocalAssistanceAnswer(question, exercise, activeCard, activeInject));
      setAssistantNotice(canUseAi ? "AI was unavailable, so built-in guidance answered this." : "Built-in guidance. Sign in with backend access for AI answers.");
    } finally {
      setIsAssistantThinking(false);
    }
  }

  async function copyScorecard() {
    if (!scorecard) {
      return;
    }

    await navigator.clipboard.writeText(buildGameScorecardMarkdown(exercise, scorecard, decisionPath, revealedInjects, notes));
    setActionNotice("Scorecard copied.");
  }

  function downloadScorecard() {
    if (!scorecard) {
      return;
    }

    downloadTextFile(
      buildGameScorecardHtml(exercise, scorecard, decisionPath, revealedInjects, notes),
      `${safeFilename(exercise.overview.organization)}-tabletop-game-scorecard.html`,
      "text/html;charset=utf-8",
    );
    setActionNotice("Readable scorecard downloaded.");
  }

  return (
    <section className="table-mode-shell overflow-hidden rounded-lg border border-primary/20 bg-background/60">
      {isInjectOverlayOpen && overlayInject ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
          <div className="w-full max-w-3xl text-center">
            <div className="mx-auto mb-6 flex size-28 items-center justify-center rounded-2xl border border-accent/45 bg-accent/15 shadow-2xl shadow-accent/20">
              <div className="dice-roll-landed text-center">
                <Dices className="mx-auto size-12 text-accent" suppressHydrationWarning />
                <p className="mt-2 text-4xl font-bold text-accent">{overlayInject.roll}</p>
              </div>
            </div>
            <Badge variant="secondary" className="mb-4 border-accent/50 bg-accent/20 text-accent">
              Scenario Evolution
            </Badge>
            <h2 className="text-4xl font-semibold text-foreground sm:text-6xl">OH NO...</h2>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-9 text-foreground">{overlayInject.text}</p>
            <div className="mx-auto mt-6 grid max-w-2xl gap-3 text-left md:grid-cols-2">
              <div className="rounded-md border border-border bg-background/55 p-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-accent">Ask Next</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{overlayInject.followUpQuestion}</p>
              </div>
              <div className="rounded-md border border-border bg-background/55 p-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-accent">Decision Pressure</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{overlayInject.expectedDecision}</p>
              </div>
            </div>
            <Button size="lg" className="mt-8" onClick={closeInjectOverlay}>
              Continue To Card {Math.min(deckIndex + 1, deck.length)}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-[calc(100vh-12rem)] xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="relative min-h-[32rem] bg-[radial-gradient(circle_at_center,rgba(40,199,144,0.16),transparent_38rem)]">
          {hasEnteredTable ? (
            <LazyTabletopBoardScene
              pawn={selectedPawn}
              boardSpaces={boardSpaces}
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
                  Choose a pawn, roll the die, answer one card at a time, and let the scenario react to the team&apos;s decisions.
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
                The deck stays in order. Dice add pressure, not chaos.
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

        <aside className="flex min-h-[32rem] flex-col border-t border-border bg-card/85 xl:border-l xl:border-t-0">
          <div className="border-b border-border p-5">
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={activeCard.kind === "inject" ? "secondary" : "outline"}>{activeCard.stage}</Badge>
                <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                  Card {currentCardNumber} of {deck.length}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${deckProgressPercent}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isCurrentCardResolved ? (
                <CheckCircle2 className="size-4 text-primary" suppressHydrationWarning />
              ) : (
                <Lock className="size-4 text-accent" suppressHydrationWarning />
              )}
              {isCurrentCardResolved ? "Ready for the next roll" : "Answer required before the next roll"}
            </div>
            <h2 className="mt-3 text-2xl font-semibold leading-8 text-foreground">{activeCard.title}</h2>
            <p className="mt-4 text-base leading-8 text-muted-foreground">{activeCard.text}</p>
            <div className="mt-4 rounded-md border border-primary/25 bg-primary/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-primary">Turn Goal</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{activeCard.goal}</p>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {scorecard ? (
              <ScorecardPanel
                scorecard={scorecard}
                onCopy={copyScorecard}
                onDownload={downloadScorecard}
              />
            ) : null}

            {!scorecard && activeCard.kind !== "brief" ? (
              <div className="space-y-3 rounded-md border border-border bg-background/45 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MessageSquare className="size-4 text-primary" suppressHydrationWarning />
                  Team answer
                </div>
                <Textarea
                  value={teamResponse}
                  onChange={(event) => setTeamResponse(event.target.value)}
                  placeholder="Capture one sentence. Example: We isolate the account, preserve mailbox logs, and notify the incident owner."
                  className="min-h-[96px]"
                  disabled={isCurrentCardResolved}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={() => captureResponse(false)} disabled={isCurrentCardResolved || !teamResponse.trim()}>
                    Capture Answer
                  </Button>
                  <Button variant="outline" onClick={() => captureResponse(true)} disabled={isCurrentCardResolved}>
                    Discussed Aloud
                  </Button>
                </div>
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

            {activeInject ? (
              <div className="rounded-md border border-accent/35 bg-accent/10 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-accent">Latest Inject</p>
                  <Badge variant="outline">D20: {activeInject.roll}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{activeInject.text}</p>
                <p className="mt-3 text-sm leading-6 text-foreground">{activeInject.followUpQuestion}</p>
              </div>
            ) : null}

            <AssistantPanel
              isOpen={isAssistantOpen}
              question={assistantQuestion}
              answer={assistantAnswer}
              notice={assistantNotice}
              isThinking={isAssistantThinking}
              onToggle={() => setIsAssistantOpen((current) => !current)}
              onQuestionChange={setAssistantQuestion}
              onAsk={() => askAssistant()}
              onQuickAsk={askAssistant}
            />

            <Button variant="outline" className="w-full" onClick={() => setIsNotesOpen((current) => !current)}>
              <NotebookPen className="size-4" suppressHydrationWarning />
              {isNotesOpen ? "Hide Notes" : "Open Notes"}
            </Button>

            {isNotesOpen ? (
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Running notes stay visible here: decisions, unclear answers, and improvements."
                className="min-h-[140px]"
              />
            ) : null}
          </div>

          <div className="border-t border-border p-5">
            {actionNotice ? (
              <p className="mb-3 rounded-md border border-accent/30 bg-accent/10 p-3 text-sm leading-6 text-accent">{actionNotice}</p>
            ) : null}
            <Button size="lg" className="w-full" onClick={roll} disabled={isRolling || isGeneratingInject || isInjectOverlayOpen || Boolean(scorecard)}>
              <Dices className="size-5" suppressHydrationWarning />
              {isGeneratingInject
                ? "Drawing Consequence..."
                : isRolling
                  ? "Rolling..."
                  : isFinalCard && isCurrentCardResolved
                    ? "Finish Tabletop"
                    : hasStarted
                      ? "Roll Next Card"
                      : "Roll To Begin"}
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
              {rollResult > 0 ? `Last roll: ${rollResult}. ` : ""}
              High rolls can trigger a short consequence based on the team&apos;s last answer.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function AssistantPanel({
  isOpen,
  question,
  answer,
  notice,
  isThinking,
  onToggle,
  onQuestionChange,
  onAsk,
  onQuickAsk,
}: {
  isOpen: boolean;
  question: string;
  answer: string;
  notice: string;
  isThinking: boolean;
  onToggle: () => void;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
  onQuickAsk: (question: string) => void;
}) {
  return (
    <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" suppressHydrationWarning />
          <p className="text-sm font-medium text-foreground">AI Coach</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle}>
          {isOpen ? "Close" : "Ask"}
        </Button>
      </div>
      {isOpen ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              "What should we decide next?",
              "What would our IRP say here?",
              "Explain this for non-technical leaders.",
            ].map((item) => (
              <Button key={item} variant="outline" size="sm" onClick={() => onQuickAsk(item)} disabled={isThinking}>
                {item}
              </Button>
            ))}
          </div>
          <Textarea
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="Ask for help with the current situation."
            className="min-h-[80px]"
          />
          <Button variant="secondary" onClick={onAsk} disabled={isThinking || !question.trim()}>
            <Lightbulb className="size-4" suppressHydrationWarning />
            {isThinking ? "Thinking..." : "Ask Coach"}
          </Button>
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          {answer ? (
            <div className="rounded-md border border-border bg-background/55 p-3 text-sm leading-6 text-muted-foreground">
              {answer}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ScorecardPanel({
  scorecard,
  onCopy,
  onDownload,
}: {
  scorecard: GameScorecard;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="rounded-md border border-primary/35 bg-primary/10 p-4">
      <div className="flex items-center gap-2 text-primary">
        <Trophy className="size-5" suppressHydrationWarning />
        <p className="text-sm font-semibold uppercase tracking-normal">Final Scorecard</p>
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-4">
        <div className="flex size-20 items-center justify-center rounded-full border border-primary/45 bg-background text-3xl font-bold text-primary">
          {scorecard.overallScore}
        </div>
        <div>
          <p className="text-xl font-semibold text-foreground">{scorecard.readinessTier}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{scorecard.nextTabletop}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {scorecard.categories.map((category) => (
          <div key={category.id} className="rounded-md border border-border bg-background/45 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{category.label}</p>
              <Badge variant="outline">{category.score}/100</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{category.summary}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={onCopy}>
          <Clipboard className="size-4" suppressHydrationWarning />
          Copy
        </Button>
        <Button variant="secondary" onClick={onDownload}>
          <Download className="size-4" suppressHydrationWarning />
          Download
        </Button>
      </div>
    </div>
  );
}

function TableScenePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[28rem] w-full items-center justify-center p-6">
      <div className="relative aspect-[16/10] w-full max-w-4xl overflow-hidden rounded-lg border border-primary/25 bg-[radial-gradient(circle_at_center,rgba(35,211,155,0.16),transparent_32rem),linear-gradient(135deg,rgba(91,58,36,0.5),rgba(13,26,38,0.8))] p-6 shadow-2xl shadow-black/30">
        <div className="absolute inset-8 rounded-lg border border-primary/30 bg-background/35" />
        <div className="absolute inset-10 grid grid-cols-6 grid-rows-6 gap-2">
          {Array.from({ length: 36 }).map((_, index) => {
            const row = Math.floor(index / 6);
            const col = index % 6;
            const isTrack = row === 0 || row === 5 || col === 0 || col === 5;
            const isCorner = isTrack && (row === 0 || row === 5) && (col === 0 || col === 5);
            if (!isTrack) {
              return <div key={index} />;
            }

            return (
              <div
                key={index}
                className={`rounded-md border ${
                  isCorner ? "border-primary/45 bg-primary/20" : index === 35 ? "border-accent/50 bg-accent/15" : "border-primary/25 bg-primary/10"
                }`}
              />
            );
          })}
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
  const targetCards = getTargetCardCount(exercise);
  const sourceCards: BoardCard[] = [
    ...exercise.discussionQuestions.map((question, index) => ({
      id: `question-${index}`,
      kind: "question" as const,
      title: `Discuss ${index + 1}`,
      text: question,
      stage: pickStage(index),
      goal: "Talk through the situation and name what the team believes is true right now.",
      scoreCategory: pickQuestionCategory(question),
    })),
    ...exercise.expectedDecisions.map((decision, index) => ({
      id: `decision-${index}`,
      kind: "decision" as const,
      title: `Decision ${index + 1}`,
      text: `Pick one response path or write your own: ${decision}`,
      stage: pickStage(index + 1),
      goal: "Make one clear decision with an owner, authority path, and next action.",
      scoreCategory: pickQuestionCategory(decision),
    })),
    ...exercise.gapDiscoveryQuestions.map((question, index) => ({
      id: `gap-${index}`,
      kind: "gap" as const,
      title: `IRP Check ${index + 1}`,
      text: question,
      stage: "Plan Gap",
      goal: "Decide whether the IRP answers this or whether it becomes an improvement item.",
      scoreCategory: "irp" as const,
    })),
  ];
  const ordered = interleaveCards(sourceCards).slice(0, targetCards);

  return [
    {
      id: "brief-0",
      kind: "brief",
      title: "Set The Scene",
      text: exercise.scenarioSummary,
      stage: "Brief",
      goal: "Read the situation out loud. Everyone should understand what just happened before the first roll.",
      scoreCategory: "ownership",
    },
    ...ordered,
  ];
}

function interleaveCards(cards: BoardCard[]) {
  const questions = cards.filter((card) => card.kind === "question");
  const decisions = cards.filter((card) => card.kind === "decision");
  const gaps = cards.filter((card) => card.kind === "gap");
  const result: BoardCard[] = [];
  const longest = Math.max(questions.length, decisions.length, gaps.length);

  for (let index = 0; index < longest; index += 1) {
    if (questions[index]) {
      result.push(questions[index]);
    }
    if (decisions[index]) {
      result.push(decisions[index]);
    }
    if (index % 2 === 0 && gaps[Math.floor(index / 2)]) {
      result.push(gaps[Math.floor(index / 2)]);
    }
  }

  return result.length > 0 ? result : cards;
}

function getTargetCardCount(exercise: GeneratedExercise) {
  const baseByDuration: Record<string, number> = {
    "30 minutes": 6,
    "60 minutes": 8,
    "90 minutes": 10,
    "2 hours": 12,
  };
  const base = baseByDuration[exercise.overview.duration] ?? 8;
  const maturityAdd = exercise.overview.maturityLevel === "Advanced" ? 2 : exercise.overview.maturityLevel === "Basic" ? -1 : 0;
  return Math.max(5, Math.min(14, base + maturityAdd));
}

function buildInjectDeck(exercise: GeneratedExercise): BoardCard[] {
  const scenario = exercise.overview.scenario.toLowerCase();
  const org = exercise.overview.organization;
  const size = exercise.overview.organizationSize;
  const isAdvanced = exercise.overview.maturityLevel === "Advanced";
  const irpGap = exercise.irpAnalysis?.findings.find((finding) => finding.status !== "found");
  const isMsp = exercise.overview.industry === "MSP / IT Provider";

  return [
    {
      id: "inject-scope",
      kind: "inject",
      title: "Scope Shift",
      text: isMsp
        ? "A second client reports a related issue, and your service desk has to decide whether this is one client incident or a provider-wide response."
        : `A second report comes in from a different part of ${org}. The team has to decide whether this is still isolated or whether the incident should be escalated.`,
      stage: "Inject",
      goal: "Decide whether scope, severity, or communication path changes.",
      scoreCategory: "ownership",
    },
    {
      id: "inject-leadership",
      kind: "inject",
      title: "Leadership Pressure",
      text: "A leader asks for a plain-language update in five minutes. The team must separate confirmed facts from assumptions before anyone sends a message.",
      stage: "Inject",
      goal: "Choose who approves the update and what can be said.",
      scoreCategory: "communications",
    },
    {
      id: "inject-size",
      kind: "inject",
      title: "Coverage Problem",
      text:
        size === "1-25"
          ? "The person who normally approves response actions is unavailable. Who can keep the response moving without overstepping?"
          : "Two teams begin taking separate actions. Who coordinates the response and keeps decisions from splitting apart?",
      stage: "Inject",
      goal: "Name the backup owner and coordination path.",
      scoreCategory: "ownership",
    },
    {
      id: "inject-gap",
      kind: "inject",
      title: "Plan Gap",
      text: irpGap
        ? `The exercise hits the IRP gap around ${irpGap.label.toLowerCase()}. The group has to decide what to do now and what must be fixed after the exercise.`
        : `The ${scenario} response depends on a contact or approval path nobody can find quickly. Capture the missing owner before moving on.`,
      stage: "Inject",
      goal: "Convert the weak spot into a tracked improvement.",
      scoreCategory: "irp",
    },
    {
      id: "inject-hard",
      kind: "inject",
      title: "Evidence Pressure",
      text: isAdvanced
        ? "A key log source may rotate soon, and containment could change what evidence remains. The team must choose what to preserve before taking the next action."
        : "Someone asks what should be written down before the team changes anything. Decide what notes or screenshots matter most.",
      stage: "Inject",
      goal: "Balance fast action with preserving facts.",
      scoreCategory: "evidence",
    },
  ];
}

async function resolveInjectCard({
  exercise,
  fallbackInject,
  decisionPath,
  revealedInjects,
  notes,
  roll,
  activeCard,
  canUseAi,
}: {
  exercise: GeneratedExercise;
  fallbackInject: BoardCard;
  decisionPath: DecisionPathEntry[];
  revealedInjects: RevealedGameInject[];
  notes: string;
  roll: number;
  activeCard: BoardCard;
  canUseAi: boolean;
}): Promise<RevealedGameInject> {
  if (canUseAi) {
    try {
      const response = await requestTabletopAiInject({
        exercise: buildAiExercisePayload(exercise),
        irpAnalysis: exercise.irpAnalysis,
        currentStep: {
          title: activeCard.title,
          knownFacts: buildKnownFacts(exercise, revealedInjects.at(-1)),
          unknowns: buildUnknowns(exercise, activeCard),
          decisions: [activeCard.goal, ...exercise.expectedDecisions.slice(0, 6)],
          selectedDecision: decisionPath.at(-1)?.response ?? "",
        },
        previousInjects: revealedInjects.map((inject) => inject.text),
        sessionNotes: notes,
      });

      return {
        id: `ai-inject-${Date.now()}`,
        title: response.inject.injectTitle,
        text: compactSentence(response.inject.injectText, 420),
        followUpQuestion: compactSentence(response.inject.followUpQuestion, 180),
        expectedDecision: compactSentence(response.inject.expectedDecision, 180),
        source: "ai",
        roll,
        cardTitle: activeCard.title,
      };
    } catch {
      // Fall through to local injects so the game never stalls.
    }
  }

  const fallback = buildDecisionAwareInject(fallbackInject, decisionPath);
  return {
    id: `${fallback.id}-${Date.now()}`,
    title: fallback.title,
    text: fallback.text,
    followUpQuestion: fallback.goal,
    expectedDecision: buildExpectedDecisionFromInject(fallback),
    source: "fallback",
    roll,
    cardTitle: activeCard.title,
  };
}

function buildDecisionAwareInject(baseInject: BoardCard, decisionPath: DecisionPathEntry[]): BoardCard {
  const latestDecision = decisionPath.at(-1)?.response.trim();
  if (!latestDecision) {
    return baseInject;
  }

  const normalized = latestDecision.toLowerCase();
  let text = `${baseInject.text} This tests the team's current path: "${compactSentence(latestDecision, 120)}"`;

  if (/\b(memory|volatile|forensic|evidence|image|preserve|logs?)\b/.test(normalized)) {
    text =
      "The device reboots before evidence is fully preserved. Decide what evidence remains trustworthy, who owns preservation, and whether the plan says what to do next.";
  } else if (/\b(isolate|contain|disconnect|disable|shut\s?down|block)\b/.test(normalized)) {
    text =
      "Containment reduces risk, but it interrupts a business process another team says is critical. Decide who can approve that impact and what rollback path exists.";
  } else if (/\b(wait|monitor|investigate|observe|hold)\b/.test(normalized)) {
    text =
      "While the team keeps investigating, another related report arrives. Decide whether waiting improved confidence or let the incident grow.";
  } else if (/\b(notify|communicat|email|announce|customer|staff|public|regulator)\b/.test(normalized)) {
    text =
      "Someone forwards an update before the facts are fully confirmed. Decide how to correct the message and who approves communications from here.";
  } else if (/\b(restore|backup|recover|rebuild)\b/.test(normalized)) {
    text =
      "Recovery starts, but the most recent backup validation is older than expected. Decide whether to restore, keep investigating, or accept downtime.";
  }

  return {
    ...baseInject,
    id: `${baseInject.id}-path-${decisionPath.length}`,
    text,
  };
}

function buildLearningMoment(card: BoardCard, response: string, exercise: GeneratedExercise, skipped: boolean) {
  if (skipped) {
    return "Discussion counted. The scorecard will mark this lighter because no written decision was captured.";
  }

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
      ? "Good recovery thinking: know what matters most before choosing what comes back first."
      : "Good recovery path. Now test whether backup validation, business priority, and decision authority are documented.";
  }

  if (card.kind === "gap") {
    return "This is exactly the kind of gap worth turning into an action item: owner, deadline, and the plan section that needs updating.";
  }

  return isBasic
    ? "Keep answers simple: who does it, who approves it, and what gets written down."
    : "Make this actionable by connecting the answer to authority, evidence, communications, and the exact IRP reference if one exists.";
}

function buildGameScorecard(
  exercise: GeneratedExercise,
  deck: BoardCard[],
  decisions: DecisionPathEntry[],
  injects: RevealedGameInject[],
  notes: string,
): GameScorecard {
  const categories: GameScoreCategory[] = [
    scoreCategory("ownership", "Ownership / Authority", deck, decisions, "owners, approvals, and escalation paths"),
    scoreCategory("evidence", "Evidence Handling", deck, decisions, "logs, screenshots, audit trails, and preservation"),
    scoreCategory("communications", "Communications", deck, decisions, "leadership, staff, customer, legal, and regulator updates"),
    scoreCategory("continuity", "Continuity / Recovery", deck, decisions, "business impact, backup validation, and recovery priority"),
    scoreIrpCategory(exercise, deck, decisions),
  ];
  const notesBoost = notes.trim().length > 80 ? 3 : 0;
  const injectBoost = Math.min(6, injects.length * 2);
  const overallScore = boundedScore(Math.round(categories.reduce((total, category) => total + category.score, 0) / categories.length + notesBoost + injectBoost));
  const readinessTier = buildReadinessTier(overallScore);

  return {
    completedAt: new Date().toISOString(),
    overallScore,
    readinessTier,
    categories,
    strengths: buildScoreStrengths(categories, decisions, injects),
    gaps: buildScoreGaps(categories, deck, decisions),
    actionItems: buildScoreActionItems(categories, exercise),
    nextTabletop: buildNextTabletopRecommendation(exercise, categories),
  };
}

function scoreCategory(
  id: ScoreCategoryId,
  label: string,
  deck: BoardCard[],
  decisions: DecisionPathEntry[],
  focus: string,
): GameScoreCategory {
  const relevantCards = deck.filter((card) => card.kind !== "brief" && card.scoreCategory === id);
  const relevantDecisions = decisions.filter((decision) => decision.scoreCategory === id);
  const typedDecisions = relevantDecisions.filter((decision) => !decision.skipped);
  const coverage = relevantCards.length === 0 ? 0.65 : relevantDecisions.length / relevantCards.length;
  const typedRatio = relevantDecisions.length === 0 ? 0 : typedDecisions.length / relevantDecisions.length;
  const score = boundedScore(Math.round(coverage * 70 + typedRatio * 25 + (relevantDecisions.length > 0 ? 5 : 0)));

  return {
    id,
    label,
    score,
    summary: `${score >= 75 ? "Strong" : score >= 50 ? "Partial" : "Thin"} coverage of ${focus}; ${typedDecisions.length} written answer${typedDecisions.length === 1 ? "" : "s"} captured.`,
  };
}

function scoreIrpCategory(exercise: GeneratedExercise, deck: BoardCard[], decisions: DecisionPathEntry[]): GameScoreCategory {
  const base = scoreCategory("irp", "IRP / Plan Fit", deck, decisions, "plan references, missing owners, and improvement items");
  if (exercise.starterIrpTemplate) {
    return {
      ...base,
      score: Math.min(base.score, 68),
      summary: `${base.summary} No IRP was uploaded, so this should feed a starter IRP draft.`,
    };
  }

  if (!exercise.irpAnalysis) {
    return {
      ...base,
      score: Math.min(base.score, 72),
      summary: `${base.summary} No IRP analysis was available, so plan fit could not be fully validated.`,
    };
  }

  const weakFindings = exercise.irpAnalysis.findings.filter((finding) => finding.status !== "found").length;
  return {
    ...base,
    score: boundedScore(base.score + (weakFindings === 0 ? 10 : 0)),
    summary: `${base.summary} Uploaded IRP scan found ${weakFindings} weak or missing area${weakFindings === 1 ? "" : "s"}.`,
  };
}

function buildScoreStrengths(categories: GameScoreCategory[], decisions: DecisionPathEntry[], injects: RevealedGameInject[]) {
  const strengths = categories
    .filter((category) => category.score >= 75)
    .map((category) => `${category.label} scored ${category.score}/100.`);

  if (decisions.some((decision) => !decision.skipped)) {
    strengths.push(`${decisions.filter((decision) => !decision.skipped).length} written answer${decisions.filter((decision) => !decision.skipped).length === 1 ? "" : "s"} captured.`);
  }

  if (injects.length > 0) {
    strengths.push(`${injects.length} scenario consequence${injects.length === 1 ? "" : "s"} handled.`);
  }

  return strengths.length > 0 ? strengths.slice(0, 5) : ["The team completed a baseline tabletop loop and produced material for improvement."];
}

function buildScoreGaps(categories: GameScoreCategory[], deck: BoardCard[], decisions: DecisionPathEntry[]) {
  const gaps = categories
    .filter((category) => category.score < 70)
    .map((category) => `${category.label}: ${category.summary}`);
  const unresolved = deck.filter((card) => card.kind !== "brief" && !decisions.some((decision) => decision.cardId === card.id));

  if (unresolved.length > 0) {
    gaps.push(`${unresolved.length} card${unresolved.length === 1 ? "" : "s"} were not resolved.`);
  }

  if (decisions.some((decision) => decision.skipped)) {
    gaps.push(`${decisions.filter((decision) => decision.skipped).length} answer${decisions.filter((decision) => decision.skipped).length === 1 ? "" : "s"} were discussed aloud without a written decision.`);
  }

  return gaps.length > 0 ? gaps.slice(0, 6) : ["No major gaps were flagged by this game run."];
}

function buildScoreActionItems(categories: GameScoreCategory[], exercise: GeneratedExercise) {
  const items = categories
    .filter((category) => category.score < 75)
    .sort((first, second) => first.score - second.score)
    .slice(0, 4)
    .map((category) => `Assign an owner to tighten ${category.label.toLowerCase()} and retest it in the next tabletop.`);

  if (exercise.starterIrpTemplate) {
    items.unshift("Use the captured answers to fill the starter IRP roles, escalation, evidence, communications, and recovery sections.");
  }

  if (exercise.irpAnalysis?.findings.some((finding) => finding.status !== "found")) {
    items.push("Update the IRP sections flagged as weak or missing, then rerun this scenario.");
  }

  return Array.from(new Set(items)).slice(0, 5);
}

function buildNextTabletopRecommendation(exercise: GeneratedExercise, categories: GameScoreCategory[]) {
  const weakest = [...categories].sort((first, second) => first.score - second.score)[0];
  if (exercise.starterIrpTemplate) {
    return "Complete the starter IRP from this run, then repeat the same scenario to validate the plan.";
  }

  return `Run a focused ${exercise.overview.scenario.toLowerCase()} mini-drill on ${weakest.label.toLowerCase()}.`;
}

function buildGameScorecardMarkdown(
  exercise: GeneratedExercise,
  scorecard: GameScorecard,
  decisions: DecisionPathEntry[],
  injects: RevealedGameInject[],
  notes: string,
) {
  return [
    `# ${exercise.overview.organization} Tabletop Game Scorecard`,
    "",
    `Completed: ${scorecard.completedAt}`,
    `Overall: ${scorecard.overallScore}/100 (${scorecard.readinessTier})`,
    "",
    "## Category Scores",
    ...scorecard.categories.map((category) => `- ${category.label}: ${category.score}/100 - ${category.summary}`),
    "",
    "## Captured Answers",
    ...(decisions.length ? decisions.map((decision) => `- ${decision.stage} / ${decision.cardTitle}: ${decision.response}`) : ["- None captured."]),
    "",
    "## Scenario Consequences",
    ...(injects.length ? injects.map((inject) => `- ${inject.title}: ${inject.text}`) : ["- None revealed."]),
    "",
    "## Strengths",
    ...scorecard.strengths.map((item) => `- ${item}`),
    "",
    "## Gaps",
    ...scorecard.gaps.map((item) => `- ${item}`),
    "",
    "## Action Items",
    ...scorecard.actionItems.map((item) => `- ${item}`),
    "",
    "## Recommended Next Tabletop",
    scorecard.nextTabletop,
    "",
    "## Notes",
    notes.trim() || "No notes captured.",
    "",
  ].join("\n");
}

function buildGameScorecardHtml(
  exercise: GeneratedExercise,
  scorecard: GameScorecard,
  decisions: DecisionPathEntry[],
  injects: RevealedGameInject[],
  notes: string,
) {
  const escape = (value: string | number) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const list = (items: string[]) => (items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>` : "<p>None captured.</p>");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escape(exercise.overview.organization)} Tabletop Game Scorecard</title>
  <style>
    body { margin: 0; padding: 32px; background: #f5f7fb; color: #17202a; font-family: Arial, Helvetica, sans-serif; }
    main { max-width: 980px; margin: 0 auto; background: white; border: 1px solid #d8e0ea; border-radius: 8px; padding: 34px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin: 28px 0 10px; padding-bottom: 7px; border-bottom: 1px solid #d8e0ea; font-size: 19px; }
    p, li, td, th { font-size: 14px; line-height: 1.65; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #d8e0ea; padding: 9px; text-align: left; vertical-align: top; }
    th { background: #eef4fb; }
    .score { display: inline-block; border-radius: 6px; background: #e8f2ff; padding: 8px 12px; font-weight: 700; color: #123c69; }
  </style>
</head>
<body>
  <main>
    <h1>${escape(exercise.overview.organization)} Tabletop Game Scorecard</h1>
    <p><span class="score">${scorecard.readinessTier} - ${scorecard.overallScore}/100</span></p>
    <p>${escape(exercise.overview.scenario)} | ${escape(exercise.overview.industry)} | ${escape(exercise.overview.maturityLevel)}</p>
    <h2>Category Scores</h2>
    <table><thead><tr><th>Category</th><th>Score</th><th>Summary</th></tr></thead><tbody>
      ${scorecard.categories.map((category) => `<tr><td>${escape(category.label)}</td><td>${category.score}/100</td><td>${escape(category.summary)}</td></tr>`).join("")}
    </tbody></table>
    <h2>Captured Answers</h2>
    ${list(decisions.map((decision) => `${decision.stage} / ${decision.cardTitle}: ${decision.response}`))}
    <h2>Scenario Consequences</h2>
    ${list(injects.map((inject) => `${inject.title}: ${inject.text}`))}
    <h2>Strengths</h2>
    ${list(scorecard.strengths)}
    <h2>Gaps</h2>
    ${list(scorecard.gaps)}
    <h2>Action Items</h2>
    ${list(scorecard.actionItems)}
    <h2>Recommended Next Tabletop</h2>
    <p>${escape(scorecard.nextTabletop)}</p>
    <h2>Notes</h2>
    <p>${escape(notes.trim() || "No notes captured.")}</p>
  </main>
</body>
</html>`;
}

function buildAiExercisePayload(exercise: GeneratedExercise) {
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

function buildKnownFacts(exercise: GeneratedExercise, inject?: RevealedGameInject) {
  return [
    exercise.scenarioSummary,
    ...(inject ? [inject.text] : []),
    ...exercise.objectives.slice(0, 4),
  ].map((item) => compactSentence(item, 300));
}

function buildUnknowns(exercise: GeneratedExercise, card: BoardCard) {
  return [
    card.goal,
    ...exercise.gapDiscoveryQuestions.slice(0, 5),
    ...(exercise.irpAnalysis?.findings.filter((finding) => finding.status !== "found").map((finding) => finding.summary) ?? []),
  ].map((item) => compactSentence(item, 220));
}

function formatAssistantAnswer(answer: TabletopAiAssistResponse) {
  return [
    answer.answer,
    answer.irpFinding ? `IRP: ${answer.irpFinding}` : "",
    answer.recommendedNextStep ? `Next: ${answer.recommendedNextStep}` : "",
    answer.missingInfo?.length ? `Missing: ${answer.missingInfo.join("; ")}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildLocalAssistanceAnswer(question: string, exercise: GeneratedExercise, activeCard: BoardCard, activeInject?: RevealedGameInject) {
  const lowerQuestion = question.toLowerCase();

  if (lowerQuestion.includes("irp") || lowerQuestion.includes("plan")) {
    if (exercise.irpAnalysis?.findings.length) {
      const weak = exercise.irpAnalysis.findings.find((finding) => finding.status !== "found");
      return weak
        ? `Use the IRP as the source of truth, but treat "${weak.label}" as a gap. For this card, capture who owns the decision now and what plan section needs updating.`
        : "The uploaded IRP appears to cover the major areas found by the scan. Ask the team to cite the exact plan section that supports the answer.";
    }

    return "No IRP analysis is available. Use this as a planning exercise: name the owner, backup owner, approval path, evidence to preserve, and what must be added to the plan.";
  }

  if (lowerQuestion.includes("vendor") || lowerQuestion.includes("outside")) {
    if (exercise.overview.industry === "MSP / IT Provider") {
      return "For an MSP, start with the affected client owner and internal escalation lead, then the upstream software, cloud, RMM, PSA, insurer, or legal contact tied to the affected service. Do not frame this as calling a partner MSP.";
    }

    return "Contact the outside party tied to the affected system first, but only after confirming who has authority to call them and what information can be shared.";
  }

  if (lowerQuestion.includes("non-technical") || exercise.overview.maturityLevel === "Basic") {
    return `Plain-language version: decide who owns the next step, what facts are confirmed, what is still unknown, and what must be written down. Current card goal: ${activeCard.goal}`;
  }

  return activeInject
    ? `Use the latest inject as the pressure point. Decide whether it changes scope, authority, evidence, communications, or recovery priority. Current goal: ${activeCard.goal}`
    : `Focus the discussion on one outcome: ${activeCard.goal}`;
}

function pickStage(index: number) {
  const stages = ["Triage", "Scope", "Containment", "Communications", "Recovery", "Lessons"];
  return stages[index % stages.length];
}

function pickQuestionCategory(value: string): ScoreCategoryId {
  const normalized = value.toLowerCase();
  if (/\b(log|evidence|forensic|preserv|audit|screenshot|mailbox|memory)\b/.test(normalized)) {
    return "evidence";
  }
  if (/\b(communicat|notify|customer|public|staff|leader|executive|regulator|legal|message)\b/.test(normalized)) {
    return "communications";
  }
  if (/\b(recover|backup|restore|continuity|downtime|operation|impact|patient|production)\b/.test(normalized)) {
    return "continuity";
  }
  if (/\b(irp|plan|policy|procedure|gap|document)\b/.test(normalized)) {
    return "irp";
  }

  return "ownership";
}

function buildExpectedDecisionFromInject(inject: BoardCard) {
  if (inject.scoreCategory === "evidence") {
    return "Decide what evidence must be preserved before the next action.";
  }
  if (inject.scoreCategory === "communications") {
    return "Decide who approves the next update and what can be said.";
  }
  if (inject.scoreCategory === "continuity") {
    return "Decide which business process matters most and who accepts downtime.";
  }
  if (inject.scoreCategory === "irp") {
    return "Decide what IRP update or action item is needed.";
  }

  return "Decide who owns the next action and who approves it.";
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

function buildReadinessTier(score: number): GameScorecard["readinessTier"] {
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

function boundedScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function compactSentence(value: string, maxLength: number) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim().replace(/[,.!?;:]+$/, "")}.`;
}
