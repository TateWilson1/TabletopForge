import type { Metadata } from "next";
import { AdminConsole } from "@/components/AdminConsole";

export const metadata: Metadata = {
  title: "Operations Console | TabletopForge",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OperationsConsolePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminConsole />
    </main>
  );
}
