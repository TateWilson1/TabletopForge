import { AccountPanel } from "@/components/AccountPanel";

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Account</h1>
        <p className="mt-3 text-muted-foreground">
          Sign in, track your free tabletop generation, and manage paid tabletop access.
        </p>
      </div>
      <AccountPanel />
    </main>
  );
}
