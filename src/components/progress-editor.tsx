"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export type ApprovedRoomProgress = {
  roomId: string;
  name: string;
  details: string;
  paint: string;
  surface: string;
  coats: string;
  isCompleted: boolean;
  completedAt: string | null;
};

export function calculateCompletion(rooms: Pick<ApprovedRoomProgress, "isCompleted">[]) {
  const completedRooms = rooms.filter(room => room.isCompleted).length;
  return {
    completedRooms,
    totalRooms: rooms.length,
    completionPercentage: rooms.length === 0 ? 0 : Math.round((completedRooms / rooms.length) * 100),
  };
}

export function ProgressEditor({ estimateId, initialRooms, initialNotes, canUpdate }: {
  estimateId: string;
  initialRooms: ApprovedRoomProgress[];
  initialNotes: string;
  canUpdate: boolean;
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [notes, setNotes] = useState(initialNotes);
  const [pendingRoom, setPendingRoom] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [message, setMessage] = useState("");
  const progress = useMemo(() => calculateCompletion(rooms), [rooms]);

  async function toggleRoom(room: ApprovedRoomProgress) {
    if (!canUpdate || pendingRoom) return;
    setPendingRoom(room.roomId);
    setMessage("");
    const nextCompleted = !room.isCompleted;
    const { data, error } = await createClient().rpc("set_room_completion_status", {
      target_room: room.roomId,
      completed: nextCompleted,
    });
    setPendingRoom(null);
    if (error) {
      console.error("room_completion_update_failed", { code: error.code, message: error.message });
      setMessage("We could not update this room’s completion status.");
      return;
    }
    const result = data as { completed_at?: string | null } | null;
    setRooms(current => current.map(item => item.roomId === room.roomId ? {
      ...item,
      isCompleted: nextCompleted,
      completedAt: result?.completed_at ?? (nextCompleted ? new Date().toISOString() : null),
    } : item));
    setMessage(nextCompleted ? `${room.name} marked complete.` : `${room.name} marked incomplete.`);
  }

  async function saveNotes() {
    if (!canUpdate || savingNotes) return;
    setSavingNotes(true);
    setMessage("Saving notes…");
    const { error } = await createClient().rpc("update_estimate_progress_notes", {
      target_estimate: estimateId,
      notes,
    });
    setSavingNotes(false);
    if (error) {
      console.error("progress_notes_update_failed", { code: error.code, message: error.message });
      setMessage("We could not update the project notes.");
      return;
    }
    setMessage("Progress notes updated.");
  }

  return <section className="rounded-xl border border-border bg-surface p-5">
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-xl font-semibold">Project Progress</h2>
      <strong className="font-mono text-xl">{progress.completionPercentage}%</strong>
    </div>
    <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`${progress.completedRooms} of ${progress.totalRooms} rooms completed`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.completionPercentage}>
      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress.completionPercentage}%` }}/>
    </div>
    <p className="mt-2 text-sm text-muted">{progress.completedRooms} of {progress.totalRooms} rooms completed</p>
    <div className="mt-5 space-y-3">
      {rooms.map(room => <article key={room.roomId} className="rounded-lg bg-background p-4">
        <label className="flex min-h-11 items-start gap-3 font-semibold">
          <input type="checkbox" checked={room.isCompleted} disabled={!canUpdate || pendingRoom === room.roomId} onChange={() => toggleRoom(room)} aria-label={`Mark ${room.name} ${room.isCompleted ? "incomplete" : "complete"}`} className="mt-1 size-5 accent-emerald-700"/>
          <span>{room.name}{pendingRoom === room.roomId && <span className="ml-2 text-xs font-normal text-muted">Saving…</span>}</span>
        </label>
        <p className="text-sm">{room.details}</p>
        <p className="text-sm text-muted">{room.paint}</p>
        <p className="text-xs text-muted">{room.surface} · {room.coats} coats{room.completedAt ? ` · Completed ${new Date(room.completedAt).toLocaleString()}` : ""}</p>
      </article>)}
    </div>
    <label className="mt-5 block text-sm font-medium">Progress notes<textarea value={notes} disabled={!canUpdate} onChange={event => setNotes(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border p-3 disabled:bg-slate-100"/></label>
    {canUpdate && <button type="button" onClick={saveNotes} disabled={savingNotes} className="mt-4 min-h-11 rounded-lg bg-brand px-4 font-semibold text-white disabled:opacity-60">{savingNotes ? "Saving…" : "Save Progress Notes"}</button>}
    {!canUpdate && <p className="mt-3 text-sm text-muted">You have read-only access to project progress.</p>}
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </section>;
}
