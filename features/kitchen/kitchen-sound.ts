export type AlertKind = "STANDARD" | "PUFFS" | "BELL";

export function playKitchenAlert(kind: AlertKind): void {
  if (typeof window === "undefined") return;

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  const notes =
    kind === "BELL"
      ? [
          [880, 0, 0.15],
          [660, 0.14, 0.16],
          [880, 0.3, 0.28],
        ]
      : kind === "PUFFS"
        ? [
            [430, 0, 0.18],
            [330, 0.2, 0.25],
          ]
        : [
            [620, 0, 0.14],
            [790, 0.16, 0.24],
          ];

  notes.forEach(([frequency, start, duration]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "BELL" ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime + start);
    oscillator.stop(context.currentTime + start + duration + 0.02);
  });

  window.setTimeout(() => void context.close(), 900);
}
