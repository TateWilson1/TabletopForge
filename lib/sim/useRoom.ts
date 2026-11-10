"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/account";
import { fetchRoomReport, fetchRoomState, requestRoomCurveball, requestRoomNarrative, sendRoomAction } from "@/lib/rooms";
import type { RoomSummary } from "@/lib/rooms";
import { applyAction, buildAfterActionReport, buildReportMarkdown, buildView, createInitialState } from "@/lib/sim";
import type { AfterActionReport, RoomAction, RoomState, RoomView, Simulation } from "@/lib/sim/types";

// One interface for the live room UI, whether the exercise runs in this browser (solo, demo)
// or on the server with a full team.
export interface RoomController {
  mode: "local" | "remote";
  view: RoomView | null;
  room: RoomSummary | null;
  loading: boolean;
  /** Fatal: the room cannot be shown (not found, no access). */
  fatalError: string;
  /** Recoverable: the last action was rejected. */
  actionError: string;
  busy: boolean;
  offline: boolean;
  report: AfterActionReport | null;
  markdown: string;
  dispatch: (action: RoomAction) => Promise<boolean>;
  clearActionError: () => void;
  reset?: () => void;
  requestCurveball?: (hint: string) => Promise<boolean>;
  requestNarrative?: () => Promise<boolean>;
}

const FACILITATOR = { kind: "facilitator" } as const;
const localKey = (simId: string) => `tabletopforge.liveState.${simId}`;

export function useLocalRoom(sim: Simulation | null, facilitatorName = "You"): RoomController {
  const [state, setState] = useState<RoomState | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!sim) {
      setState(null);
      return;
    }
    let restored: RoomState | null = null;
    try {
      const raw = window.localStorage.getItem(localKey(sim.id));
      restored = raw ? (JSON.parse(raw) as RoomState) : null;
      // Make sure a stale saved state still fits this simulation.
      if (restored) {
        buildView(sim, restored, FACILITATOR);
      }
    } catch {
      restored = null;
    }
    setState(restored ?? createInitialState(sim, { facilitatorName }));
  }, [sim, facilitatorName]);

  const dispatch = useCallback(
    async (action: RoomAction) => {
      if (!sim || !state) {
        return false;
      }
      try {
        const next = applyAction(sim, state, action, FACILITATOR);
        setState(next);
        setActionError("");
        try {
          window.localStorage.setItem(localKey(sim.id), JSON.stringify(next));
        } catch {
          // Storage full or unavailable: the exercise still runs in memory.
        }
        return true;
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "That action is not available.");
        return false;
      }
    },
    [sim, state],
  );

  const reset = useCallback(() => {
    if (!sim) {
      return;
    }
    window.localStorage.removeItem(localKey(sim.id));
    setState(createInitialState(sim, { facilitatorName }));
    setActionError("");
  }, [sim, facilitatorName]);

  const view = useMemo(() => (sim && state ? buildView(sim, state, FACILITATOR) : null), [sim, state]);
  const report = useMemo(() => (sim && state?.status === "ended" ? buildAfterActionReport(sim, state) : null), [sim, state]);
  const markdown = useMemo(() => (report ? buildReportMarkdown(report) : ""), [report]);

  return {
    mode: "local",
    view,
    room: null,
    loading: !view,
    fatalError: "",
    actionError,
    busy: false,
    offline: false,
    report,
    markdown,
    dispatch,
    clearActionError: () => setActionError(""),
    reset,
  };
}

const POLL_VISIBLE_MS = 2000;
const POLL_HIDDEN_MS = 8000;

export function useRemoteRoom(roomId: string | null): RoomController {
  const [view, setView] = useState<RoomView | null>(null);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [fatalError, setFatalError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [report, setReport] = useState<AfterActionReport | null>(null);
  const [markdown, setMarkdown] = useState("");
  const versionRef = useRef<number | undefined>(undefined);

  const accept = useCallback((snapshot: { room: RoomSummary; version: number; view: RoomView }) => {
    // Ignore out-of-order responses (a slow poll finishing after a newer action).
    if (versionRef.current !== undefined && snapshot.version < versionRef.current) {
      return;
    }
    versionRef.current = snapshot.version;
    setRoom(snapshot.room);
    setView(snapshot.view);
  }, []);

  useEffect(() => {
    if (!roomId) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    versionRef.current = undefined;
    setView(null);
    setReport(null);
    setFatalError("");

    async function poll() {
      try {
        const result = await fetchRoomState(roomId as string, versionRef.current);
        if (cancelled) {
          return;
        }
        setOffline(false);
        if (!("unchanged" in result)) {
          accept(result);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          setFatalError(error.message);
          return; // Stop polling: retrying will not help.
        }
        setOffline(true);
      }
      timer = setTimeout(poll, document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS);
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [roomId, accept]);

  const ended = view?.status === "ended";
  useEffect(() => {
    if (!roomId || !ended || report) {
      return;
    }
    let cancelled = false;
    fetchRoomReport(roomId)
      .then((result) => {
        if (!cancelled) {
          setReport(result.report);
          setMarkdown(result.markdown);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setActionError(error instanceof Error ? error.message : "Could not load the after-action report.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, ended, report]);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      setActionError("");
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That action failed. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const dispatch = useCallback(
    (action: RoomAction) => run(async () => accept(await sendRoomAction(roomId as string, action))),
    [roomId, run, accept],
  );

  const requestCurveball = useCallback(
    (hint: string) => run(async () => accept(await requestRoomCurveball(roomId as string, hint))),
    [roomId, run, accept],
  );

  const requestNarrative = useCallback(
    () =>
      run(async () => {
        const result = await requestRoomNarrative(roomId as string);
        setReport(result.report);
        setMarkdown(result.markdown);
      }),
    [roomId, run],
  );

  return {
    mode: "remote",
    view,
    room,
    loading: !view && !fatalError,
    fatalError,
    actionError,
    busy,
    offline,
    report,
    markdown,
    dispatch,
    clearActionError: () => setActionError(""),
    requestCurveball,
    requestNarrative,
  };
}
