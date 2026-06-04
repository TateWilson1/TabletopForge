import { AlertTriangle, CheckCircle2, Scale, ShieldQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "What Tabletop Exercises Are",
    text: "A tabletop exercise is a guided discussion where participants walk through a realistic incident and explain what they would do, who would decide, and where the process is documented.",
    icon: ShieldQuestion,
  },
  {
    title: "Why They Matter",
    text: "Exercises reveal unclear escalation paths, missing contact lists, weak communication plans, and recovery assumptions before a real incident forces decisions under pressure.",
    icon: CheckCircle2,
  },
  {
    title: "How TabletopForge Helps",
    text: "TabletopForge quickly creates scenario-based discussion guides, IRP gap-discovery questions, expected decisions, participant roles, and lessons-learned templates.",
    icon: Scale,
  },
  {
    title: "Disclaimer",
    text: "This tool does not replace professional legal, compliance, cybersecurity, or incident response advice. Use it as a readiness planning aid and validate decisions with qualified advisors.",
    icon: AlertTriangle,
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">About TabletopForge</h1>
        <p className="mt-3 text-muted-foreground">
          Practical incident response readiness planning for teams that need useful exercises without complicated injects.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="bg-card/75">
            <CardHeader>
              <section.icon className="mb-3 size-6 text-primary" />
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-7 text-muted-foreground">{section.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
