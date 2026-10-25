import { useEffect, useRef, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import {
  HeartActiveIcon,
  HeartIcon,
  PauseActiveIcon,
  PlayActiveIcon,
  SkipNextIcon,
} from "@/ui/icons";
import { SpinnerSteps } from "@/components/motion/loader";
import {
  libraryController,
  playerController,
  shallowEqual,
  useLibrarySelector,
  usePlayerSelector,
} from "../../../player/playerStore";
import { TrackArtwork } from "../TrackArtwork";
import { useTrackContextMenu } from "../TrackContextMenu";

interface MobilePlayerBarProps {
  onOpenNowPlaying: () => void;
  className?: string;
}

// Lightweight isolated progress bar to prevent re-rendering the entire player bar on timer ticks
const MiniPlayerProgress = memo(function MiniPlayerProgress({
  trackId,
  isPlaying,
}: {
  trackId?: string;
  isPlaying: boolean;
}) {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trackId) {
      if (progressRef.current) progressRef.current.style.width = "0%";
      return;
    }

    const update = () => {
      const dur = playerController.getDuration();
      const curr = playerController.getCurrentTime();
      if (dur > 0 && progressRef.current) {
        const pct = Math.min(100, Math.max(0, (curr / dur) * 100));
        progressRef.current.style.width = `${pct}%`;
      }
    };

    update();
    if (!isPlaying) return;

    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [trackId, isPlaying]);

  return (
    <div className="h-[2.5px] w-full bg-white/10 overflow-hidden rounded-t-2xl">
      <div
        ref={progressRef}
        className="h-full bg-gradient-to-r from-red-500 to-rose-400 transition-[width] duration-500 ease-linear"
        style={{ width: "0%" }}
      />
    </div>
  );
});

export function MobilePlayerBarInner({ onOpenNowPlaying, className }: MobilePlayerBarProps) {
  const state = usePlayerSelector(
    (player) => ({
      currentTrack: player.currentTrack,
      status: player.status,
    }),
    shallowEqual,
  );
  const { toggleTrackLike } = useTrackContextMenu();

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const currentTrack = state.currentTrack;
  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading";

  // Fast O(1) selector instead of re-rendering on every library state update
  const isLiked = useLibrarySelector(
    () => (currentTrack ? libraryController.isTrackLiked(currentTrack.id) : false),
  );

  if (!currentTrack) return null;

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    playerController.togglePlayPause();
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    void playerController.skipToNext();
  };

  const handleToggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTrackLike(currentTrack);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const duration = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Swipe up opens Now Playing immediately
    if (deltaY < -25 && Math.abs(deltaY) > Math.abs(deltaX)) {
      onOpenNowPlaying();
      return;
    }

    // Horizontal swipe for skip tracks
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) && duration < 500) {
      if (deltaX < 0) {
        void playerController.skipToNext();
      } else {
        void playerController.skipToPrevious();
      }
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        layout
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        whileTap={{ scale: 0.985 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        onClick={onOpenNowPlaying}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-xl transform-gpu will-change-transform",
          "bg-[#212124] border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.7)]",
          "cursor-pointer select-none",
          className,
        )}
      >
        {/* Top Progress Line */}
        <MiniPlayerProgress trackId={currentTrack.id} isPlaying={isPlaying} />

        {/* Structured Content Row */}
        <div className="flex items-center gap-3 px-2.5 py-1.5">
          {/* Track Artwork Thumbnail */}
          <div className="relative size-11 shrink-0 overflow-hidden rounded-lg shadow-sm bg-white/5">
            <TrackArtwork
              artworkUrl={currentTrack.artworkUrl}
              size={48}
              className="size-full object-cover"
            />
          </div>

          {/* Title & Artist - Cleanly Structured */}
          <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
            <span className="truncate text-sm font-semibold tracking-tight text-white leading-tight">
              {currentTrack.title || "Unknown Track"}
            </span>
            <span className="truncate text-xs font-normal text-white/60 leading-normal mt-0.5">
              {currentTrack.artist || "Unknown Artist"}
            </span>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Cast / Like button */}
            <button
              type="button"
              onClick={handleToggleLike}
              className="flex size-9 items-center justify-center text-white/70 hover:text-white transition-colors"
              aria-label={isLiked ? "Unlike track" : "Like track"}
            >
              {isLiked ? (
                <HeartActiveIcon size={20} className="text-red-500 scale-105" />
              ) : (
                <HeartIcon size={20} />
              )}
            </button>

            {/* Play / Pause Button */}
            <button
              type="button"
              onClick={handlePlayPause}
              className="flex size-10 items-center justify-center text-white hover:text-white/80 active:scale-90 transition-transform"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isLoading ? (
                <SpinnerSteps size={20} className="text-white" />
              ) : isPlaying ? (
                <PauseActiveIcon size={24} className="fill-white text-white" />
              ) : (
                <PlayActiveIcon size={24} className="fill-white text-white translate-x-0.5" />
              )}
            </button>

            {/* Next Track Button */}
            <button
              type="button"
              onClick={handleNext}
              className="flex size-9 items-center justify-center text-white/80 hover:text-white active:scale-90 transition-transform"
              aria-label="Next track"
            >
              <SkipNextIcon size={22} className="fill-white text-white" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export const MobilePlayerBar = memo(MobilePlayerBarInner);
