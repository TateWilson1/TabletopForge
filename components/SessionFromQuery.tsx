"use client";

import { useSearchParams } from "next/navigation";
import { SessionRunner } from "@/components/SessionRunner";

export function SessionFromQuery() {
  const searchParams = useSearchParams();
  const exerciseId = searchParams.get("id");

  return <SessionRunner exerciseId={exerciseId} />;
}
