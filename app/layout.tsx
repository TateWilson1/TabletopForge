import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TabletopForge",
  description: "Run realistic, role-based incident response tabletop exercises with your team and get an audit-ready after-action report.",
  other: {
    "darkreader-lock": "",
  },
};

const navItems = [
  { href: "/demo", label: "Live demo" },
  { href: "/generate", label: "New exercise" },
  { href: "/saved", label: "My exercises" },
  { href: "/join", label: "Join" },
  { href: "/pricing", label: "Pricing" },
  { href: "/account", label: "Account" },
];

const footerItems = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refunds", label: "Refunds" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <div className="signal-grid flex min-h-screen flex-col">
          <header className="site-header sticky top-0 z-40 border-b border-border/70 bg-background/82 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
                <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <ShieldCheck className="size-5" suppressHydrationWarning />
                </span>
                <span>TabletopForge</span>
              </Link>
              <nav className="-mx-1 flex items-center gap-1 overflow-x-auto whitespace-nowrap" aria-label="Main">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          {children}
          <footer className="site-footer mt-16 border-t border-border/70">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <p>TabletopForge — incident response exercises your team will actually run.</p>
              <nav className="flex flex-wrap gap-4" aria-label="Footer">
                {footerItems.map((item) => (
                  <Link key={item.href} href={item.href} className="hover:text-foreground">
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
