import { useEffect, useState } from "react";

/** Shared 1-second clock so every timer on the board ticks together. */
const listeners = new Set<(n: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    listeners.add(setNow);
    if (!timer) timer = setInterval(() => listeners.forEach((l) => l(Date.now())), 1000);
    return () => {
      listeners.delete(setNow);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return now;
}

/** "45s", "12m", "3h 05m", "2d 4h" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export type EtaState = { label: string; tone: "ok" | "soon" | "late" } | null;

/** ETA countdown; "soon" inside 15 minutes, "late" once past due. */
export function etaState(etaIso: string | null, now: number): EtaState {
  if (!etaIso) return null;
  const diff = Math.floor((new Date(etaIso).getTime() - now) / 1000);
  if (diff < 0) return { label: `${formatDuration(-diff)} late`, tone: "late" };
  return { label: `due in ${formatDuration(diff)}`, tone: diff <= 15 * 60 ? "soon" : "ok" };
}
