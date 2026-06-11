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

  async function handleCopyCompleted(session: CompletedSession) {
    await navigator.clipboard.writeText(session.markdownReport);
    setCompletedNotice(`${session.organization} scorecard copied.`);
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
                    <Badge variant={session.overallScore >= 75 ? "secondary" : "outline"}>{session.overallScore}/100</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">{session.scenario}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{session.recommendedNextTabletop}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => handleCopyCompleted(session)}>
                      <Eye className="size-4" suppressHydrationWarning />
                      Copy Report
                    </Button>
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
