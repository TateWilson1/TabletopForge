"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import {
  Award,
  BookOpen,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clipboard,
  Crosshair,
  Dices,
  Download,
  Flag,
  Gamepad2,
  Keyboard,
  Lightbulb,
  ListTodo,
  Loader2,
  Lock,
  Map as MapIcon,
  Maximize2,
  MessageSquare,
  NotebookPen,
  RefreshCw,
  Scale,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CameraMode, DeckDraw, PawnMove } from "@/components/TabletopBoardScene";
import {
  DICE_ROLL_MS,
  HOP_MS,
  LAND_SETTLE_MS,
  LAP_BONUS_POINTS,
  buildBoardGraph,
  buildCyberBoardSpaces,
  pawnOptions,
  spaceEffects,
  toneMeta,
  type DiceRoll,
  type PawnKey,
  type PawnOption,
} from "@/components/tabletop-board-config";
import {
  isAccountApiConfigured,
  requestTabletopAiAssistance,
  requestTabletopAiInject,
  type TabletopAiAssistResponse,
} from "@/lib/account";
import { gameSounds, isSoundMuted, setSoundMuted } from "@/lib/game-audio";
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

interface PointPop {
  id: number;
  amount: number;
  label: string;
}

const POINTS = {
  written: 100,
  aloud: 40,
  twist: 75,
} as const;

const cardKindMeta: Record<CardKind, { label: string; color: string; icon: LucideIcon }> = {
  brief: { label: "Briefing", color: "#14b88a", icon: BookOpen },
  question: { label: "Discussion", color: "#3b82f6", icon: MessageSquare },
  decision: { label: "Decision", color: "#8b5cf6", icon: Scale },
  gap: { label: "IRP Check", color: "#f59e0b", icon: ClipboardCheck },
  inject: { label: "Twist", color: "#f97316", icon: Zap },
};

