import { cn } from "@/lib/utils";
import { YouTubeMusicIcon } from "./YouTubeConnectionPopup";

/*
 * The accent bloom, as a lightweight hardware-accelerated radial gradient.
 */
const LOADING_GLOW =
  "radial-gradient(circle, color-mix(in oklab, var(--color-primary) 14%, transparent) 0%, color-mix(in oklab, #ff0000 8%, transparent) 40%, transparent 70%)";

const LOADING_LINES = [
  "Connecting to YouTube Music...",
  "Tuning the soundstage...",
  "Syncing your music engine...",
  "Loading high-fidelity audio...",
  "Building today's vibe...",
];

interface AppLoadingScreenProps {
  isLeaving: boolean;
}

export function AppLoadingScreen({ isLeaving }: AppLoadingScreenProps) {
  const loadingLine = LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] grid place-items-center bg-background transition-opacity duration-200 select-none",
        isLeaving ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      role="status"
      aria-label="Loading"
      aria-live="polite"
    >
      {/* Accent bloom behind the mark */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: LOADING_GLOW }}
      />

      <div className="relative flex flex-col items-center gap-6">
        {/* Emblem container */}
        <div className="relative flex items-center justify-center">
          <div
            className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-b from-[#222] to-[#111] border border-white/15 shadow-[0_10px_35px_rgba(255,0,0,0.25)]"
          >
            <YouTubeMusicIcon size={44} className="drop-shadow-lg" />
            <span className="absolute -inset-1 rounded-3xl border border-red-500/30 animate-pulse pointer-events-none" />
          </div>
        </div>

        {/* Live Loading Badge */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3.5 py-1">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
            <span className="text-xs font-semibold text-foreground tracking-tight">
              {loadingLine}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-muted-foreground/70">
            <span className="text-red-500">YouTube Music Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
}
