"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileText, ShieldCheck, Wand2, X } from "lucide-react";
import { ExerciseOutput } from "@/components/ExerciseOutput";
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
  type GeneratedExercise,
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
  irpText: "",
  irpFileName: "",
};

const exerciseTemplates: Array<{
  title: string;
  description: string;
  options: Pick<ExerciseOptions, "industry" | "organizationSize" | "scenarioType" | "maturityLevel" | "exerciseDuration" | "includeExecutiveQuestions" | "includeTechnicalQuestions" | "includeComplianceQuestions" | "includeLessonsLearned" | "hasHumanFacilitator">;
}> = [
  {
    title: "Small Business BEC",
    description: "A quick, approachable wire transfer or credential theft scenario.",
    options: {
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
    },
  },
  {
    title: "Healthcare Ransomware",
    description: "Tests downtime, patient operations, leadership updates, and recovery decisions.",
    options: {
      industry: "Healthcare",
      organizationSize: "101-500",
      scenarioType: "Ransomware",
      maturityLevel: "Intermediate",
      exerciseDuration: "90 minutes",
      includeExecutiveQuestions: true,
      includeTechnicalQuestions: true,
      includeComplianceQuestions: true,
      includeLessonsLearned: true,
      hasHumanFacilitator: false,
    },
  },
  {
    title: "School Data Breach",
    description: "A student or staff data exposure scenario for education teams.",
    options: {
      industry: "Education",
      organizationSize: "501-1000",
      scenarioType: "Data Exfiltration",
      maturityLevel: "Basic",
      exerciseDuration: "60 minutes",
      includeExecutiveQuestions: true,
      includeTechnicalQuestions: false,
      includeComplianceQuestions: true,
      includeLessonsLearned: true,
      hasHumanFacilitator: false,
    },
  },
  {
    title: "MSP Client Compromise",
    description: "A third-party incident focused on client impact and shared responsibility.",
    options: {
      industry: "MSP / IT Provider",
      organizationSize: "26-100",
      scenarioType: "Vendor / Third-Party Breach",
      maturityLevel: "Intermediate",
      exerciseDuration: "90 minutes",
      includeExecutiveQuestions: true,
      includeTechnicalQuestions: true,
      includeComplianceQuestions: true,
      includeLessonsLearned: true,
      hasHumanFacilitator: true,
    },
  },
  {
    title: "Lost Laptop / HIPAA",
    description: "A low-friction privacy and evidence-handling exercise.",
    options: {
      industry: "Healthcare",
      organizationSize: "26-100",
      scenarioType: "Lost or Stolen Laptop",
      maturityLevel: "Basic",
      exerciseDuration: "30 minutes",
      includeExecutiveQuestions: true,
      includeTechnicalQuestions: false,
      includeComplianceQuestions: true,
      includeLessonsLearned: true,
      hasHumanFacilitator: false,
    },
  },
];

export function ExerciseForm() {
  const router = useRouter();
  const [options, setOptions] = useState<ExerciseOptions>(defaultOptions);
  const [exercise, setExercise] = useState<GeneratedExercise | null>(null);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [irpNotice, setIrpNotice] = useState("");

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

  function applyTemplate(template: (typeof exerciseTemplates)[number]) {
    setOptions((current) => ({ ...current, ...template.options }));
    setError("");
    setSavedNotice(`${template.title} template applied. Adjust anything before generating.`);
  }

  function handleGenerate() {
    if (!canGenerate) {
      setError("Enter an organization name with at least two characters.");
      return;
    }

    const generated = generateExercise(options);
    setExercise(generated);
    saveExercise(generated);
    setSavedNotice("Exercise generated and saved in this browser.");
    router.push(`/session?id=${encodeURIComponent(generated.id)}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
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
          <section className="space-y-3 rounded-lg border border-primary/25 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-1 size-5 text-primary" suppressHydrationWarning />
              <div>
                <h2 className="text-sm font-semibold">Start with a preset</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Pick a common tabletop and adjust the details. This is the fastest path for new users.
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              {exerciseTemplates.map((template) => (
                <button
                  key={template.title}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="rounded-md border border-border bg-background/65 p-3 text-left transition hover:border-primary/50 hover:bg-background"
                >
                  <span className="text-sm font-medium">{template.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{template.description}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="space-y-2">
            <Label htmlFor="organizationName">Organization name</Label>
            <Input
              id="organizationName"
              value={options.organizationName}
              onChange={(event) => updateOption("organizationName", event.target.value)}
              placeholder="Example: Acme Family Clinic"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Industry" value={options.industry} values={industries} onChange={(value) => updateOption("industry", value)} />
            <SelectField
              label="Organization size"
              value={options.organizationSize}
              values={organizationSizes}
              onChange={(value) => updateOption("organizationSize", value)}
            />
          </div>

          <SelectField
            label="Scenario type"
            value={options.scenarioType}
            values={scenarioTypes}
            onChange={(value) => updateOption("scenarioType", value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Maturity level"
              value={options.maturityLevel}
              values={maturityLevels}
              onChange={(value) => updateOption("maturityLevel", value)}
            />
            <SelectField
              label="Exercise duration"
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
              id="facilitator"
              label="A human facilitator will run this exercise"
              description={
                options.hasHumanFacilitator
                  ? "TabletopForge will give the facilitator scripts, prompts, and injects to use with the group."
                  : "TabletopForge will act as the facilitator and speak directly to participants during the session."
              }
              checked={options.hasHumanFacilitator}
              onCheckedChange={(checked) => updateOption("hasHumanFacilitator", checked)}
            />
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

          <Button className="w-full" size="lg" onClick={handleGenerate}>
            <Wand2 className="size-4" suppressHydrationWarning />
            Generate Tabletop Exercise
          </Button>
        </CardContent>
      </Card>

      <ExerciseOutput exercise={exercise} emptyTitle="Your generated exercise will appear here" />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as T)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
