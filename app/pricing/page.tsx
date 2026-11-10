import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Display prices come from the build environment so the page can never drift from what Stripe
// actually charges. When unset, the plan is shown without a number.
const tabletopPrice = process.env.NEXT_PUBLIC_PRICE_TABLETOP;
const subscriptionPrice = process.env.NEXT_PUBLIC_PRICE_SUBSCRIPTION;

const plans = [
  {
    name: "Free trial",
    price: "$0",
    cadence: "",
    description: "Run one complete exercise with your team and keep the report.",
    cta: { label: "Start free", href: "/generate" },
    featured: false,
    features: [
      "1 tailored exercise",
      "Live team room for up to 5 participants",
      "Solo and projector mode",
      "IRP gap analysis or starter IRP",
      "Full after-action report (PDF, Markdown, JSON)",
    ],
  },
  {
    name: "Team",
    price: subscriptionPrice || "Subscription",
    cadence: subscriptionPrice ? "per month" : "billed monthly",
    description: "For organizations and MSPs that exercise regularly.",
    cta: { label: "Subscribe", href: "/account" },
    featured: true,
    features: [
      "10 tailored exercises every month",
      "Live team rooms for up to 30 participants",
      "AI-tailored scenarios, curveballs, and executive analysis",
      "Exercise history with stored reports",
      "Everything in the free trial",
    ],
  },
  {
    name: "Single exercise",
    price: tabletopPrice || "Pay as you go",
    cadence: tabletopPrice ? "per exercise" : "one-time purchase",
    description: "For the annual test your auditor or insurer asks for.",
    cta: { label: "Buy one exercise", href: "/account" },
    featured: false,
    features: ["1 additional tailored exercise", "Any scenario and maturity level", "Live team room for up to 5 participants", "Never expires", "No subscription"],
  },
];

const faqs = [
  {
    question: "Do participants need accounts?",
    answer: "No. Only the facilitator signs in. Everyone else joins with a six-character room code and their name.",
  },
  {
    question: "What counts as one exercise?",
    answer: "Generating a tailored exercise package for an organization and scenario. You can run it as many times as you like, solo or with a team.",
  },
  {
    question: "What happens to our incident response plan?",
    answer: "If you upload one, its text is used to tailor the exercise and identify gaps. The raw document is not stored. See the privacy page for details.",
  },
  {
    question: "Is the report accepted as compliance evidence?",
    answer:
      "It documents who took part, what was tested, the decisions made, and the improvements identified — the evidence auditors and insurers typically ask for. It is supporting evidence, not a certification.",
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Start free. Pay when it is part of your program.</h1>
        <p className="mt-4 text-lg text-muted-foreground">Your first exercise is free, including the team room and the full after-action report.</p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <section key={plan.name} className={`flex flex-col rounded-xl border p-6 ${plan.featured ? "border-primary/50 bg-card shadow-signal" : "border-border bg-card/80"}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              {plan.featured ? <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Best value</span> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.description}</p>
            <p className="mt-5 text-3xl font-semibold text-foreground">
              {plan.price} {plan.cadence ? <span className="text-sm font-normal text-muted-foreground">{plan.cadence}</span> : null}
            </p>
            <ul className="mt-5 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-6" variant={plan.featured ? "default" : "outline"} size="lg">
              <Link href={plan.cta.href}>{plan.cta.label}</Link>
            </Button>
          </section>
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Purchases are completed from your account page through Stripe. See the <Link href="/refunds" className="underline hover:text-foreground">refund policy</Link>.
      </p>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-2xl font-semibold">Questions</h2>
        <dl className="mt-6 space-y-6">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold">{faq.question}</dt>
              <dd className="mt-2 text-[15px] leading-7 text-muted-foreground">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
