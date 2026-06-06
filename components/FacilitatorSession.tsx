"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Plus,
  RefreshCw,
  Sparkles,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { GeneratedExercise } from "@/lib/types";

interface FacilitatorStep {
  title: string;
  label: string;
  duration: string;
  facilitatorScript: string;
  prompts: string[];
  decisions: string[];
  injects: string[];
}

export function FacilitatorSession({ exercise }: { exercise: GeneratedExercise }) {
  const steps = useMemo(() => buildFacilitatorSteps(exercise), [exercise]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealedInjects, setRevealedInjects] = useState<string[]>([]);
  const [customInject, setCustomInject] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [actionItems, setActionItems] = useState("");

  const activeStep = steps[activeIndex];
  const progress = Math.round(((activeIndex + 1) / steps.length) * 100);
  const hasHumanFacilitator = exercise.overview.hasHumanFacilitator;

  function revealInject() {
    const nextInject = activeStep.injects.find((inject) => !revealedInjects.includes(inject));

    if (nextInject) {
      setRevealedInjects((current) => [...current, nextInject]);
    }
  }

  function addCustomInject() {
    const trimmed = customInject.trim();

    if (!trimmed) {
      return;
    }

    setRevealedInjects((current) => [...current, trimmed]);
    setCustomInject("");
  }

  function moveStep(direction: -1 | 1) {
    setActiveIndex((current) => Math.min(steps.length - 1, Math.max(0, current + direction)));
  }

  function resetSession() {
    setActiveIndex(0);
    setRevealedInjects([]);
    setCustomInject("");
    setSessionNotes("");
    setActionItems("");
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
                  <span className="text-xs">{step.duration}</span>
                </div>
                <p className="mt-1 text-sm">{step.title}</p>
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
                    <Timer className="mr-1 size-3" />
                    {activeStep.duration}
                  </Badge>
                </div>
                <CardTitle>{activeStep.title}</CardTitle>
              </div>
              <Button variant="outline" onClick={resetSession}>
                <RefreshCw className="size-4" />
                Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="rounded-md border border-primary/30 bg-primary/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="size-4" />
                {hasHumanFacilitator ? "Facilitator Script" : "TabletopForge Facilitator"}
              </div>
              <p className="leading-7 text-muted-foreground">{activeStep.facilitatorScript}</p>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <PromptList title={hasHumanFacilitator ? "Ask The Room" : "Discuss This Now"} items={activeStep.prompts} />
              <PromptList title={hasHumanFacilitator ? "Decisions To Capture" : "Decide Before Moving On"} items={activeStep.decisions} />
            </div>

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
                <Button onClick={revealInject} disabled={activeStep.injects.every((inject) => revealedInjects.includes(inject))}>
                  <Sparkles className="size-4" />
                  {hasHumanFacilitator ? "Reveal Inject" : "Reveal Next Development"}
                </Button>
              </div>

              <div className="space-y-2">
                {revealedInjects.length > 0 ? (
                  revealedInjects.map((inject, index) => (
                    <div key={`${inject}-${index}`} className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm leading-6">
                      <span className="font-medium text-accent">Inject {index + 1}: </span>
                      <span className="text-muted-foreground">{inject}</span>
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
                  <Plus className="size-4" />
                  Add Live Inject
                </Button>
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button variant="outline" onClick={() => moveStep(-1)} disabled={activeIndex === 0}>
                <ChevronLeft className="size-4" />
                Back
              </Button>
              <Button onClick={() => moveStep(1)} disabled={activeIndex === steps.length - 1}>
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-background/45">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="size-5 text-primary" />
            {hasHumanFacilitator ? "Facilitator Notes" : "Session Notes"}
          </CardTitle>
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
        {items.map((item) => (
          <li key={item} className="rounded-md border border-border bg-background/45 p-3 text-sm leading-6 text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function buildFacilitatorSteps(exercise: GeneratedExercise): FacilitatorStep[] {
  const focusGaps = exercise.irpAnalysis?.findings.filter((finding) => finding.status !== "found").slice(0, 3) ?? [];
  const gapPrompts = focusGaps.map((finding) => `The IRP scan flagged ${finding.label.toLowerCase()}. How would the team handle that gap during this incident?`);
  const hasHumanFacilitator = exercise.overview.hasHumanFacilitator;

  return [
    {
      label: "Step 1",
      title: "Kickoff And Ground Rules",
      duration: "5 min",
      facilitatorScript: hasHumanFacilitator
        ? `Start by reminding the group that this is a no-fault discussion for ${exercise.overview.organization}. The goal is to test decision-making, ownership, and the IRP, not to prove technical expertise.`
        : `Welcome to the ${exercise.overview.organization} tabletop exercise. This is a no-fault discussion. Your goal is to talk through decisions, ownership, communications, and IRP gaps. Assign one person to read responses aloud and one person to capture notes before moving on.`,
      prompts: [
        "Who is participating today, and what role are they representing?",
        "Who will capture decisions, unclear answers, and action items?",
        ...exercise.objectives.slice(0, 2),
      ],
      decisions: [
        "Who is the facilitator?",
        "Who owns note taking?",
        "What is in scope for today's discussion?",
      ],
      injects: [
        "A senior leader joins late and asks for a simple explanation of what the exercise is trying to prove.",
        "One participant says they have never seen the incident response plan before today.",
      ],
    },
    {
      label: "Step 2",
      title: "Initial Report",
      duration: "10 min",
      facilitatorScript: hasHumanFacilitator
        ? `Read the scenario aloud, then ask the group to describe the first 15 minutes of response. Keep pulling the conversation back to who owns each action and where it is written down.`
        : `Read the scenario below as if it just happened. Discuss the first 15 minutes of response. Do not jump straight to technical fixes. Name who receives the report, who owns each action, and where the IRP supports that answer.`,
      prompts: [
        exercise.scenarioSummary,
        ...exercise.discussionQuestions.slice(0, 4),
        ...gapPrompts.slice(0, 1),
      ],
      decisions: exercise.expectedDecisions.slice(0, 3),
      injects: [
        "A second employee reports a similar issue, suggesting this may not be isolated.",
        "The original reporter is unavailable for follow-up because they left for a meeting.",
        "Leadership asks whether this is officially an incident yet.",
      ],
    },
    {
      label: "Step 3",
      title: "Escalation And Containment",
      duration: "15 min",
      facilitatorScript: hasHumanFacilitator
        ? "Increase pressure slightly. Ask what the team can do immediately, what needs approval, and what business risk each containment choice creates."
        : "The situation is getting more serious. Before you reveal another development, decide what the team can do immediately, what requires approval, and what business risk each containment choice creates.",
      prompts: [
        ...exercise.discussionQuestions.slice(4, 8),
        ...exercise.gapDiscoveryQuestions.slice(0, 3),
        ...gapPrompts.slice(1, 2),
      ],
      decisions: exercise.expectedDecisions.slice(2, 6),
      injects: [
        "A department manager says the proposed containment step will interrupt a critical business process.",
        "The team cannot immediately reach the person who normally approves high-impact IT actions.",
        "Someone asks whether evidence should be preserved before containment begins.",
      ],
    },
    {
      label: "Step 4",
      title: "Communications And Impact",
      duration: "15 min",
      facilitatorScript: hasHumanFacilitator
        ? "Shift to communication, leadership updates, legal/compliance involvement, and stakeholder expectations. Ask the group to avoid vague answers like 'we would notify people' and name the audience, owner, and message."
        : "Now focus on communications and impact. Avoid vague answers like 'we would notify people.' Name the audience, message owner, approval path, and what facts are confirmed before any update is sent.",
      prompts: [
        ...exercise.discussionQuestions.slice(8, 12),
        ...exercise.gapDiscoveryQuestions.slice(3, 7),
        ...gapPrompts.slice(2, 3),
      ],
      decisions: [
        "Whether leadership needs an immediate briefing.",
        "Whether legal, compliance, or cyber insurance should be involved.",
        "Whether employees, customers, vendors, or regulators need communication.",
      ],
      injects: [
        "An executive asks for a status update they can forward to leadership within 10 minutes.",
        "A customer-facing manager hears rumors and asks what they are allowed to say.",
        "Legal asks what facts are confirmed versus assumed.",
      ],
    },
    {
      label: "Step 5",
      title: "Recovery And Lessons Learned",
      duration: "15 min",
      facilitatorScript: hasHumanFacilitator
        ? "Close by turning gaps into improvements. Every unclear answer should become an action item with an owner, due date, and priority."
        : "Close the exercise by turning every unclear answer into an improvement item. Do not leave this section until each major gap has an owner, due date, and priority.",
      prompts: [
        ...exercise.gapDiscoveryQuestions.slice(7, 12),
        "What slowed the response in this discussion?",
        "What would need to be updated in the IRP before this scenario happened for real?",
        "What training or tabletop should happen next?",
      ],
      decisions: [
        "Which action items are high priority?",
        "Who owns each IRP update?",
        "When will the team validate that improvements were completed?",
      ],
      injects: [
        "The facilitator asks each participant to name one thing they would change in the IRP.",
        "Leadership wants the top three improvement items by tomorrow morning.",
        "A participant says the team should rerun this exercise after updates are complete.",
      ],
    },
  ];
}
