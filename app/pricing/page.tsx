import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { AccountPanel } from "@/components/AccountPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "One tabletop generation for a first run or evaluation.",
    features: ["1 free tabletop generation", "Local save and downloadable reports", "Facilitated session flow"],
  },
  {
    name: "Pay Per Tabletop",
    price: "Per exercise",
    description: "Buy individual tabletop generations when you need them.",
    features: ["One additional generation credit", "Use any supported scenario", "Keep running saved sessions"],
  },
  {
    name: "Subscription",
    price: "Monthly",
    description: "Best for teams that run recurring exercises.",
    features: ["10 tabletop generations per month", "AI inject readiness", "Better fit for consultants and MSPs"],
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Pricing</h1>
        <p className="mt-3 text-muted-foreground">
          Start with one free tabletop. After that, buy individual tabletop credits or use a capped monthly subscription.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className="bg-card/80">
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <p className="pt-3 text-2xl font-semibold text-foreground">{plan.price}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 text-primary" suppressHydrationWarning />
                  <span>{feature}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-card/75">
          <CardHeader>
            <CardTitle>Ready To Generate?</CardTitle>
            <CardDescription>
              Sign in on the account panel, then generate your first tabletop or choose a paid option.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/generate">Generate A Tabletop</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/refunds">Refund Notes</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <AccountPanel />
      </div>
    </main>
  );
}
