import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "Use Of TabletopForge",
    text: "TabletopForge helps create incident response tabletop exercises and readiness materials. It is a planning aid, not legal, compliance, cybersecurity, insurance, or incident response advice.",
  },
  {
    title: "Accounts And Billing",
    text: "Each account receives one free tabletop generation. Additional generations require purchased credits or an active subscription. Subscription plans may include monthly generation limits.",
  },
  {
    title: "Sensitive Content",
    text: "Do not upload or paste passwords, API keys, private keys, live credentials, regulated data, or confidential incident details that you are not authorized to process.",
  },
  {
    title: "Availability",
    text: "The service may change, pause, or become unavailable during testing and early launch work. Export important tabletop materials you need to retain.",
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Terms Of Use</h1>
        <p className="mt-3 text-muted-foreground">
          Early product terms for TabletopForge while the SaaS launch foundation is being prepared.
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
