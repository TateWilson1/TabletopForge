import { SessionRunner } from "@/components/SessionRunner";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <SessionRunner exerciseId={id} />;
}
