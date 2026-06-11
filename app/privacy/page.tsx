import { LockKeyhole, ServerOff, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const privacySections = [
  {
    title: "Local-Only By Default",
    text: "Generated exercises, IRP text, notes, injects, and scorecards are stored in this browser unless you export or delete them.",
    icon: ShieldCheck,
  },
  {
    title: "No AI Backend Enabled",
    text: "The current public version does not send IRPs or session notes to an AI service. AI controls are placeholders for a future opt-in mode.",
    icon: ServerOff,
  },
  {
    title: "Future AI Mode",
    text: "If AI is added later, it should use a backend service, hidden API keys, access controls, rate limits, and clear user consent before sending session content.",
    icon: Sparkles,
  },
  {
    title: "Sensitive Documents",
    text: "Incident response plans can contain confidential contacts, systems, vendors, and procedures. Review exports before sharing them.",
    icon: LockKeyhole,
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Privacy And AI Readiness</h1>
        <p className="mt-3 text-muted-foreground">
          TabletopForge is designed to keep sensitive tabletop material local unless a future AI mode is explicitly enabled.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {privacySections.map((section) => (
          <Card key={section.title} className="bg-card/75">
            <CardHeader>
              <section.icon className="mb-3 size-6 text-primary" suppressHydrationWarning />
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
