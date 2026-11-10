"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchStoredTabletop, type AccountTabletop } from "@/lib/account";
import { deleteRoom, listRooms, type RoomListItem } from "@/lib/rooms";
import { saveExercise } from "@/lib/storage";

const STATUS_LABEL: Record<RoomListItem["status"], string> = { lobby: "Not started", running: "In progress", ended: "Completed" };

// Everything the account owns on the server: generated exercises and team rooms (with reports).
export function AccountLibrary({ tabletops }: { tabletops: AccountTabletop[] }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState("");

  useEffect(() => {
    listRooms()
      .then(setRooms)
      .catch(() => setRooms([]));
  }, []);

  // Exercises live on the server, so they can be reopened from any device.
  async function openTabletop(tabletopId: string) {
    setOpeningId(tabletopId);
    setError("");
    try {
      const stored = await fetchStoredTabletop(tabletopId);
      saveExercise({ ...stored.exercise, id: stored.tabletopId });
      router.push(`/session?id=${stored.tabletopId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open that exercise.");
      setOpeningId("");
    }
  }

  async function removeRoom(room: RoomListItem) {
    if (!window.confirm(`Delete "${room.title}" and its report? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteRoom(room.id);
      setRooms((current) => current.filter((item) => item.id !== room.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that room.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border bg-background/45 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Team exercises and reports</h3>
        </div>
        {rooms.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Open an exercise and choose “Invite your team” to run it live. Completed exercises and their after-action reports are kept here.
          </p>
        ) : (
          <ul className="space-y-2">
            {rooms.map((room) => (
              <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/55 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{room.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {STATUS_LABEL[room.status]} · {room.participantCount} participant{room.participantCount === 1 ? "" : "s"} ·{" "}
                    {new Date(room.createdAt).toLocaleDateString()}
                    {room.score !== null ? ` · Readiness ${room.score}/100 (${room.tier})` : ` · Code ${room.joinCode}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild size="sm" variant={room.status === "ended" ? "outline" : "default"}>
                    <Link href={`/room?id=${room.id}`}>{room.status === "ended" ? "View report" : "Open room"}</Link>
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${room.title}`} onClick={() => removeRoom(room)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-border bg-background/45 p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Your exercises</h3>
        </div>
        {tabletops.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">Generated exercises appear here and can be reopened from any device.</p>
        ) : (
          <ul className="space-y-2">
            {tabletops.slice(0, 12).map((tabletop) => (
              <li key={tabletop.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/55 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{tabletop.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {[tabletop.scenarioType, tabletop.industry, tabletop.maturityLevel].filter(Boolean).join(" · ") || "Tabletop exercise"} ·{" "}
                    {new Date(tabletop.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={openingId === tabletop.id} onClick={() => openTabletop(tabletop.id)}>
                  {openingId === tabletop.id ? "Opening…" : "Open"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
