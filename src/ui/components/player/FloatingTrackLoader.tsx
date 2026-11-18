import { memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SpinnerSteps } from "@/components/motion/loader";
import { usePlayerSelector, shallowEqual } from "../../../player/playerStore";

export const FloatingTrackLoader = memo(function FloatingTrackLoader() {
  const { status, currentTrack } = usePlayerSelector(
    (player) => ({
      status: player.status,
      currentTrack: player.currentTrack,
    }),
    shallowEqual,
  );

  const isLoading = status === "loading";

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          key="floating-track-loader"
          initial={{ opacity: 0, y: -28, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 450, damping: 32 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2 rounded-full bg-[#121215]/95 backdrop-blur-2xl border border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.7),0_0_24px_rgba(255,0,51,0.25)] select-none pointer-events-none transform-gpu"
        >
          {/* Animated pulsing icon */}
          <div className="relative size-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-75" />
            <SpinnerSteps size={14} className="text-primary relative z-10" />
          </div>

          {/* Track title & loading indicator */}
          <div className="flex flex-col min-w-0 max-w-[190px] sm:max-w-[280px]">
            <span className="truncate text-xs font-semibold text-white tracking-tight">
              {currentTrack?.title ? currentTrack.title : "Loading song..."}
            </span>
            <span className="truncate text-[10px] text-white/60">
              {currentTrack?.artist ? `Buffering • ${currentTrack.artist}` : "Connecting to stream..."}
            </span>
          </div>

          {/* Dancing soundwave equalizer animation */}
          <div className="flex items-end gap-0.5 h-3.5 pl-1 shrink-0" aria-hidden="true">
            <span className="w-0.5 bg-primary rounded-full animate-bounce h-2 [animation-delay:0ms]" />
            <span className="w-0.5 bg-primary rounded-full animate-bounce h-3.5 [animation-delay:150ms]" />
            <span className="w-0.5 bg-primary rounded-full animate-bounce h-2.5 [animation-delay:300ms]" />
            <span className="w-0.5 bg-primary rounded-full animate-bounce h-3 [animation-delay:450ms]" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
