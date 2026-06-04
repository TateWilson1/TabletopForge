import { SavedExercises } from "@/components/SavedExercises";

export default function SavedPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Saved Exercises</h1>
        <p className="mt-3 text-muted-foreground">
          Review, export, or delete tabletop exercises stored in this browser.
        </p>
      </div>
      <SavedExercises />
    </main>
  );
}
