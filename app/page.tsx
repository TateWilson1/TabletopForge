import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck, FileSearch, GitBranch, Lock, Play, ShieldAlert, Sparkles, Timer, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  { title: "Describe your organization", text: "Industry, size, scenario, and your incident response plan if you have one. No plan yet? The exercise helps you draft one." },
  { title: "Invite the team", text: "Share a six-character code. Everyone joins from their own device and takes the role closest to their real job. No accounts to create." },
  { title: "Work the incident", text: "Alerts, emails, calls, and reporter inquiries arrive the way they really do. The team argues, votes, and commits. Choices have consequences." },
  { title: "Leave with a report", text: "A scored after-action report with findings, owners, and deadlines — ready for leadership, your auditor, or your cyber insurer." },
];

const features = [
  { icon: Lock, title: "Not everyone sees everything", text: "The SIEM alert goes to IT. The reporter emails Communications. Just like a real incident, the team has to brief each other — and you find out whether they do." },
  { icon: GitBranch, title: "Decisions change the story", text: "Delay containment and the ransomware reaches your backups. Reassure the press too early and it comes back in the next headline. Every exercise can play out differently." },
  { icon: Users, title: "Real decision authority", text: "Everyone votes, but each decision belongs to a role. See what happens when the Incident Commander has to commit while the room is split." },
  { icon: ClipboardCheck, title: "Audit-ready after-action report", text: "Capability scores, prioritized findings with owners and due dates, a decision log, and NIST CSF 2.0 mapping. Export to PDF, Markdown, or JSON." },
  { icon: FileSearch, title: "Built around your plan", text: "Upload your incident response plan and the exercise targets its weak and missing sections, using the roles your plan actually names." },
  { icon: Sparkles, title: "AI where it helps", text: "AI tailors scenarios to your organization, throws curveballs on request, and writes the executive analysis. A curated scenario library means it always works without it." },
];

const evidence = ["SOC 2 CC7.4 / CC7.5", "PCI DSS 12.10.2", "HIPAA 164.308(a)(7)", "ISO 27001 A.5.24–5.27", "NIST CSF 2.0 ID.IM-02", "Cyber insurance renewals"];

function ProductPreview() {
  return (
    <div className="rounded-xl border border-primary/25 bg-card/85 p-4 shadow-signal sm:p-5" aria-hidden="true">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Ransomware outbreak at Northwind Health</p>
        <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Containment</span>
      </div>
      <div className="mb-4 grid grid-cols-4 gap-3">
        {[
          ["Containment", 70, "bg-emerald-400"],
          ["Operations", 46, "bg-amber-400"],
          ["Trust", 63, "bg-emerald-400"],
          ["Regulatory", 38, "bg-red-400"],
        ].map(([label, value, tone]) => (
          <div key={label as string}>
            <p className="truncate text-[11px] text-muted-foreground">{label}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-300">
          <ShieldAlert className="size-3.5" /> Security alert
        </span>
        <span className="rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground">T+0:00</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent">
          <Lock className="size-3" /> Sent only to IT / Security Lead
        </span>
      </div>
      <div className="rounded-md border border-red-400/25 bg-black/40 p-3 font-mono text-xs leading-5 text-red-100/90">
        <p className="font-semibold text-red-200">CRITICAL: mass file modification on FILESRV01</p>
        <p className="mt-1">4,200 files renamed with a .lockd extension in six minutes. Shadow copies deleted. Running under svc-backup.</p>
      </div>
      <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Zap className="size-3" /> Decision required
          </p>
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
            <Timer className="size-3" /> 0m 48s left
          </span>
        </div>
        <p className="mt-1.5 text-sm font-semibold">IT has minutes, not hours. What is the first move?</p>
        <div className="mt-2 space-y-1.5 text-xs">
          <p className="rounded-md border border-primary bg-primary/10 px-2.5 py-2">A · Declare an incident, page the commander, isolate the hosts</p>
          <p className="rounded-md border border-border px-2.5 py-2 text-muted-foreground">B · Isolate the hosts and keep investigating first</p>
          <p className="rounded-md border border-border px-2.5 py-2 text-muted-foreground">C · Reboot the file server and see if it clears</p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            Incident response tabletop exercises
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Find out how your team handles a breach <span className="text-primary">before you have one.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            TabletopForge runs a realistic cyber incident with your whole team in under an hour. Each person plays their real role, decisions have consequences,
            and you leave with an after-action report your auditor and insurer will accept.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/demo">
                <Play /> Try the live demo
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/generate">
                Build your first exercise free <ArrowRight />
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">The demo needs no account. Your first tailored exercise is free.</p>
        </div>
        <ProductPreview />
      </section>

      <section className="border-y border-border/70 bg-background/55 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-md text-sm font-medium text-foreground">
            Most frameworks and insurers expect you to test your incident response plan every year. One exercise produces evidence that supports:
          </p>
          <ul className="flex flex-wrap gap-2">
            {evidence.map((item) => (
              <li key={item} className="rounded-md border border-border bg-card/70 px-3 py-1.5 text-sm text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-semibold tracking-tight">From nothing to a finished exercise in one meeting</h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-border bg-card/75 p-5">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border/70 bg-background/55 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight">A slide deck asks what you would do. This makes you do it.</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-lg border border-border bg-card/75 p-5">
                <feature.icon className="size-6 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-xl border border-primary/30 bg-card/80 p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Built for teams without a full-time exercise planner</h2>
            <ul className="mt-5 space-y-3 text-[15px] leading-7 text-muted-foreground">
              {[
                "Small and mid-sized organizations that need to test their plan this year",
                "MSPs and consultants running exercises for many clients",
                "IT and security leads who have to prove readiness to leadership",
                "Eight scenarios, from ransomware and BEC to insider threat and vendor breach",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="mt-1.5 size-4 shrink-0 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <Button asChild size="lg">
              <Link href="/demo">
                <Play /> Try the live demo
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
