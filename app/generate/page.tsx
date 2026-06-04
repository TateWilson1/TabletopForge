import { ExerciseForm } from "@/components/ExerciseForm";

export default function GeneratePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Generate Tabletop Exercise</h1>
        <p className="mt-3 text-muted-foreground">
          Select the organization profile, scenario, and question set to create a practical incident response tabletop package.
        </p>
      </div>
      <ExerciseForm />
    </main>
  );
}
