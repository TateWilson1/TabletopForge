"use client";

import { useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import { ExerciseOutput } from "@/components/ExerciseOutput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
};

export function ExerciseForm() {
  const [options, setOptions] = useState<ExerciseOptions>(defaultOptions);
  const [exercise, setExercise] = useState<GeneratedExercise | null>(null);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");

  const canGenerate = useMemo(() => options.organizationName.trim().length >= 2, [options.organizationName]);

  function updateOption<K extends keyof ExerciseOptions>(key: K, value: ExerciseOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
    setError("");
    setSavedNotice("");
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

          <Button className="w-full" size="lg" onClick={handleGenerate}>
            <Wand2 className="size-4" />
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
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background/55 p-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
    </div>
  );
}
