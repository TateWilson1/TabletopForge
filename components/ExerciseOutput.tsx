"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText, Play, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildExerciseHtmlReport, downloadTextFile, safeFilename } from "@/lib/report-export";
import { saveExercise } from "@/lib/storage";
import type { GeneratedExercise } from "@/lib/types";

export function ExerciseOutput({
  exercise,
  emptyTitle,
}: {
  exercise: GeneratedExercise | null;
  emptyTitle?: string;
}) {
  const [copyNotice, setCopyNotice] = useState("");

  if (!exercise) {
    return (
      <Card className="flex min-h-[560px] items-center justify-center bg-card/55">
        <CardContent className="max-w-md p-8 text-center">
          <FileText className="mx-auto mb-4 size-10 text-primary" suppressHydrationWarning />
          <h2 className="text-xl font-semibold">{emptyTitle ?? "No exercise selected"}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Generated tabletop packages include an overview, scenario summary, objectives, participants, discussion prompts, IRP gap questions, decisions, facilitator notes, and exportable Markdown.
          </p>
        </CardContent>
      </Card>
    );
  }

  function handleDownloadReadable() {
    if (!exercise) {
      return;
    }

    downloadTextFile(
      buildExerciseHtmlReport(exercise),
      `${safeFilename(exercise.overview.organization)}-tabletop-report.html`,
      "text/html;charset=utf-8",
    );
  }

  function handleSave() {
    if (!exercise) {
      return;
    }

    saveExercise(exercise);
    setCopyNotice("Exercise saved in this browser.");
  }

  return (
    <Card className="bg-card/80">
      <CardHeader>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>{exercise.overview.organization} Tabletop Package</CardTitle>
            <CardDescription className="mt-2">
              {exercise.overview.scenario} - {exercise.overview.duration} - {exercise.overview.maturityLevel}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDownloadReadable}>
              <Download className="size-4" suppressHydrationWarning />
              Download Report
            </Button>
            <Button variant="secondary" onClick={handleSave}>
              <Save className="size-4" suppressHydrationWarning />
              Save
            </Button>
            <Button asChild>
              <Link href={`/session?id=${encodeURIComponent(exercise.id)}`}>
                <Play className="size-4" suppressHydrationWarning />
                Start Session
              </Link>
            </Button>
          </div>
        </div>
        {copyNotice ? <p className="text-sm text-primary">{copyNotice}</p> : null}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="report">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="report">Report</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="space-y-6">
            <Section title="Exercise Overview">
              <div className="grid gap-3 sm:grid-cols-2">
                <Meta label="Industry" value={exercise.overview.industry} />
                <Meta label="Organization size" value={exercise.overview.organizationSize} />
                <Meta label="Scenario" value={exercise.overview.scenario} />
                <Meta label="Maturity" value={exercise.overview.maturityLevel} />
                <Meta
                  label="Session mode"
                  value="TabletopForge facilitated"
                />
              </div>
              <p className="mt-4 leading-7 text-muted-foreground">{exercise.overview.purpose}</p>
            </Section>

            <Section title="Scenario Summary">
              <p className="leading-7 text-muted-foreground">{exercise.scenarioSummary}</p>
            </Section>

            <ListSection title="Exercise Objectives" items={exercise.objectives} />
            <ListSection title="Suggested Participants" items={exercise.suggestedParticipants} badge />
            {exercise.irpAnalysis ? <IrpAnalysisSection exercise={exercise} /> : null}
            {exercise.starterIrpTemplate ? <StarterIrpTemplateSection exercise={exercise} /> : null}
            <ListSection title="Expected Decisions" items={exercise.expectedDecisions} />
            <ListSection title="Facilitator Notes" items={exercise.facilitatorNotes} />

            {exercise.lessonsLearnedTemplate ? (
              <Section title="Lessons Learned Template">
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="grid grid-cols-[1fr_0.55fr_0.55fr_0.45fr] bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                    <span>Prompt</span>
                    <span>Owner</span>
                    <span>Due date</span>
                    <span>Priority</span>
                  </div>
                  {exercise.lessonsLearnedTemplate.map((item) => (
                    <div
                      key={item.prompt}
                      className="grid grid-cols-[1fr_0.55fr_0.55fr_0.45fr] border-t border-border px-3 py-3 text-sm"
                    >
                      <span>{item.prompt}</span>
                      <span>{item.owner}</span>
                      <span>{item.dueDate}</span>
                      <span>{item.priority}</span>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            <Section title="Executive Summary">
              <p className="leading-7 text-muted-foreground">{exercise.executiveSummary}</p>
            </Section>
          </TabsContent>

          <TabsContent value="questions" className="grid gap-6 xl:grid-cols-2">
            <ListSection title="Discussion Questions" items={exercise.discussionQuestions} />
            <ListSection title="IRP Gap Discovery Questions" items={exercise.gapDiscoveryQuestions} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-lg font-semibold tracking-normal">{title}</h3>
        <Separator className="flex-1" />
      </div>
      {children}
    </section>
  );
}

function IrpAnalysisSection({ exercise }: { exercise: GeneratedExercise }) {
  if (!exercise.irpAnalysis) {
    return null;
  }

  const focusFindings = exercise.irpAnalysis.findings.filter((finding) => finding.status !== "found");

  return (
    <Section title="IRP Gap Analysis">
      <div className="space-y-4">
        <div className="rounded-md border border-primary/30 bg-primary/10 p-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{exercise.irpAnalysis.sourceName ?? "Pasted IRP text"}</Badge>
            <Badge variant="outline">{exercise.irpAnalysis.wordCount} words analyzed</Badge>
            <Badge variant="outline">{focusFindings.length} focus gaps</Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{exercise.irpAnalysis.overallSummary}</p>
        </div>

        {exercise.irpAnalysis.strengths.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">Apparent strengths</p>
            <div className="flex flex-wrap gap-2">
              {exercise.irpAnalysis.strengths.map((strength) => (
                <Badge key={strength} variant="secondary">
                  {strength}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3">
          {focusFindings.length > 0 ? (
            focusFindings.map((finding) => (
              <div key={finding.id} className="rounded-md border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{finding.label}</p>
                  <Badge variant={finding.status === "missing" ? "outline" : "secondary"}>{finding.status}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.summary}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.improvement}</p>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-border bg-background/45 p-4 text-sm leading-6 text-muted-foreground">
              No major missing areas were identified by the local scan. Use the exercise to validate whether the documented plan works in practice.
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function StarterIrpTemplateSection({ exercise }: { exercise: GeneratedExercise }) {
  if (!exercise.starterIrpTemplate) {
    return null;
  }

  return (
    <Section title="Starter IRP Template">
      <div className="space-y-4">
        <div className="rounded-md border border-accent/35 bg-accent/10 p-4">
          <p className="text-sm leading-6 text-muted-foreground">{exercise.starterIrpTemplate.generatedBecause}</p>
        </div>
        <div className="grid gap-3">
          {exercise.starterIrpTemplate.sections.map((section) => (
            <div key={section.title} className="rounded-md border border-border bg-background/45 p-4">
              <p className="font-medium">{section.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{section.purpose}</p>
              <p className="mt-3 text-sm leading-6 text-foreground">{section.draftText}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {section.fillIn.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
        <ListSection title="Starter IRP Missing Inputs" items={exercise.starterIrpTemplate.missingInputs} />
      </div>
    </Section>
  );
}

function ListSection({ title, items, badge = false }: { title: string; items: string[]; badge?: boolean }) {
  return (
    <Section title={title}>
      {badge ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="rounded-md border border-border bg-background/45 p-3 text-sm leading-6 text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/45 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
