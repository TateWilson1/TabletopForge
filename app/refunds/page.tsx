import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "Test Mode",
    text: "While Stripe is in test mode, no real money is collected. Use Stripe test cards to confirm checkout, webhook, and credit behavior.",
  },
  {
    title: "Pay-Per-Generation",
    text: "For a future live launch, unused purchased generation credits should be eligible for manual review. Used generation credits should generally be treated as consumed once a tabletop is generated.",
  },
  {
    title: "Subscriptions",
    text: "Subscriptions should renew monthly through Stripe. Cancellation should prevent future renewals while preserving access through the paid period when Stripe reports the subscription as active.",
  },
  {
    title: "Support",
    text: "Add a support email before public launch so customers have a clear place to ask billing, refund, or account questions.",
  },
];

export default function RefundsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Refund And Cancellation Notes</h1>
        <p className="mt-3 text-muted-foreground">
          Draft billing policy notes to refine before switching Stripe from test mode to live mode.
        </p>
      </div>
      <div className="grid gap-4">
        {sections.map((section) => (
          <Card key={section.title} className="bg-card/75">
            <CardHeader>
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
