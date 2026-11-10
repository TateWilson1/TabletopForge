"use client";

import { apiFetch, getStoredSessionToken } from "@/lib/account";
import type { AfterActionReport, RoomAction, RoomView, SimRole, Simulation } from "@/lib/sim/types";

export interface RoomSummary {
  id: string;
  joinCode: string;
  title: string;
  status: "lobby" | "running" | "ended";
  maxParticipants: number;
}

export interface RoomSnapshot {
  room: RoomSummary;
  version: number;
  view: RoomView;
}

export interface RoomListItem {
  id: string;
  joinCode: string;
  title: string;
  status: "lobby" | "running" | "ended";
  createdAt: string;
  endedAt: string | null;
  score: number | null;
  tier: string | null;
  scenarioType: string | null;
  organization: string | null;
  participantCount: number;
}

export interface RoomLookup {
  room: RoomSummary;
  organization: string;
  scenarioType: string;
  facilitatorName: string;
  roles: Array<SimRole & { takenBy: string[] }>;
  full: boolean;
}

const seatKey = (roomId: string) => `tabletopforge.roomSeat.${roomId}`;

export function getRoomSeatToken(roomId: string) {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(seatKey(roomId)) ?? "";
}

// A participant seat token wins; otherwise the caller is the signed-in facilitator.
function credentials(roomId: string): { auth?: boolean; roomToken?: string } {
  const roomToken = getRoomSeatToken(roomId);
  return roomToken ? { roomToken } : { auth: true };
}

export function hasRoomAccess(roomId: string) {
  return Boolean(getRoomSeatToken(roomId) || getStoredSessionToken());
}

export async function createRoom(simulation: Simulation, options: { facilitatorName?: string; tabletopId?: string } = {}) {
  return apiFetch<RoomSnapshot>("/api/rooms", { method: "POST", auth: true, body: JSON.stringify({ simulation, ...options }) });
}

export async function listRooms() {
  const result = await apiFetch<{ rooms: RoomListItem[] }>("/api/rooms", { method: "GET", auth: true });
  return result.rooms ?? [];
}

export async function deleteRoom(roomId: string) {
  return apiFetch<{ ok: boolean }>(`/api/rooms/${roomId}`, { method: "DELETE", auth: true });
}

export async function lookupRoom(code: string) {
  return apiFetch<RoomLookup>(`/api/rooms/lookup?code=${encodeURIComponent(code)}`, { method: "GET" });
}

export async function joinRoom(code: string, name: string, roleId: string) {
  const result = await apiFetch<RoomSnapshot & { participantToken: string }>("/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({ code, name, roleId }),
  });
  window.localStorage.setItem(seatKey(result.room.id), result.participantToken);
  return result;
}

export async function fetchRoomState(roomId: string, knownVersion?: number) {
  const query = knownVersion === undefined ? "" : `?v=${knownVersion}`;
  return apiFetch<RoomSnapshot | { version: number; unchanged: true }>(`/api/rooms/${roomId}/state${query}`, {
    method: "GET",
    ...credentials(roomId),
  });
}

export async function sendRoomAction(roomId: string, action: RoomAction) {
  return apiFetch<RoomSnapshot>(`/api/rooms/${roomId}/actions`, { method: "POST", ...credentials(roomId), body: JSON.stringify({ action }) });
}

export async function fetchRoomReport(roomId: string) {
  return apiFetch<{ report: AfterActionReport; markdown: string }>(`/api/rooms/${roomId}/report`, { method: "GET", ...credentials(roomId) });
}

export async function requestRoomCurveball(roomId: string, hint: string) {
  return apiFetch<RoomSnapshot>(`/api/rooms/${roomId}/curveball`, { method: "POST", auth: true, body: JSON.stringify({ hint }) });
}

export async function requestRoomNarrative(roomId: string) {
  return apiFetch<{ report: AfterActionReport; markdown: string }>(`/api/rooms/${roomId}/report/narrative`, { method: "POST", auth: true, body: "{}" });
}
