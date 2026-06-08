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
import { deleteExercise, getSavedExercises } from "@/lib/storage";
import type { GeneratedExercise } from "@/lib/types";

export function SavedExercises() {
  const [saved, setSaved] = useState<GeneratedExercise[]>([]);
  const [selected, setSelected] = useState<GeneratedExercise | null>(null);

  useEffect(() => {
    setSaved(getSavedExercises());
  }, []);

  function handleDelete(id: string) {
    deleteExercise(id);
    const remaining = getSavedExercises();
    setSaved(remaining);
    if (selected?.id === id) {
      setSelected(null);
    }
  }

  if (saved.length === 0) {
    return (
      <Card className="bg-card/70">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold">No saved exercises yet</h2>
          <p className="mt-3 text-muted-foreground">
            Generate an exercise and it will be stored locally in this browser.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-4">
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
                  <Link href={`/session/${exercise.id}`}>
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
      </div>

      <ExerciseOutput exercise={selected ?? saved[0] ?? null} emptyTitle="Select a saved exercise" />
    </div>
  );
}
