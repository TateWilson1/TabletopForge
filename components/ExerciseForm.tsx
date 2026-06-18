"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ShieldCheck, Wand2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { fetchAccount, generateAiTabletop, generateTabletop, isAccountApiConfigured, type AccountState } from "@/lib/account";
import { generateExercise } from "@/lib/generator";
import { extractIrpTextFromFile } from "@/lib/irp-file";
import { saveExercise } from "@/lib/storage";
import {
  exerciseDurations,
  industries,
  maturityLevels,
  organizationSizes,
  scenarioTypes,
  type ExerciseOptions,
} from "@/lib/types";

const defaultOptions: ExerciseOptions = {
  organizationName: "",
  industry: "Small Business",
  organizationSize: "26-100",
  scenarioType: "Phishing / Business Email Compromise",
  maturityLevel: "Basic",
  exerciseDuration: "60 minutes",
  includeExecutiveQuestions: true,
  includeTechnicalQuestions: false,
  includeComplianceQuestions: true,
  includeLessonsLearned: true,
  hasHumanFacilitator: false,
  customScenarioDetails: "",
  noIrp: false,
  irpText: "",
  irpFileName: "",
};

export function ExerciseForm() {
  const router = useRouter();
  const [options, setOptions] = useState<ExerciseOptions>(defaultOptions);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [irpNotice, setIrpNotice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState("Preparing exercise context...");
  const [account, setAccount] = useState<AccountState | null>(null);

  const canGenerate = useMemo(() => options.organizationName.trim().length >= 2, [options.organizationName]);
  const accountApiConfigured = isAccountApiConfigured();

  useEffect(() => {
    if (!accountApiConfigured) {
      return;
    }

    fetchAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, [accountApiConfigured]);

  useEffect(() => {
    if (!isGenerating) {
      setGenerationProgress(0);
      setGenerationStep("Preparing exercise context...");
      return;
    }

    const steps = [
      "Preparing exercise context...",
      options.noIrp ? "Preparing starter IRP mode..." : "Reading IRP and optional details...",
      "Asking AI to build a unique scenario...",
      "Tailoring questions to gaps and difficulty...",
      "Saving the tabletop to your account...",
      "Finalizing the live session...",
    ];
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const targetProgress =
        elapsedSeconds < 3
          ? 18
          : elapsedSeconds < 8
            ? 42
            : elapsedSeconds < 16
              ? 68
              : elapsedSeconds < 30
                ? 84
                : Math.min(98, 88 + Math.floor((elapsedSeconds - 30) / 6));

      setGenerationProgress((current) => Math.max(current, Math.min(98, targetProgress)));
      setGenerationStep(steps[Math.min(steps.length - 1, Math.floor(elapsedSeconds / 7))]);
    }, 700);

    return () => window.clearInterval(timerId);
  }, [isGenerating, options.noIrp]);

  function updateOption<K extends keyof ExerciseOptions>(key: K, value: ExerciseOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
    setError("");
    setSavedNotice("");
  }

  async function handleIrpUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    if (file.size > 5_000_000) {
      setError("Upload an IRP file smaller than 5 MB, or paste a shorter excerpt.");
      return;
    }

    setError("");
    setIrpNotice(`Reading ${file.name}...`);

    try {
      const text = await extractIrpTextFromFile(file);
      updateOption("noIrp", false);
      updateOption("irpText", text);
      updateOption("irpFileName", file.name);
      setIrpNotice(`Loaded ${file.name}. Extracted ${Math.max(1, text.trim().split(/\s+/).filter(Boolean).length)} words.`);
    } catch (uploadError) {
      setIrpNotice("");
      setError(uploadError instanceof Error ? uploadError.message : "Could not read this IRP file.");
    }
  }

  function clearIrp() {
    updateOption("irpText", "");
    updateOption("irpFileName", "");
    updateOption("noIrp", false);
    setIrpNotice("");
  }

  function toggleNoIrp(checked: boolean) {
    updateOption("noIrp", checked);
    if (checked) {
      updateOption("irpText", "");
      updateOption("irpFileName", "No IRP provided");
      setIrpNotice("TabletopForge will use the exercise decisions to draft a starter IRP outline.");
    } else {
      updateOption("irpFileName", "");
      setIrpNotice("");
    }
  }

  async function handleGenerate() {
    if (!canGenerate) {
      setError("Enter an organization name with at least two characters.");
      return;
    }

    if (accountApiConfigured && !account) {
      setError("Sign in first so TabletopForge can apply your free generation or paid credits.");
      return;
    }

    setIsGenerating(true);
    setError("");

    let generated = generateExercise({ ...options, hasHumanFacilitator: false });
    let generationNotice = "Exercise generated and saved in this browser.";

    if (accountApiConfigured) {
      try {
        const result = await generateAiTabletop({ ...options, hasHumanFacilitator: false });
        generated = result.exercise;
        setAccount({ user: result.user, entitlements: result.entitlements });
        generationNotice = "AI exercise generated and saved in this browser.";
      } catch (requestError) {
        try {
          const fallbackExercise = generateExercise({ ...options, hasHumanFacilitator: false });
          const result = await generateTabletop(options, fallbackExercise);
          generated = { ...fallbackExercise, id: result.tabletopId };
          setAccount({ user: result.user, entitlements: result.entitlements });
          generationNotice = "AI generation was unavailable, so TabletopForge used the built-in generator.";
        } catch (fallbackError) {
          setIsGenerating(false);
          setError(fallbackError instanceof Error ? fallbackError.message : requestError instanceof Error ? requestError.message : "Could not start generation.");
          return;
        }
      }
    }

    saveExercise(generated);
    setGenerationProgress(100);
    setSavedNotice(generationNotice);
    router.push(`/session?id=${encodeURIComponent(generated.id)}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="h-fit bg-card/80">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Exercise Inputs</CardTitle>
              <CardDescription>Choose the business context and tabletop scope.</CardDescription>
            </div>
            <Badge variant="outline" className="hidden border-primary/40 text-primary sm:inline-flex">
              Account gated
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="organizationName">
              Organization name <RequiredMark />
            </Label>
            <Input
              id="organizationName"
              value={options.organizationName}
              onChange={(event) => updateOption("organizationName", event.target.value)}
              placeholder="Example: Acme Family Clinic"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Industry" required value={options.industry} values={industries} onChange={(value) => updateOption("industry", value)} />
            <SelectField
              label="Organization size"
              required
              value={options.organizationSize}
              values={organizationSizes}
              onChange={(value) => updateOption("organizationSize", value)}
            />
          </div>

          <SelectField
            label="Scenario type"
            required
            value={options.scenarioType}
            values={scenarioTypes}
            onChange={(value) => updateOption("scenarioType", value)}
          />

          <div className="space-y-2">
            <Label htmlFor="customScenarioDetails">Scenario details</Label>
            <Textarea
              id="customScenarioDetails"
              value={options.customScenarioDetails}
              onChange={(event) => updateOption("customScenarioDetails", event.target.value)}
              placeholder="Optional: add details like affected systems, business context, staff concerns, or the specific situation you want the exercise to include."
              className="min-h-[96px]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Maturity level"
              required
              value={options.maturityLevel}
              values={maturityLevels}
              onChange={(value) => updateOption("maturityLevel", value)}
            />
            <SelectField
              label="Exercise duration"
              required
              value={options.exerciseDuration}
              values={exerciseDurations}
              onChange={(value) => updateOption("exerciseDuration", value)}
            />
          </div>

          <Separator />

          <div className="space-y-4 rounded-lg border border-border bg-background/40 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Label>Incident response plan</Label>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Upload a PDF, Word document, or text IRP, or start without one and build a starter plan from the tabletop.
                </p>
              </div>
              {options.irpText || options.noIrp ? (
                <Button variant="ghost" size="sm" onClick={clearIrp}>
                  <X className="size-4" suppressHydrationWarning />
                  Clear
                </Button>
              ) : null}
            </div>

            <div className="rounded-md border border-primary/25 bg-primary/10 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 text-primary" suppressHydrationWarning />
                <p className="text-sm leading-6 text-muted-foreground">
                  Privacy: when AI generation is enabled, IRP text is sent to the secure backend and OpenAI to tailor the exercise, but raw IRP contents are not stored in PostgreSQL.
                </p>
              </div>
            </div>

            <div className="rounded-md border border-accent/35 bg-accent/10 p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="noIrp"
                  checked={options.noIrp === true}
                  onCheckedChange={(value) => toggleNoIrp(value === true)}
                  className="mt-1"
                />
                <div>
                  <Label htmlFor="noIrp">We do not have an IRP yet</Label>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    The exercise will identify the roles, thresholds, evidence needs, contacts, and recovery steps needed for a starter IRP.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[0.72fr_1.28fr]">
              <div className="space-y-2">
                <Label htmlFor="irpFile">Upload IRP</Label>
                <Input
                  id="irpFile"
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.rtf,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  disabled={options.noIrp === true}
                  onChange={(event) => handleIrpUpload(event.target.files?.[0])}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="irpText">Paste IRP text</Label>
                <Textarea
                  id="irpText"
                  value={options.irpText}
                  disabled={options.noIrp === true}
                  onChange={(event) => {
                    updateOption("irpText", event.target.value);
                    updateOption("noIrp", false);
                    updateOption("irpFileName", event.target.value.trim() ? "Pasted IRP text" : "");
                    setIrpNotice("");
                  }}
                  placeholder="Paste IRP sections here, such as roles, severity levels, communications, containment, evidence, legal/compliance, recovery, and after-action review."
                  className="min-h-[140px]"
                />
              </div>
            </div>

            {options.noIrp ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-accent" suppressHydrationWarning />
                <span>No IRP mode enabled</span>
                <span>Starter IRP template will be included in the report</span>
              </div>
            ) : null}

            {options.irpText ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <FileText className="size-4 text-primary" suppressHydrationWarning />
                <span>{options.irpFileName || "IRP text loaded"}</span>
                <span>{Math.max(1, options.irpText.trim().split(/\s+/).filter(Boolean).length)} words</span>
              </div>
            ) : null}
            {irpNotice ? <p className="text-sm text-primary">{irpNotice}</p> : null}
          </div>

          <Separator />

          <div className="space-y-4">
            <ToggleRow
              id="executive"
              label="Include executive questions"
              checked={options.includeExecutiveQuestions}
              onCheckedChange={(checked) => updateOption("includeExecutiveQuestions", checked)}
            />
            <ToggleRow
              id="technical"
              label="Include technical questions"
              checked={options.includeTechnicalQuestions}
              onCheckedChange={(checked) => updateOption("includeTechnicalQuestions", checked)}
            />
            <ToggleRow
              id="compliance"
              label="Include compliance questions"
              checked={options.includeComplianceQuestions}
              onCheckedChange={(checked) => updateOption("includeComplianceQuestions", checked)}
            />
            <ToggleRow
              id="lessons"
              label="Include lessons learned template"
              checked={options.includeLessonsLearned}
              onCheckedChange={(checked) => updateOption("includeLessonsLearned", checked)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {savedNotice ? <p className="text-sm text-primary">{savedNotice}</p> : null}
          {isGenerating ? <GenerationProgress progress={generationProgress} step={generationStep} /> : null}

          <Button className="w-full" size="lg" onClick={handleGenerate} disabled={isGenerating}>
            <Wand2 className="size-4" suppressHydrationWarning />
            {isGenerating ? "Generating With AI..." : "Generate And Start Session"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GenerationProgress({ progress, step }: { progress: number; step: string }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-primary">{step}</p>
        <span className="text-sm text-muted-foreground">{progress}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        AI generation can take a moment because it is reading the context, tailoring the IRP gaps, and building a full facilitator-ready session.
      </p>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  values,
  onChange,
  required = false,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (value: T) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required ? <RequiredMark /> : null}
      </Label>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as T)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>
              {formatSelectLabel(item)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function formatSelectLabel(value: string) {
  if (value === "Basic") {
    return "Basic (plain-language)";
  }

  return value;
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-label="required">
      *
    </span>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-background/55 p-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <div className="space-y-1">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}
