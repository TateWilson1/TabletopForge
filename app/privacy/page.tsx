import { LockKeyhole, ServerOff, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const privacySections = [
  {
    title: "Account Storage",
    text: "Generated tabletop packages may be stored in PostgreSQL so they can be tied to your account, free generation, paid credits, or subscription status.",
    icon: ShieldCheck,
  },
  {
    title: "IRP Contents",
    text: "Uploaded or pasted IRP text is used in the browser to shape the exercise. Raw IRP contents should not be stored in PostgreSQL.",
    icon: ServerOff,
  },
  {
    title: "AI Mode",
    text: "AI features are controlled by the backend, use server-side API keys only, and can be disabled until billing, limits, and user consent are ready.",
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
          TabletopForge is designed to avoid storing raw IRP contents while still keeping generated tabletop records tied to user accounts.
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
