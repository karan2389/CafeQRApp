import { playKitchenAlert } from "@/features/kitchen/kitchen-sound";

export type KitchenVoiceKind =
  | "NEW_ORDER"
  | "CALL_STAFF"
  | "REQUEST_WATER"
  | "REQUEST_BILL"
  | "REQUEST_ASSISTANCE"
  | "PENDING_ORDER"
  | "UNANSWERED_REQUEST";

export interface ReminderCandidate {
  key: string;
  kind: "PENDING_ORDER" | "UNANSWERED_REQUEST";
  status: string;
  createdAt: string;
  tableNumber: number | string | null;
}

export const REMINDER_AFTER_MS = 10 * 60 * 1000;
export const REMINDER_REPEAT_MS = 5 * 60 * 1000;

/** Choose one waiting item at a time, oldest first, so a busy queue stays audible. */
export function selectPendingReminder(
  candidates: ReminderCandidate[],
  lastSpokenAt: ReadonlyMap<string, number>,
  now: number,
): ReminderCandidate | null {
  return [...candidates]
    .filter((candidate) => {
      const waiting = candidate.kind === "PENDING_ORDER"
        ? candidate.status === "NEW" || candidate.status === "PENDING"
        : candidate.status === "OPEN";
      const created = Date.parse(candidate.createdAt);
      const previous = lastSpokenAt.get(candidate.key);
      return waiting && Number.isFinite(created) && now - created >= REMINDER_AFTER_MS
        && (previous === undefined || now - previous >= REMINDER_REPEAT_MS);
    })
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0] ?? null;
}

const maxQueuedVoices = 8;
const pending: string[] = [];
let active: HTMLAudioElement | null = null;

function playNext(): void {
  if (active || !pending.length || typeof window === "undefined") return;
  const source = pending.shift();
  if (!source) return;
  const audio = new Audio(source);
  audio.preload = "auto";
  active = audio;

  const finish = (fallback: boolean) => {
    if (active !== audio) return;
    audio.onended = null;
    audio.onerror = null;
    active = null;
    if (fallback) playKitchenAlert("BELL");
    playNext();
  };
  audio.onended = () => finish(false);
  audio.onerror = () => finish(true);
  void audio.play().catch(() => finish(true));
}

/** Returns false only if the voice queue is full; unsupported tables use the existing bell. */
export function playKitchenVoiceAlert(kind: KitchenVoiceKind, tableNumber: number | string | null): boolean {
  if (typeof window === "undefined") return false;
  const table = Number(tableNumber);
  if (!Number.isInteger(table) || table < 1 || table > 6) {
    playKitchenAlert("BELL");
    return true;
  }
  if (pending.length >= maxQueuedVoices) return false;
  pending.push(`/audio/kitchen/${kind.toLowerCase()}_table_${table}.mp3`);
  playNext();
  return true;
}

/** Muting must also stop a voice that has already started. */
export function stopKitchenVoiceAlerts(): void {
  pending.length = 0;
  if (active) {
    const audio = active;
    active = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.currentTime = 0;
  }
}
