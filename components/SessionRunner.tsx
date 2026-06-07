"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, ListChecks, Plus } from "lucide-react";
import { FacilitatorSession } from "@/components/FacilitatorSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSavedExerciseById } from "@/lib/storage";
import type { GeneratedExercise } from "@/lib/types";

export function SessionRunner({ exerciseId }: { exerciseId: string }) {
  const [exercise, setExercise] = useState<GeneratedExercise | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setExercise(getSavedExerciseById(exerciseId) ?? null);
    setLoaded(true);
  }, [exerciseId]);

  if (!loaded) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <Card className="bg-card/80">
          <CardContent className="p-8 text-center text-muted-foreground">Loading session...</CardContent>
        </Card>
      </main>
    );
  }

  if (!exercise) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <Card className="bg-card/80">
          <CardContent className="space-y-5 p-8 text-center">
            <FileText className="mx-auto size-10 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">Session Not Found</h1>
              <p className="mt-3 text-muted-foreground">
                This live session is stored in your browser. Generate a new exercise or open one from Saved Exercises.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/generate">
                  <Plus className="size-4" />
                  Generate Exercise
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/saved">Saved Exercises</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 border-b border-border/70 pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="secondary">{exercise.overview.hasHumanFacilitator ? "Human facilitator assisted" : "TabletopForge facilitated"}</Badge>
            <Badge variant="outline">{exercise.overview.duration}</Badge>
            <Badge variant="outline">{exercise.overview.maturityLevel}</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">{exercise.overview.organization} Live Session</h1>
          <p className="mt-2 text-muted-foreground">{exercise.overview.scenario}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/generate">
              <ArrowLeft className="size-4" />
              Generator
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/saved">
              <ListChecks className="size-4" />
              Saved
            </Link>
          </Button>
        </div>
      </div>

      <FacilitatorSession exercise={exercise} />
    </main>
  );
}
