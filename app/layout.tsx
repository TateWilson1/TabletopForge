import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TabletopForge",
  description: "Simple incident response tabletop exercises for real-world readiness.",
  other: {
    "darkreader-lock": "",
  },
};

const navItems = [
  { href: "/", label: "Home" },
  { href: "/generate", label: "Generate" },
  { href: "/saved", label: "Saved" },
  { href: "/pricing", label: "Pricing" },
  { href: "/account", label: "Account" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <div className="signal-grid min-h-screen">
          <header className="sticky top-0 z-40 border-b border-border/70 bg-background/82 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
                <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <ShieldCheck className="size-5" suppressHydrationWarning />
                </span>
                <span>TabletopForge</span>
              </Link>
              <nav className="flex flex-wrap items-center justify-end gap-1">
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
        </div>
      </body>
    </html>
  );
}
