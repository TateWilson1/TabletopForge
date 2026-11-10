"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LiveRoom } from "@/components/live/LiveRoom";
import { Button } from "@/components/ui/button";
import { fetchAccount, getStoredSessionToken } from "@/lib/account";
import { getRoomSeatToken, hasRoomAccess } from "@/lib/rooms";
import { useRemoteRoom } from "@/lib/sim/useRoom";

function Room() {
  const roomId = useSearchParams().get("id");
  const [access, setAccess] = useState<"checking" | "yes" | "no">("checking");
  const [aiEnabled, setAiEnabled] = useState(false);
  const controller = useRemoteRoom(access === "yes" ? roomId : null);

  useEffect(() => {
    if (!roomId) {
      setAccess("no");
      return;
    }
    setAccess(hasRoomAccess(roomId) ? "yes" : "no");
    // Only the signed-in facilitator can use AI assists.
    if (!getRoomSeatToken(roomId) && getStoredSessionToken()) {
      fetchAccount()
        .then((account) => setAiEnabled(Boolean(account.entitlements.roomAiIncluded)))
        .catch(() => setAiEnabled(false));
    }
  }, [roomId]);

  if (access === "no") {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card/85 p-8 text-center">
        <h1 className="text-2xl font-semibold">Join this exercise</h1>
        <p className="mt-3 text-muted-foreground">Enter the room code from your facilitator to take a seat, or sign in if you are the facilitator.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link href="/join">Join with a code</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/account?next=${encodeURIComponent(`/room?id=${roomId ?? ""}`)}`}>Facilitator sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (access === "checking") {
    return null;
  }

  return <LiveRoom controller={controller} aiEnabled={aiEnabled} exitHref={controller.view?.viewer.kind === "facilitator" ? "/account" : "/"} />;
}

export default function RoomPage() {
  return (
    <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-5 lg:px-7">
      <Suspense fallback={null}>
        <Room />
      </Suspense>
    </main>
  );
}
