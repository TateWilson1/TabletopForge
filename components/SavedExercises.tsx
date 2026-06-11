"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Play, Trash2 } from "lucide-react";
import { ExerciseOutput } from "@/components/ExerciseOutput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buildCompletedSessionHtmlReport, downloadTextFile, safeFilename } from "@/lib/report-export";
import { deleteCompletedSession, deleteExercise, getCompletedSessions, getSavedExercises } from "@/lib/storage";
import type { CompletedSession, GeneratedExercise } from "@/lib/types";

export function SavedExercises() {
  const [saved, setSaved] = useState<GeneratedExercise[]>([]);
  const [completed, setCompleted] = useState<CompletedSession[]>([]);
  const [selected, setSelected] = useState<GeneratedExercise | null>(null);
  const [completedNotice, setCompletedNotice] = useState("");

  useEffect(() => {
    setSaved(getSavedExercises());
    setCompleted(getCompletedSessions());
  }, []);

  function handleDelete(id: string) {
    deleteExercise(id);
    const remaining = getSavedExercises();
    setSaved(remaining);
    if (selected?.id === id) {
      setSelected(null);
    }
  }

  function handleDeleteCompleted(id: string) {
    deleteCompletedSession(id);
    setCompleted(getCompletedSessions());
  }

  function handleDownloadCompleted(session: CompletedSession) {
    downloadTextFile(buildCompletedSessionHtmlReport(session), `${safeFilename(session.organization)}-scorecard-report.html`, "text/html;charset=utf-8");
    setCompletedNotice(`${session.organization} readable scorecard downloaded.`);
  }

  if (saved.length === 0 && completed.length === 0) {
    return (
      <Card className="bg-card/70">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold">No saved exercises or scorecards yet</h2>
          <p className="mt-3 text-muted-foreground">
            Generate an exercise and end a live session to store scorecards locally in this browser.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-6">
        {saved.length > 0 ? <h2 className="text-lg font-semibold">Saved Exercises</h2> : null}
        {saved.map((exercise) => (
          <Card key={exercise.id} className="bg-card/80">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{exercise.overview.organization}</CardTitle>
                  <CardDescription className="mt-2">
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(exercise.generatedAt))}
                  </CardDescription>
                </div>
                <Badge variant="outline">{exercise.overview.maturityLevel}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium">{exercise.overview.scenario}</p>
                <p className="mt-1 text-sm text-muted-foreground">{exercise.overview.industry}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setSelected(exercise)}>
                  <Eye className="size-4" suppressHydrationWarning />
                  View
                </Button>
                <Button asChild>
                  <Link href={`/session?id=${encodeURIComponent(exercise.id)}`}>
                    <Play className="size-4" suppressHydrationWarning />
                    Start
                  </Link>
                </Button>
                <Button variant="destructive" onClick={() => handleDelete(exercise.id)}>
                  <Trash2 className="size-4" suppressHydrationWarning />
                  Delete
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">Details</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{exercise.overview.organization}</DialogTitle>
                      <DialogDescription>{exercise.overview.scenario}</DialogDescription>
                    </DialogHeader>
                    <ExerciseOutput exercise={exercise} />
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}

        {completed.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Completed Scorecards</h2>
              {completedNotice ? <p className="mt-2 text-sm text-primary">{completedNotice}</p> : null}
            </div>
            {completed.map((session) => (
              <Card key={session.id} className="bg-card/80">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">{session.organization}</CardTitle>
                      <CardDescription className="mt-2">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(session.completedAt))}
                      </CardDescription>
                    </div>
                    <Badge variant={session.overallScore >= 75 ? "secondary" : "outline"}>
                      {session.readinessTier ?? "Readiness"} {session.overallScore}/100
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">{session.scenario}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{session.recommendedNextTabletop}</p>
                    {session.recommendedActionItems?.[0] ? (
                      <p className="mt-2 text-sm text-muted-foreground">Next action: {session.recommendedActionItems[0]}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => handleDownloadCompleted(session)}>
                      Download Report
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline">View Scorecard</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{session.organization} Scorecard</DialogTitle>
                          <DialogDescription>
                            {session.readinessTier ?? "Readiness"} - {session.overallScore}/100
                          </DialogDescription>
                        </DialogHeader>
                        <CompletedScorecardDetails session={session} />
                      </DialogContent>
                    </Dialog>
                    <Button variant="destructive" onClick={() => handleDeleteCompleted(session.id)}>
                      <Trash2 className="size-4" suppressHydrationWarning />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}
      </div>

      <ExerciseOutput exercise={selected ?? saved[0] ?? null} emptyTitle="Select a saved exercise" />
    </div>
  );
}

function CompletedScorecardDetails({ session }: { session: CompletedSession }) {
  return (
    <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-2">
      <div className="grid gap-3 sm:grid-cols-2">
        {session.categoryScores.map((category) => (
          <div key={category.id} className="rounded-md border border-border bg-background/45 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{category.label}</p>
              <Badge variant={(category.score ?? 0) >= 75 ? "secondary" : "outline"}>{category.score === null ? "N/A" : `${category.score}/100`}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{category.summary}</p>
          </div>
        ))}
      </div>

      <DetailList title="Top Risks" items={session.topRisks ?? session.gaps.slice(0, 3)} />
      <DetailList title="Suggested Action Items" items={session.recommendedActionItems ?? []} />
      <DetailList title="Unresolved Unknowns" items={session.unresolvedUnknowns} />

      {session.improvementPlan?.length ? (
        <div>
          <h3 className="text-sm font-semibold">30 / 60 / 90 Day Plan</h3>
          <div className="mt-2 grid gap-2">
            {session.improvementPlan.map((item) => (
              <div key={item.window} className="rounded-md border border-border bg-background/45 p-3">
                <Badge variant="secondary">{item.window}</Badge>
                <p className="mt-2 text-sm font-medium">{item.focus}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.outcome}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2">
        {(items.length ? items : ["None captured."]).map((item, index) => (
          <li key={`${title}-${index}-${item}`} className="rounded-md border border-border bg-background/45 p-3 text-sm leading-6 text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
