import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileWarning, GraduationCap, LayoutList, MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Scenario Builder",
    description: "Create incident scenarios for phishing, ransomware, vendor breaches, cloud exposure, and more.",
    icon: FileWarning,
  },
  {
    title: "IRP Gap Questions",
    description: "Surface missing procedures, unclear owners, notification gaps, and weak decision paths.",
    icon: ClipboardCheck,
  },
  {
    title: "Lessons Learned Template",
    description: "Capture what worked, what slowed response, action owners, due dates, and priorities.",
    icon: LayoutList,
  },
  {
    title: "Simple Executive-Friendly Output",
    description: "Produce clear tabletop packages that leadership, IT, and business teams can use together.",
    icon: MessagesSquare,
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
        <div className="space-y-8">
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
            Incident response readiness
          </Badge>
          <div className="space-y-5">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl lg:text-6xl">
              TabletopForge
            </h1>
            <p className="max-w-2xl text-xl leading-8 text-muted-foreground">
              Simple incident response tabletop exercises for real-world readiness.
            </p>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              Generate practical, non-technical tabletop packages that help small businesses, MSPs, IT teams, and cybersecurity students find gaps in their incident response plans.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/generate">
                Generate Exercise <ArrowRight className="size-4" suppressHydrationWarning />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/saved">View Saved Exercises</Link>
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-primary/20 bg-card/80">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <GraduationCap className="size-5" suppressHydrationWarning />
              </div>
              <div>
                <CardTitle>Exercise Package Preview</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Built for process, roles, and decision clarity.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {["Scenario Summary", "Discussion Questions", "IRP Gap Discovery", "Expected Decisions", "Executive Summary"].map(
              (item, index) => (
                <div key={item} className="flex items-center justify-between rounded-md border border-border bg-background/60 p-4">
                  <span className="text-sm font-medium">{item}</span>
                  <span className="rounded-md bg-primary/12 px-2 py-1 text-xs text-primary">0{index + 1}</span>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      </section>

      <section className="border-t border-border/70 bg-background/55 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="bg-card/75">
              <CardHeader>
                <feature.icon className="mb-3 size-6 text-primary" suppressHydrationWarning />
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
