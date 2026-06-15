"use client";

import { useMemo, useState } from "react";
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
import { generateExercise } from "@/lib/generator";
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

  const canGenerate = useMemo(() => options.organizationName.trim().length >= 2, [options.organizationName]);

  function updateOption<K extends keyof ExerciseOptions>(key: K, value: ExerciseOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
    setError("");
    setSavedNotice("");
  }

  async function handleIrpUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    if (file.size > 750_000) {
      setError("Upload an IRP text file smaller than 750 KB, or paste a shorter excerpt.");
      return;
    }

    const text = await file.text();
    updateOption("irpText", text);
    updateOption("irpFileName", file.name);
    setIrpNotice(`Loaded ${file.name}. The full IRP text stays in this browser and is not saved.`);
  }

  function clearIrp() {
    updateOption("irpText", "");
    updateOption("irpFileName", "");
    setIrpNotice("");
  }

  function handleGenerate() {
    if (!canGenerate) {
      setError("Enter an organization name with at least two characters.");
      return;
    }

    const generated = generateExercise({ ...options, hasHumanFacilitator: false });
    saveExercise(generated);
    setSavedNotice("Exercise generated and saved in this browser.");
    setIsGenerating(true);
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
              Local only
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
                  Upload a plain-text IRP or paste text copied from a PDF or Word document to tailor questions around likely gaps.
                </p>
              </div>
              {options.irpText ? (
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
                  Privacy: IRP text stays in this browser in the current version. It is not sent to an AI service or server.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[0.72fr_1.28fr]">
              <div className="space-y-2">
                <Label htmlFor="irpFile">Upload IRP text</Label>
                <Input
                  id="irpFile"
                  type="file"
                  accept=".txt,.md,.rtf,.csv,text/plain,text/markdown"
                  onChange={(event) => handleIrpUpload(event.target.files?.[0])}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="irpText">Paste IRP text</Label>
                <Textarea
                  id="irpText"
                  value={options.irpText}
                  onChange={(event) => {
                    updateOption("irpText", event.target.value);
                    updateOption("irpFileName", event.target.value.trim() ? "Pasted IRP text" : "");
                    setIrpNotice("");
                  }}
                  placeholder="Paste IRP sections here, such as roles, severity levels, communications, containment, evidence, legal/compliance, recovery, and after-action review."
                  className="min-h-[140px]"
                />
              </div>
            </div>

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

          <Button className="w-full" size="lg" onClick={handleGenerate} disabled={isGenerating}>
            <Wand2 className="size-4" suppressHydrationWarning />
            {isGenerating ? "Starting Session..." : "Generate And Start Session"}
          </Button>
        </CardContent>
      </Card>
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