const LazyTabletopBoardScene = dynamic(
  () => import("@/components/TabletopBoardScene").then((module) => module.TabletopBoardScene),
  {
    ssr: false,
    loading: () => <TableScenePlaceholder label="Setting up the table..." />,
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
  const nodes = useMemo(() => buildBoardGraph(boardSpaces), [boardSpaces]);
  const [selectedPawn, setSelectedPawn] = useState<PawnKey>("sentinel");
  const [hasStarted, setHasStarted] = useState(false);
  const [nodeId, setNodeId] = useState(0);
  const [move, setMove] = useState<PawnMove | null>(null);
  const [junction, setJunction] = useState<{ options: number[]; remaining: number; passedStart: boolean; d20: number } | null>(null);
  const [deckIndex, setDeckIndex] = useState(0);
  const [activeCard, setActiveCard] = useState<BoardCard>(() => deck[0]);
  const [resolvedCards, setResolvedCards] = useState<Record<string, boolean>>({});
  const [rollResult, setRollResult] = useState(0);
  const [dice, setDice] = useState<DiceRoll | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isGeneratingInject, setIsGeneratingInject] = useState(false);
  const [notes, setNotes] = useState("");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
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
  const [showVictory, setShowVictory] = useState(false);
  const [points, setPoints] = useState(0);
  const [laps, setLaps] = useState(0);
  const [pointPops, setPointPops] = useState<PointPop[]>([]);
  const [landedIndex, setLandedIndex] = useState<number | null>(null);
  const [revealCard, setRevealCard] = useState<BoardCard | null>(null);
  const [deckDraw, setDeckDraw] = useState<DeckDraw | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>("follow");
  const [muted, setMuted] = useState(false);
  const timersRef = useRef<number[]>([]);
  const nonceRef = useRef(0);
  const mountedRef = useRef(true);
  const answerRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedPawnOption = pawnOptions.find((pawn) => pawn.key === selectedPawn) ?? pawnOptions[0];
  const injectThreshold = getInjectThreshold(exercise.overview.maturityLevel);
  const currentCardNumber = Math.min(deckIndex + 1, deck.length);
  const resolvedCount = deck.filter((card) => card.kind === "brief" || resolvedCards[card.id]).length;
  const activeInject = revealedInjects.at(-1);
  const isCurrentCardResolved = activeCard.kind === "brief" || resolvedCards[activeCard.id] === true;
  const isFinalCard = deckIndex >= deck.length - 1;
  const canUseAi = isAccountApiConfigured();
  const isBusy = isRolling || isMoving || isGeneratingInject || junction !== null;
  const canRoll = !isBusy && !isInjectOverlayOpen && !revealCard && !scorecard && isCurrentCardResolved;
  const landedSpace = landedIndex !== null ? nodes[landedIndex] : null;

  useEffect(() => {
    mountedRef.current = true;
    setMuted(isSoundMuted());
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((item) => item !== id);
      if (mountedRef.current) {
        callback();
      }
    }, delay);
    timersRef.current.push(id);
  }, []);

  const awardPoints = useCallback(
    (amount: number, label: string, withSound = true) => {
      nonceRef.current += 1;
      const id = nonceRef.current;
      setPoints((current) => Math.max(0, current + amount));
      setPointPops((current) => [...current, { id, amount, label }]);
      if (withSound) {
        if (amount < 0) {
          gameSounds.lose();
        } else {
          gameSounds.points();
        }
      }
      schedule(() => setPointPops((current) => current.filter((pop) => pop.id !== id)), 1900);
    },
    [schedule],
  );

  // Latest values for timer callbacks that resolve after the pawn finishes moving.
  const latestRef = useRef({ activeCard, decisionPath, revealedInjects, notes, deckIndex, hasStarted });
  useEffect(() => {
    latestRef.current = { activeCard, decisionPath, revealedInjects, notes, deckIndex, hasStarted };
  });

  const resolveLanding = useCallback(
    (landedId: number, passedStart: boolean, d20: number) => {
      void (async () => {
        const latest = latestRef.current;
        setIsMoving(false);
        setLandedIndex(landedId);
        if (passedStart) {
          setLaps((current) => current + 1);
          awardPoints(LAP_BONUS_POINTS, "Lap bonus", false);
          gameSounds.lap();
        }
        const node = nodes[landedId];
        const effect = spaceEffects[node.tone];
        if (effect.points !== 0) {
          awardPoints(effect.points, effect.label, !passedStart);
        }

        const landedOnTwist = node.tone === "inject";
        const shouldInject = latest.hasStarted && injectDeck.length > 0 && (d20 >= injectThreshold || landedOnTwist);
        const nextDeckIndex = latest.deckIndex + 1;
        const nextCard = deck[nextDeckIndex];

        if (shouldInject) {
          setIsGeneratingInject(true);
          setActionNotice(landedOnTwist ? "Twist space! Drawing a scenario consequence..." : `Pressure roll of ${d20}! Drawing a scenario consequence...`);
          const inject = await resolveInjectCard({
            exercise,
            fallbackInject: injectDeck[(latest.revealedInjects.length + d20) % injectDeck.length],
            decisionPath: latest.decisionPath,
            revealedInjects: latest.revealedInjects,
            notes: latest.notes,
            roll: d20,
            activeCard: latest.activeCard,
            canUseAi,
          });
          if (!mountedRef.current) {
            return;
          }
          nonceRef.current += 1;
          setDeckDraw({ nonce: nonceRef.current, deck: "inject" });
          setRevealedInjects((current) => [...current, inject]);
          setOverlayInject(inject);
          setPendingCard(nextCard);
          setDeckIndex(nextDeckIndex);
          setIsInjectOverlayOpen(true);
          setIsGeneratingInject(false);
          setActionNotice("");
          gameSounds.twist();
        } else {
          nonceRef.current += 1;
          setDeckDraw({ nonce: nonceRef.current, deck: "prompt" });
          setDeckIndex(nextDeckIndex);
          setActiveCard(nextCard);
          setTeamResponse("");
          setLearningMoment("");
          setRevealCard(nextCard);
          gameSounds.card();
        }
        setHasStarted(true);
      })();
    },
    [awardPoints, canUseAi, deck, exercise, injectDeck, injectThreshold, nodes],
  );

  /** Walks the pawn along the board, pausing at forks so the team can choose a route. */
  const advance = useCallback(
    (from: number, steps: number, passedStart: boolean, d20: number, forcedFirst?: number) => {
      const path: number[] = [];
      let cursor = from;
      let remaining = steps;
      if (forcedFirst !== undefined && remaining > 0) {
        cursor = forcedFirst;
        path.push(cursor);
        remaining -= 1;
      }
      while (remaining > 0 && nodes[cursor].next.length === 1) {
        cursor = nodes[cursor].next[0];
        path.push(cursor);
        remaining -= 1;
      }
      const passed = passedStart || path.includes(0);

      if (path.length > 0) {
        nonceRef.current += 1;
        setMove({ nonce: nonceRef.current, path, stepsAfter: remaining });
        setIsMoving(true);
      }

      schedule(
        () => {
          setNodeId(cursor);
          if (remaining > 0) {
            setIsMoving(false);
            setJunction({ options: nodes[cursor].next, remaining, passedStart: passed, d20 });
            gameSounds.click();
          } else {
            resolveLanding(cursor, passed, d20);
          }
        },
        path.length * HOP_MS + (remaining > 0 ? 80 : LAND_SETTLE_MS),
      );
    },
    [nodes, resolveLanding, schedule],
  );

  const roll = useCallback(() => {
    if (isBusy || isInjectOverlayOpen || revealCard || deck.length === 0 || scorecard) {
      return;
    }

    if (!isCurrentCardResolved) {
      setActionNotice("Capture the team answer or mark this card discussed before rolling again.");
      gameSounds.click();
      answerRef.current?.focus();
      return;
    }

    if (isFinalCard) {
      const nextScorecard = buildGameScorecard(exercise, deck, decisionPath, revealedInjects, notes);
      setScorecard(nextScorecard);
      setShowVictory(true);
      setActionNotice("Exercise complete. Scorecard is ready.");
      gameSounds.victory();
      return;
    }

    const d20 = Math.floor(Math.random() * 20) + 1;
    const d6 = Math.floor(Math.random() * 6) + 1;

    nonceRef.current += 1;
    setDice({ nonce: nonceRef.current, d20, d6 });
    setIsRolling(true);
    setRollResult(d20);
    setLandedIndex(null);
    setActionNotice("");
    gameSounds.shake();

    schedule(() => {
      setIsRolling(false);
      advance(nodeId, d6, false, d20);
    }, DICE_ROLL_MS);
  }, [
    advance,
    deck,
    decisionPath,
    exercise,
    isBusy,
    isCurrentCardResolved,
    isFinalCard,
    isInjectOverlayOpen,
    nodeId,
    notes,
    revealCard,
    revealedInjects,
    schedule,
    scorecard,
  ]);

  function pickJunction(choice: number) {
    if (!junction || !junction.options.includes(choice)) {
      return;
    }
    const pending = junction;
    setJunction(null);
    gameSounds.click();
    advance(nodeId, pending.remaining, pending.passedStart, pending.d20, choice);
  }

  const dismissReveal = useCallback(() => {
    if (!revealCard) {
      return;
    }
    const kind = revealCard.kind;
    setRevealCard(null);
    gameSounds.click();
    if (kind !== "brief") {
      window.setTimeout(() => answerRef.current?.focus({ preventScroll: true }), 60);
    }
  }, [revealCard]);

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
    awardPoints(POINTS.twist, "Twist handled");
  }

  const rollRef = useRef(roll);
  const dismissRef = useRef(dismissReveal);
  useEffect(() => {
    rollRef.current = roll;
    dismissRef.current = dismissReveal;
  }, [roll, dismissReveal]);

  useEffect(() => {
    if (!hasEnteredTable) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
        return;
      }
      if ((event.key === "Enter" || event.key === "Escape") && target?.tagName !== "BUTTON") {
        dismissRef.current();
        return;
      }
      if ((event.key === " " && target?.tagName !== "BUTTON") || event.key.toLowerCase() === "r") {
        event.preventDefault();
        rollRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasEnteredTable]);

  function resetBoard() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setHasStarted(false);
    setNodeId(0);
    setMove(null);
    setJunction(null);
    setDeckIndex(0);
    setActiveCard(deck[0]);
    setResolvedCards({});
    setRollResult(0);
    setDice(null);
    setIsRolling(false);
    setIsMoving(false);
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
    setShowVictory(false);
    setPoints(0);
    setLaps(0);
    setPointPops([]);
    setLandedIndex(null);
    setRevealCard(null);
    setResetNonce((current) => current + 1);
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
    awardPoints(skipped ? POINTS.aloud : POINTS.written, skipped ? "Discussed aloud" : "Answer captured");
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

    await navigator.clipboard.writeText(buildGameScorecardMarkdown(exercise, scorecard, decisionPath, revealedInjects, notes, points));
    setActionNotice("Scorecard copied.");
  }

  function downloadScorecard() {
    if (!scorecard) {
      return;
    }

    downloadTextFile(
      buildGameScorecardHtml(exercise, scorecard, decisionPath, revealedInjects, notes, points),
      `${safeFilename(exercise.overview.organization)}-tabletop-game-scorecard.html`,
      "text/html;charset=utf-8",
    );
    setActionNotice("Readable scorecard downloaded.");
  }

  function toggleSound() {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) {
      gameSounds.click();
    }
  }

  const rollLabel = isGeneratingInject
    ? "Drawing..."
    : isRolling
      ? "Rolling..."
      : isMoving
        ? "Moving..."
        : scorecard
          ? "Complete"
          : isFinalCard && isCurrentCardResolved
            ? "Finish Game"
            : hasStarted
              ? "Roll"
              : "Roll To Begin";

  const statusLine = scorecard
    ? "Game complete. Review the scorecard in the side panel."
    : actionNotice
      ? actionNotice
      : junction
        ? "Choose a route at the fork."
        : isBusy
          ? "Watch the board..."
        : !isCurrentCardResolved
          ? "Answer the card to unlock your next roll."
          : `Pressure ${injectThreshold}+ on the d20 triggers a twist.`;

  return (
    <section className="table-mode-shell overflow-hidden rounded-2xl border border-white/10 bg-[#070b10]">
      {isInjectOverlayOpen && overlayInject ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="twist-title">
          <div className="twist-card relative w-full max-w-2xl overflow-hidden rounded-3xl p-[2px]">
            <div className="relative rounded-[calc(1.5rem-2px)] bg-[#140a05] p-6 text-center sm:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.35),transparent_60%)]" />
              <div className="relative">
                <div className="mx-auto mb-5 flex w-fit items-center gap-3">
                  <span className="d20-chip">{overlayInject.roll}</span>
                  <span className="rounded-full border border-orange-400/40 bg-orange-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">
                    Twist card
                  </span>
                </div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-300/80">Oh no...</p>
                <h2 id="twist-title" className="mt-2 text-3xl font-black text-white sm:text-5xl">
                  {overlayInject.title}
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-orange-50/90">{overlayInject.text}</p>
                <div className="mx-auto mt-6 grid max-w-xl gap-3 text-left md:grid-cols-2">
                  <div className="rounded-2xl border border-orange-300/20 bg-black/30 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">Ask next</p>
                    <p className="mt-2 text-sm leading-6 text-orange-50/80">{overlayInject.followUpQuestion}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-300/20 bg-black/30 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">Decision pressure</p>
                    <p className="mt-2 text-sm leading-6 text-orange-50/80">{overlayInject.expectedDecision}</p>
                  </div>
                </div>
                <Button size="lg" className="mt-8 rounded-full bg-orange-500 px-8 text-white hover:bg-orange-400" onClick={closeInjectOverlay} autoFocus>
                  Handle it · +{POINTS.twist} pts
                </Button>
                <p className="mt-3 text-xs text-orange-100/50">Next up: card {Math.min(deckIndex + 1, deck.length)} of {deck.length}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid xl:h-[calc(100vh-9.5rem)] xl:min-h-[44rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
        <div className="relative h-[34rem] overflow-hidden sm:h-[40rem] xl:h-auto">
          {hasEnteredTable ? (
            <LazyTabletopBoardScene
              pawn={selectedPawn}
              nodes={nodes}
              move={move}
              dice={dice}
              diceReady={canRoll || (isFinalCard && isCurrentCardResolved && !scorecard && !isBusy)}
              junction={junction?.options ?? null}
              deckDraw={deckDraw}
              resetNonce={resetNonce}
              cameraMode={cameraMode}
              sceneTitle={exercise.overview.scenario}
              sceneSubtitle={`${exercise.overview.industry} | ${exercise.overview.organizationSize} | ${exercise.overview.maturityLevel}`}
              onDiceClick={roll}
              onJunctionPick={pickJunction}
              onHop={gameSounds.hop}
              onLand={gameSounds.land}
            />
          ) : (
            <TableScenePlaceholder label="Ready when you are." />
          )}

          {!hasEnteredTable ? (
            <CharacterSelect
              selectedPawn={selectedPawn}
              onSelect={(key) => {
                setSelectedPawn(key);
                gameSounds.click();
              }}
              onEnter={() => {
                setHasEnteredTable(true);
                gameSounds.lap();
              }}
              onClassicMode={onClassicMode}
              scenario={exercise.overview.scenario}
              cardCount={deck.length}
            />
          ) : (
            <>
              {/* Top HUD */}
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
                <PlayerHud
                  pawn={selectedPawnOption}
                  points={points}
                  laps={laps}
                  deckLength={deck.length}
                  deckIndex={deckIndex}
                  resolvedCount={resolvedCount}
                  pops={pointPops}
                />
                <div className="pointer-events-auto flex flex-col items-end gap-2">
                  <div className="hud-glass flex items-center gap-1 rounded-full p-1">
                    {(
                      [
                        { mode: "follow", label: "Follow pawn", icon: Crosshair },
                        { mode: "overview", label: "Overview", icon: Maximize2 },
                        { mode: "top", label: "Top-down map", icon: MapIcon },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => setCameraMode(item.mode)}
                        className={`hud-icon-button ${cameraMode === item.mode ? "hud-icon-button-active" : ""}`}
                        aria-pressed={cameraMode === item.mode}
                        aria-label={item.label}
                        title={item.label}
                      >
                        <item.icon className="size-4" suppressHydrationWarning />
                      </button>
                    ))}
                    <span className="mx-0.5 h-5 w-px bg-white/10" />
                    <button type="button" onClick={toggleSound} className="hud-icon-button" aria-label={muted ? "Unmute sound" : "Mute sound"} title={muted ? "Unmute" : "Mute"}>
                      {muted ? <VolumeX className="size-4" suppressHydrationWarning /> : <Volume2 className="size-4" suppressHydrationWarning />}
                    </button>
                    <button type="button" onClick={resetBoard} className="hud-icon-button" aria-label="Restart game" title="Restart game">
                      <RefreshCw className="size-4" suppressHydrationWarning />
                    </button>
                    <button type="button" onClick={onClassicMode} className="hud-icon-button" aria-label="Switch to classic mode" title="Classic mode">
                      <ListTodo className="size-4" suppressHydrationWarning />
                    </button>
                  </div>
                  <PawnSwitcher selectedPawn={selectedPawn} onSelect={setSelectedPawn} />
                </div>
              </div>

              {/* Landing toast */}
              {landedSpace && !isBusy && !revealCard ? (
                <div className="pointer-events-none absolute left-1/2 top-[5.5rem] z-10 w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 sm:top-4">
                  <div
                    key={`${landedIndex}-${dice?.nonce ?? 0}`}
                    className="landing-toast hud-glass rounded-2xl px-4 py-3"
                    style={{ "--tone": toneMeta[landedSpace.tone].color } as CSSProperties}
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: toneMeta[landedSpace.tone].color }} />
                      <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: toneMeta[landedSpace.tone].color }}>
                        Landed · {toneMeta[landedSpace.tone].label}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center justify-between gap-2 text-sm font-semibold text-white">
                      <span>{landedSpace.label}</span>
                      {spaceEffects[landedSpace.tone].points !== 0 ? (
                        <span className={spaceEffects[landedSpace.tone].points > 0 ? "text-emerald-300" : "text-rose-300"}>
                          {spaceEffects[landedSpace.tone].points > 0 ? "+" : ""}
                          {spaceEffects[landedSpace.tone].points} pts
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-white/65">{toneMeta[landedSpace.tone].hint}</p>
                  </div>
                </div>
              ) : null}

              {junction ? (
                <div className="pointer-events-none absolute inset-x-3 bottom-28 z-20 flex justify-center">
                  <div className="junction-panel pointer-events-auto w-full max-w-lg rounded-3xl p-4 text-center">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6b4fd6]">Fork in the road</p>
                    <p className="mt-1 text-sm font-semibold text-[#1c1633]">
                      {junction.remaining} {junction.remaining === 1 ? "step" : "steps"} left. Which way does the team go?
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {junction.options.map((option) => {
                        const isShortcut = nodes[option].route === "shortcut";
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => pickJunction(option)}
                            className={`junction-choice ${isShortcut ? "junction-choice-risky" : "junction-choice-safe"}`}
                          >
                            <span className="text-base font-black">{isShortcut ? "Risky shortcut" : "Main road"}</span>
                            <span className="text-xs font-medium opacity-80">
                              {isShortcut ? "Faster, but plan gaps and twists" : "Longer, with bonus spaces"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Bottom dice dock */}
              <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center sm:bottom-5">
                <div className="hud-glass pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-3xl p-2.5 sm:gap-4 sm:p-3">
                  <div className="flex shrink-0 items-center gap-2 pl-1">
                    <DiceFace kind="d20" value={dice?.d20 ?? 0} rolling={isRolling} hot={Boolean(dice && dice.d20 >= injectThreshold)} />
                    <DiceFace kind="d6" value={dice?.d6 ?? 0} rolling={isRolling} />
                  </div>
                  <p className="hidden min-w-0 flex-1 text-xs leading-5 text-white/70 sm:block" aria-live="polite">
                    {statusLine}
                  </p>
                  <button
                    type="button"
                    onClick={roll}
                    disabled={isBusy || isInjectOverlayOpen || Boolean(revealCard) || Boolean(scorecard)}
                    className={`roll-button ml-auto ${canRoll || (isFinalCard && isCurrentCardResolved && !scorecard && !isBusy) ? "roll-button-ready" : ""}`}
                  >
                    {isBusy ? <Loader2 className="size-5 animate-spin" suppressHydrationWarning /> : isFinalCard && isCurrentCardResolved && !scorecard ? <Flag className="size-5" suppressHydrationWarning /> : !isCurrentCardResolved && !scorecard ? <Lock className="size-5" suppressHydrationWarning /> : <Dices className="size-5" suppressHydrationWarning />}
                    <span>{rollLabel}</span>
                    {canRoll ? <kbd className="hidden rounded border border-black/20 bg-black/10 px-1.5 text-[10px] font-semibold md:inline">Space</kbd> : null}
                  </button>
                </div>
              </div>
              <p className="sr-only sm:hidden" aria-live="polite">{statusLine}</p>

              {revealCard ? <CardReveal card={revealCard} cardNumber={currentCardNumber} deckLength={deck.length} onPlay={dismissReveal} /> : null}

              {showVictory && scorecard ? (
                <VictoryOverlay
                  scorecard={scorecard}
                  points={points}
                  laps={laps}
                  injects={revealedInjects.length}
                  onClose={() => setShowVictory(false)}
                  onDownload={downloadScorecard}
                  onRestart={resetBoard}
                />
              ) : null}
            </>
          )}
        </div>

        <aside className="flex min-h-[32rem] flex-col border-t border-white/10 bg-[#0b1117] xl:min-h-0 xl:border-l xl:border-t-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <GameCardPanel
              card={activeCard}
              cardNumber={currentCardNumber}
              deckLength={deck.length}
              isResolved={isCurrentCardResolved}
              landedLabel={landedSpace ? `${landedSpace.label} · ${toneMeta[landedSpace.tone].label}` : null}
            />

            {scorecard ? <ScorecardPanel scorecard={scorecard} points={points} onCopy={copyScorecard} onDownload={downloadScorecard} onCelebrate={() => setShowVictory(true)} /> : null}

            {!scorecard && activeCard.kind !== "brief" ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MessageSquare className="size-4 text-primary" suppressHydrationWarning />
                    Team answer
                  </div>
                  {!isCurrentCardResolved ? (
                    <span className="text-[11px] font-semibold text-primary/80">+{POINTS.written} pts</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                      <CheckCircle2 className="size-3.5" suppressHydrationWarning /> Captured
                    </span>
                  )}
                </div>
                <Textarea
                  ref={answerRef}
                  value={teamResponse}
                  onChange={(event) => setTeamResponse(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && teamResponse.trim()) {
                      event.preventDefault();
                      captureResponse(false);
                    }
                  }}
                  placeholder={
                    isCurrentCardResolved
                      ? "Answer captured. Roll when the team is ready."
                      : "Capture one sentence. Example: We isolate the account, preserve mailbox logs, and notify the incident owner."
                  }
                  className="min-h-[96px] rounded-xl border-white/10 bg-black/30"
                  disabled={isCurrentCardResolved}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button className="rounded-xl" onClick={() => captureResponse(false)} disabled={isCurrentCardResolved || !teamResponse.trim()}>
                    Capture Answer
                  </Button>
                  <Button variant="outline" className="rounded-xl border-white/15" onClick={() => captureResponse(true)} disabled={isCurrentCardResolved}>
                    Discussed Aloud · +{POINTS.aloud}
                  </Button>
                </div>
                {!isCurrentCardResolved ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Keyboard className="size-3.5" suppressHydrationWarning /> Ctrl + Enter to capture
                  </p>
                ) : null}
                {learningMoment ? (
                  <div className="learning-beat rounded-xl border border-primary/25 bg-primary/10 p-3">
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
              <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-orange-300">
                    <Zap className="size-4" suppressHydrationWarning /> Latest twist
                  </p>
                  <Badge variant="outline" className="border-orange-400/40 text-orange-200">D20 · {activeInject.roll}</Badge>
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

            <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 p-4 text-sm font-semibold text-foreground"
                onClick={() => setIsNotesOpen((current) => !current)}
                aria-expanded={isNotesOpen}
              >
                <span className="flex items-center gap-2">
                  <NotebookPen className="size-4 text-primary" suppressHydrationWarning />
                  Session notes
                  {notes.trim() ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">{notes.trim().split("\n").length}</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{isNotesOpen ? "Hide" : "Open"}</span>
              </button>
              {isNotesOpen ? (
                <div className="px-4 pb-4">
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Running notes stay visible here: decisions, unclear answers, and improvements."
                    className="min-h-[140px] rounded-xl border-white/10 bg-black/30"
                  />
                </div>
              ) : null}
            </div>

            <p className="text-center text-[11px] leading-5 text-muted-foreground/70">
              {rollResult > 0 ? `Last pressure roll: ${rollResult}. ` : ""}Drag to orbit · scroll to zoom · hover spaces for details
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* HUD pieces                                                          */
/* ------------------------------------------------------------------ */

function PlayerHud({
  pawn,
  points,
  laps,
  deckLength,
  deckIndex,
  resolvedCount,
  pops,
}: {
  pawn: PawnOption;
  points: number;
  laps: number;
  deckLength: number;
  deckIndex: number;
  resolvedCount: number;
  pops: PointPop[];
}) {
  return (
    <div className="hud-glass pointer-events-auto relative flex items-center gap-3 rounded-2xl p-2.5 pr-4">
      <PawnOrb pawn={pawn} size="md" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">{pawn.name}</p>
        <div className="flex items-baseline gap-1.5">
          <AnimatedNumber value={points} className="text-xl font-black tabular-nums text-white" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">pts</span>
          {laps > 0 ? <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">Lap {laps}</span> : null}
        </div>
        <div className="mt-1 flex max-w-[11rem] flex-wrap gap-1" aria-label={`${resolvedCount} of ${deckLength} cards resolved`}>
          {Array.from({ length: deckLength }).map((_, index) => (
            <span
              key={index}
              className={`h-1.5 w-2.5 rounded-full transition-all duration-500 ${
                index < resolvedCount ? "bg-primary shadow-[0_0_6px_rgba(35,211,155,0.8)]" : index === deckIndex ? "bg-amber-300/80" : "bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute left-16 top-full">
        {pops.map((pop) => (
          <div key={pop.id} className={`point-pop whitespace-nowrap text-sm font-black ${pop.amount < 0 ? "text-rose-400" : "text-amber-300"}`}>
            {pop.amount > 0 ? "+" : ""}
            {pop.amount} <span className="text-xs font-semibold text-white/80">{pop.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PawnSwitcher({ selectedPawn, onSelect }: { selectedPawn: PawnKey; onSelect: (key: PawnKey) => void }) {
  return (
    <div className="hud-glass hidden items-center gap-1.5 rounded-full p-1.5 sm:flex">
      {pawnOptions.map((pawn) => (
        <button
          key={pawn.key}
          type="button"
          onClick={() => {
            onSelect(pawn.key);
            gameSounds.click();
          }}
          className={`size-6 rounded-full border-2 transition hover:scale-110 ${pawn.key === selectedPawn ? "border-white" : "border-transparent opacity-70"}`}
          style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${pawn.color} 45%, ${pawn.accent})` }}
          aria-label={`Play as ${pawn.name}`}
          aria-pressed={pawn.key === selectedPawn}
          title={pawn.name}
        />
      ))}
    </div>
  );
}

function PawnOrb({ pawn, size }: { pawn: PawnOption; size: "md" | "lg" }) {
  const dimension = size === "lg" ? "size-20" : "size-11";
  return (
    <span
      className={`relative flex ${dimension} shrink-0 items-center justify-center rounded-full`}
      style={{
        background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.75), ${pawn.color} 42%, ${pawn.accent} 100%)`,
        boxShadow: `0 0 0 2px rgba(255,255,255,0.12), 0 8px 24px ${pawn.color}55`,
      }}
    >
      <span className="absolute inset-[22%] rounded-full border border-white/40" />
    </span>
  );
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) {
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      setDisplay(next);
      fromRef.current = next;
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{display.toLocaleString()}</span>;
}

function DiceFace({ kind, value, rolling, hot = false }: { kind: "d20" | "d6"; value: number; rolling: boolean; hot?: boolean }) {
  const label = kind === "d20" ? `Pressure die: ${value || "not rolled"}` : `Move die: ${value || "not rolled"}`;
  if (kind === "d20") {
    return (
      <span className={`d20-face ${rolling ? "dice-roll-face" : value ? "dice-roll-landed" : ""} ${hot && !rolling ? "d20-face-hot" : ""}`} aria-label={label} title="Pressure die (d20)">
        <span>{rolling ? "?" : value || "–"}</span>
      </span>
    );
  }

  const pips: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const shown = rolling ? [4] : pips[value] ?? [];
  return (
    <span className={`d6-face ${rolling ? "dice-roll-face" : value ? "dice-roll-landed" : ""}`} aria-label={label} title="Move die (d6)">
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} className={`rounded-full ${shown.includes(index) ? (value === 1 && !rolling ? "bg-red-600" : "bg-[#10221f]") : "bg-transparent"}`} />
      ))}
    </span>
  );
}

function CharacterSelect({
  selectedPawn,
  onSelect,
  onEnter,
  onClassicMode,
  scenario,
  cardCount,
}: {
  selectedPawn: PawnKey;
  onSelect: (key: PawnKey) => void;
  onEnter: () => void;
  onClassicMode: () => void;
  scenario: string;
  cardCount: number;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[#05080c]/80 p-4 backdrop-blur-sm">
      <div className="splash-panel w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0b1218]/90 p-6 text-center shadow-2xl shadow-black/60 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary">Table Mode</p>
        <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Pull up a chair.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/65 sm:text-base">
          {scenario}. Roll to move around the board, pick routes at forks, draw {cardCount} cards, and earn readiness points for every decision the team captures.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pawnOptions.map((pawn) => {
            const active = pawn.key === selectedPawn;
            return (
              <button
                key={pawn.key}
                type="button"
                onClick={() => onSelect(pawn.key)}
                aria-pressed={active}
                className={`pawn-card group rounded-2xl border p-4 text-center transition ${active ? "pawn-card-active" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
                style={{ "--pawn": pawn.color } as CSSProperties}
              >
                <span className="mx-auto block w-fit transition-transform duration-300 group-hover:-translate-y-1">
                  <PawnOrb pawn={pawn} size="lg" />
                </span>
                <span className="mt-3 block text-base font-bold text-white">{pawn.name}</span>
                <span className="mt-1 block text-xs leading-5 text-white/55">{pawn.description}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-2 text-left text-xs text-white/60 sm:grid-cols-3">
          <HowTo icon={Dices} title="Roll" text="d6 moves your pawn. The d20 adds pressure." />
          <HowTo icon={MessageSquare} title="Answer" text="Each card needs a team answer before the next roll." />
          <HowTo icon={Zap} title="React" text="Shortcuts are faster but riskier. Twist spaces draw consequences." />
        </div>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" className="rounded-full px-8 text-base font-bold" onClick={onEnter} autoFocus>
            <Gamepad2 className="size-5" suppressHydrationWarning />
            Enter The Table
          </Button>
          <Button size="lg" variant="outline" className="rounded-full border-white/15" onClick={onClassicMode}>
            <ListTodo className="size-5" suppressHydrationWarning />
            Classic Mode
          </Button>
        </div>
      </div>
    </div>
  );
}

function HowTo({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" suppressHydrationWarning />
      <div>
        <p className="font-semibold text-white/90">{title}</p>
        <p className="mt-0.5 leading-5">{text}</p>
      </div>
    </div>
  );
}

function CardReveal({ card, cardNumber, deckLength, onPlay }: { card: BoardCard; cardNumber: number; deckLength: number; onPlay: () => void }) {
  const meta = cardKindMeta[card.kind];
  const Icon = meta.icon;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]" onClick={onPlay} role="dialog" aria-modal="true" aria-labelledby="reveal-title">
      <div
        className="card-reveal w-full max-w-sm overflow-hidden rounded-3xl bg-[#f6f1e4] text-[#16212a] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        style={{ "--card": meta.color } as CSSProperties}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative px-5 pb-4 pt-5 text-white" style={{ background: `linear-gradient(135deg, ${meta.color}, ${shadeHex(meta.color, -0.25)})` }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em]">
              <Icon className="size-4" suppressHydrationWarning /> {meta.label}
            </span>
            <span className="text-xs font-semibold opacity-80">
              {cardNumber} / {deckLength}
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-75">{card.stage}</p>
          <h3 id="reveal-title" className="mt-1 text-2xl font-black">
            {card.title}
          </h3>
        </div>
        <div className="px-5 py-5">
          <p className="line-clamp-[8] text-base leading-7">{card.text}</p>
          <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.04] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: shadeHex(meta.color, -0.15) }}>
              Turn goal
            </p>
            <p className="mt-1 text-sm leading-6 text-[#16212a]/80">{card.goal}</p>
          </div>
          <button type="button" onClick={onPlay} className="mt-5 w-full rounded-full py-3 text-sm font-bold text-white transition hover:brightness-110" style={{ background: meta.color }} autoFocus>
            Play this card
          </button>
          <p className="mt-2 text-center text-[11px] text-[#16212a]/50">Press Enter or click anywhere</p>
        </div>
      </div>
    </div>
  );
}

function GameCardPanel({
  card,
  cardNumber,
  deckLength,
  isResolved,
  landedLabel,
}: {
  card: BoardCard;
  cardNumber: number;
  deckLength: number;
  isResolved: boolean;
  landedLabel: string | null;
}) {
  const meta = cardKindMeta[card.kind];
  const Icon = meta.icon;
  return (
    <div key={card.id} className="game-card-panel overflow-hidden rounded-2xl border border-white/10 bg-[#f6f1e4] text-[#16212a] shadow-xl shadow-black/30">
      <div className="px-4 py-3 text-white" style={{ background: `linear-gradient(135deg, ${meta.color}, ${shadeHex(meta.color, -0.25)})` }}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]">
            <Icon className="size-4" suppressHydrationWarning /> {meta.label} · {card.stage}
          </span>
          <span className="text-[11px] font-semibold opacity-85">
            Card {cardNumber} of {deckLength}
          </span>
        </div>
        <h2 className="mt-1.5 text-xl font-black leading-7">{card.title}</h2>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-[15px] leading-7">{card.text}</p>
        <div className="rounded-xl border border-black/10 bg-black/[0.04] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: shadeHex(meta.color, -0.15) }}>
            Turn goal
          </p>
          <p className="mt-1 text-sm leading-6 text-[#16212a]/80">{card.goal}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={`flex items-center gap-1.5 font-semibold ${isResolved ? "text-emerald-700" : "text-amber-700"}`}>
            {isResolved ? <CheckCircle2 className="size-4" suppressHydrationWarning /> : <Lock className="size-4" suppressHydrationWarning />}
            {isResolved ? "Ready for the next roll" : "Answer required before rolling"}
          </span>
          {landedLabel ? <span className="rounded-full bg-black/[0.06] px-2 py-0.5 font-medium text-[#16212a]/70">On: {landedLabel}</span> : null}
        </div>
      </div>
    </div>
  );
}

function VictoryOverlay({
  scorecard,
  points,
  laps,
  injects,
  onClose,
  onDownload,
  onRestart,
}: {
  scorecard: GameScorecard;
  points: number;
  laps: number;
  injects: number;
  onClose: () => void;
  onDownload: () => void;
  onRestart: () => void;
}) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 36 }).map((_, index) => ({
        left: `${(index * 37) % 100}%`,
        delay: `${(index % 9) * 0.12}s`,
        duration: `${2.4 + (index % 5) * 0.35}s`,
        color: ["#23d39b", "#f5b83d", "#68a8ff", "#d98cff", "#f97316"][index % 5],
        rotate: `${(index * 47) % 360}deg`,
      })),
    [],
  );
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="victory-title">
      {confetti.map((piece, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={{ left: piece.left, animationDelay: piece.delay, animationDuration: piece.duration, background: piece.color, "--rotate": piece.rotate } as CSSProperties}
        />
      ))}
      <div className="splash-panel relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1218]/95 p-7 text-center shadow-2xl">
        <Trophy className="mx-auto size-10 text-amber-300" suppressHydrationWarning />
        <p id="victory-title" className="mt-2 text-[11px] font-bold uppercase tracking-[0.3em] text-primary">
          Exercise complete
        </p>
        <div className="score-ring mx-auto mt-5 flex size-36 items-center justify-center rounded-full" style={{ "--score": scorecard.overallScore } as CSSProperties}>
          <div className="flex size-28 flex-col items-center justify-center rounded-full bg-[#0b1218]">
            <span className="text-4xl font-black text-white">{scorecard.overallScore}</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">/ 100</span>
          </div>
        </div>
        <p className="mt-4 text-2xl font-black text-white">{scorecard.readinessTier}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Points", value: points.toLocaleString() },
            { label: "Laps", value: laps },
            { label: "Twists", value: injects },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
              <p className="text-lg font-black text-white">{item.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-white/65">{scorecard.nextTabletop}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button className="rounded-full" onClick={onDownload}>
            <Download className="size-4" suppressHydrationWarning />
            Download scorecard
          </Button>
          <Button variant="outline" className="rounded-full border-white/15" onClick={onClose}>
            <Award className="size-4" suppressHydrationWarning />
            Review details
          </Button>
        </div>
        <button type="button" onClick={onRestart} className="mt-4 text-xs font-semibold text-white/50 underline-offset-4 hover:text-white hover:underline">
          Play again
        </button>
      </div>
    </div>
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
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.05]">
      <button type="button" className="flex w-full items-center justify-between gap-3 p-4" onClick={onToggle} aria-expanded={isOpen}>
        <span className="flex items-center gap-2">
          <Bot className="size-4 text-primary" suppressHydrationWarning />
          <span className="text-sm font-semibold text-foreground">AI Coach</span>
        </span>
        <span className="text-xs text-muted-foreground">{isOpen ? "Close" : "Ask for a hint"}</span>
      </button>
      {isOpen ? (
        <div className="space-y-3 px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {["What should we decide next?", "What would our IRP say here?", "Explain this for non-technical leaders."].map((item) => (
              <Button key={item} variant="outline" size="sm" className="h-auto rounded-full border-white/15 py-1.5 text-xs" onClick={() => onQuickAsk(item)} disabled={isThinking}>
                {item}
              </Button>
            ))}
          </div>
          <Textarea
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="Ask for help with the current situation."
            className="min-h-[80px] rounded-xl border-white/10 bg-black/30"
          />
          <Button variant="secondary" className="rounded-xl" onClick={onAsk} disabled={isThinking || !question.trim()}>
            {isThinking ? <Loader2 className="size-4 animate-spin" suppressHydrationWarning /> : <Lightbulb className="size-4" suppressHydrationWarning />}
            {isThinking ? "Thinking..." : "Ask Coach"}
          </Button>
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          {answer ? <div className="whitespace-pre-line rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-6 text-muted-foreground">{answer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function ScorecardPanel({
  scorecard,
  points,
  onCopy,
  onDownload,
  onCelebrate,
}: {
  scorecard: GameScorecard;
  points: number;
  onCopy: () => void;
  onDownload: () => void;
  onCelebrate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/[0.07] p-4">
      <div className="flex items-center justify-between gap-2 text-primary">
        <span className="flex items-center gap-2">
          <Trophy className="size-5" suppressHydrationWarning />
          <p className="text-sm font-bold uppercase tracking-[0.18em]">Final Scorecard</p>
        </span>
        <button type="button" onClick={onCelebrate} className="text-xs font-semibold text-primary/80 hover:text-primary">
          Show results
        </button>
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-4">
        <div className="score-ring flex size-20 items-center justify-center rounded-full" style={{ "--score": scorecard.overallScore } as CSSProperties}>
          <div className="flex size-16 items-center justify-center rounded-full bg-[#0b1117] text-2xl font-black text-white">{scorecard.overallScore}</div>
        </div>
        <div>
          <p className="text-xl font-black text-foreground">{scorecard.readinessTier}</p>
          <p className="text-xs font-semibold text-amber-300">{points.toLocaleString()} readiness points</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{scorecard.nextTabletop}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {scorecard.categories.map((category) => (
          <div key={category.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{category.label}</p>
              <span className="text-xs font-bold text-foreground">{category.score}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="score-bar h-full rounded-full"
                style={{ width: `${category.score}%`, background: category.score >= 75 ? "#23d39b" : category.score >= 50 ? "#f5b83d" : "#f97316" }}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{category.summary}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button variant="outline" className="rounded-xl border-white/15" onClick={onCopy}>
          <Clipboard className="size-4" suppressHydrationWarning />
          Copy
        </Button>
        <Button variant="secondary" className="rounded-xl" onClick={onDownload}>
          <Download className="size-4" suppressHydrationWarning />
          Download
        </Button>
      </div>
    </div>
  );
}

function TableScenePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[28rem] w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(255,217,160,0.12),transparent_60%)] p-6">
      <div className="placeholder-board relative aspect-square w-full max-w-[32rem] rounded-2xl p-3 shadow-2xl shadow-black/60">
        <div className="grid h-full grid-cols-6 grid-rows-6 gap-[3px] rounded-lg bg-[#1c2a2e] p-[3px]">
          {Array.from({ length: 36 }).map((_, index) => {
            const row = Math.floor(index / 6);
            const col = index % 6;
            const isTrack = row === 0 || row === 5 || col === 0 || col === 5;
            if (!isTrack) {
              return null;
            }
            const isCorner = (row === 0 || row === 5) && (col === 0 || col === 5);
            const tones = Object.values(toneMeta);
            const tone = tones[index % tones.length];
            return (
              <div
                key={index}
                className="rounded-[3px] bg-[#f6f1e4]"
                style={{
                  gridRow: row + 1,
                  gridColumn: col + 1,
                  background: isCorner ? tone.color : undefined,
                  boxShadow: isCorner ? undefined : `inset 0 6px 0 ${tone.color}`,
                }}
              />
            );
          })}
          <div className="col-span-4 col-start-2 row-span-4 row-start-2 flex flex-col items-center justify-center gap-2 rounded-md bg-[radial-gradient(circle,#15514a,#081b20)] text-center">
            <Loader2 className={`size-7 text-primary ${label.includes("Setting") ? "animate-spin" : "hidden"}`} suppressHydrationWarning />
            <p className="text-xs font-black tracking-[0.25em] text-[#7ff5d0]">TABLETOPFORGE</p>
            <p className="text-sm font-medium text-white/80">{label}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function shadeHex(hex: string, amount: number) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const adjusted = channels.map((channel) => Math.max(0, Math.min(255, Math.round(amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount))));
  return `#${adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
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
  points = 0,
) {
  return [
    `# ${exercise.overview.organization} Tabletop Game Scorecard`,
    "",
    `Completed: ${scorecard.completedAt}`,
    `Overall: ${scorecard.overallScore}/100 (${scorecard.readinessTier})`,
    `Readiness points earned: ${points}`,
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
  points = 0,
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
    <p><span class="score">${scorecard.readinessTier} - ${scorecard.overallScore}/100</span> &nbsp; ${points} readiness points</p>
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
