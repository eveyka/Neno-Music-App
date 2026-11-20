import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  DislikeActiveIcon,
  DislikeIcon,
  DownloadIcon,
  DragHandleIcon,
  HeadphonesRoundIcon,
  LikeActiveIcon,
  LikeIcon,
  MoreVerticalIcon,
  PauseActiveIcon,
  PlayActiveIcon,
  QuoteIcon,
  RepeatActiveIcon,
  RepeatIcon,
  RepeatOneActiveIcon,
  ShareIcon,
  ShuffleActiveIcon,
  ShuffleIcon,
  SkipNextIcon,
  SkipPreviousIcon,
  TrashIcon,
  YTSaveIcon,
} from "@/ui/icons";
import { SpinnerSteps } from "@/components/motion/loader";
import {
  libraryController,
  playerController,
  shallowEqual,
  usePlayerSelector,
  usePlayerSessionSelector,
  useTrackLiked,
} from "../../../player/playerStore";
import type { PlayerSession } from "../../../player/PlayerController";
import type { Artist, Lyrics, Track } from "../../../datasource/types";
import { useArtistNavigation } from "../ArtistLinks";
import { TrackArtwork } from "../TrackArtwork";
import { getArtworkUrlCandidates } from "../../../datasource/youtube/artwork";
import { shareContent } from "../../../internal/share";
import { SeekBar } from "../player/SeekBar";
import { useTrackContextMenu } from "../TrackContextMenu";
import { formatMinutesSeconds } from "@/lib/utils";
import { findActiveLineIndex, isSyncedLyrics } from "../../pages/lyricsTiming";
import {
  cancelDownload,
  getOfflineStatus,
  queueDownload,
  removeDownload,
} from "../../../player/offlineStore";
import { playerUIStore, useIsMobileNowPlayingOpen } from "../../stores/playerUIStore";

interface MobileNowPlayingModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onOpenArtist?: (artist: Artist) => void;
}

type QueueSheetState = "collapsed" | "half" | "full";
type AudioMode = "audio" | "lyrics";

const EMPTY_QUEUE: Track[] = [];
const EMPTY_UPCOMING_TRACKS: { track: Track; absoluteIndex: number; position: number }[] = [];

function selectQueueSlice(session: PlayerSession | null) {
  return {
    queue: session?.queue ?? EMPTY_QUEUE,
    queueIndex: session?.queueIndex ?? -1,
    manualQueueLength: session?.manualQueueLength ?? 0,
    stopAfterQueueIndex: session?.stopAfterQueueIndex ?? null,
    queueWindowStart: session?.queueWindowStart ?? 0,
    queueContext: session?.queueContext ?? null,
    isPlaylistMode: session?.isPlaylistMode ?? false,
  };
}

function queueSliceEqual(
  a: ReturnType<typeof selectQueueSlice>,
  b: ReturnType<typeof selectQueueSlice>,
) {
  return (
    a.queueIndex === b.queueIndex &&
    a.manualQueueLength === b.manualQueueLength &&
    a.stopAfterQueueIndex === b.stopAfterQueueIndex &&
    a.queueWindowStart === b.queueWindowStart &&
    a.queueContext?.title === b.queueContext?.title &&
    a.isPlaylistMode === b.isPlaylistMode &&
    a.queue.length === b.queue.length &&
    a.queue.every((track, index) => track === b.queue[index])
  );
}

interface SwipeableQueueRowProps {
  track: Track;
  absoluteIndex: number;
  isDragged: boolean;
  dropEdge: "before" | "after" | null;
  onPlay: (absoluteIndex: number) => void;
  onInstantPlay: (absoluteIndex: number, track: Track) => void;
  onRemove: (absoluteIndex: number, track: Track) => void;
  onDragStart: (e: React.PointerEvent, absoluteIndex: number) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: (e: React.PointerEvent) => void;
}

const SwipeableQueueRow = memo(function SwipeableQueueRow({
  track,
  absoluteIndex,
  isDragged,
  dropEdge,
  onPlay,
  onInstantPlay,
  onRemove,
  onDragStart,
  onDragMove,
  onDragEnd,
}: SwipeableQueueRowProps) {
  const rowElRef = useRef<HTMLDivElement | null>(null);
  const leftActionRef = useRef<HTMLDivElement | null>(null);
  const rightActionRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const currentOffsetRef = useRef<number>(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    currentOffsetRef.current = 0;
    isHorizontalSwipeRef.current = null;
    if (rowElRef.current) {
      rowElRef.current.style.transition = "none";
      rowElRef.current.style.willChange = "transform";
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;

    // Determine direction once beyond threshold
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY) + 4) {
        isHorizontalSwipeRef.current = true;
      } else if (Math.abs(deltaY) > 8) {
        isHorizontalSwipeRef.current = false;
        return;
      }
    }

    // Only handle horizontal swipe; let vertical scroll pass freely with 0 lag
    if (isHorizontalSwipeRef.current === true) {
      let clamped = deltaX;
      if (clamped > 110) clamped = 110 + (clamped - 110) * 0.25;
      if (clamped < -110) clamped = -110 + (clamped + 110) * 0.25;
      currentOffsetRef.current = clamped;

      if (rowElRef.current) {
        rowElRef.current.style.transform = `translate3d(${clamped}px, 0, 0)`;
      }

      if (clamped > 0) {
        if (leftActionRef.current) {
          leftActionRef.current.style.opacity = String(Math.min(1, Math.max(0.15, clamped / 65)));
        }
        if (rightActionRef.current) {
          rightActionRef.current.style.opacity = "0";
        }
      } else if (clamped < 0) {
        if (rightActionRef.current) {
          rightActionRef.current.style.opacity = String(Math.min(1, Math.max(0.15, Math.abs(clamped) / 65)));
        }
        if (leftActionRef.current) {
          leftActionRef.current.style.opacity = "0";
        }
      } else {
        if (leftActionRef.current) leftActionRef.current.style.opacity = "0";
        if (rightActionRef.current) rightActionRef.current.style.opacity = "0";
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current === null) return;
    const offset = currentOffsetRef.current;
    const isHorizontal = isHorizontalSwipeRef.current;

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    currentOffsetRef.current = 0;
    isHorizontalSwipeRef.current = null;

    if (isHorizontal) {
      if (offset < -65) {
        // SWIPE LEFT -> REMOVE
        if (rowElRef.current) {
          rowElRef.current.style.transition = "transform 0.18s ease-out, opacity 0.18s ease-out";
          rowElRef.current.style.transform = "translate3d(-105%, 0, 0)";
          rowElRef.current.style.opacity = "0";
        }
        setTimeout(() => {
          onRemove(absoluteIndex, track);
        }, 160);
        return;
      } else if (offset > 65) {
        // SWIPE RIGHT -> INSTANT PLAY
        if (rowElRef.current) {
          rowElRef.current.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
          rowElRef.current.style.transform = "translate3d(0, 0, 0)";
        }
        if (leftActionRef.current) leftActionRef.current.style.opacity = "0";
        if (rightActionRef.current) rightActionRef.current.style.opacity = "0";
        onInstantPlay(absoluteIndex, track);
        return;
      }
    }

    if (rowElRef.current) {
      rowElRef.current.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
      rowElRef.current.style.transform = "translate3d(0, 0, 0)";
      rowElRef.current.style.willChange = "auto";
    }
    if (leftActionRef.current) leftActionRef.current.style.opacity = "0";
    if (rightActionRef.current) rightActionRef.current.style.opacity = "0";
  };

  return (
    <div
      data-queue-index={absoluteIndex}
      className={cn(
        "relative overflow-hidden rounded-xl my-1 select-none touch-pan-y",
        isDragged && "opacity-40 scale-[0.98]",
        dropEdge === "after" && "border-b-2 border-primary",
        dropEdge === "before" && "border-t-2 border-primary",
      )}
    >
      {/* 1. Left Action (Swipe Right): Instant Play */}
      <div
        ref={leftActionRef}
        style={{ opacity: 0 }}
        className="absolute inset-y-0 left-0 w-full flex items-center gap-2 pl-4 rounded-xl pointer-events-none bg-gradient-to-r from-emerald-600/90 via-emerald-500/80 to-transparent text-white font-semibold text-xs"
      >
        <div className="flex size-7 items-center justify-center rounded-full bg-white text-emerald-700 shadow-md">
          <PlayActiveIcon size={16} className="translate-x-0.5" />
        </div>
        <span className="text-sm font-bold tracking-wide drop-shadow-sm">Play Now</span>
      </div>

      {/* 2. Right Action (Swipe Left): Remove from Up Next */}
      <div
        ref={rightActionRef}
        style={{ opacity: 0 }}
        className="absolute inset-y-0 right-0 w-full flex items-center justify-end gap-2 pr-4 rounded-xl pointer-events-none bg-gradient-to-l from-rose-600/90 via-rose-500/80 to-transparent text-white font-semibold text-xs"
      >
        <span className="text-sm font-bold tracking-wide drop-shadow-sm">Remove</span>
        <div className="flex size-7 items-center justify-center rounded-full bg-white text-rose-700 shadow-md">
          <TrashIcon size={16} />
        </div>
      </div>

      {/* FOREGROUND ROW CARD - Systematic Floating Island Card */}
      <div
        ref={rowElRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={() => onPlay(absoluteIndex)}
        className="relative z-10 flex items-center justify-between gap-3 py-2.5 px-3 rounded-2xl bg-[#171717] hover:bg-[#1f1f1f] active:bg-[#252525] border border-white/10 shadow-xs cursor-pointer transition-colors"
      >
        <div className="size-11 shrink-0 overflow-hidden rounded-xl shadow-sm border border-white/10 bg-black/40">
          <TrackArtwork
            artworkUrl={track.artworkUrl}
            size={44}
            className="size-full object-cover"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="truncate text-[13px] font-semibold text-white leading-tight">
            {track.title}
          </span>
          <span className="truncate text-[11px] font-medium text-white/60 leading-tight mt-0.5">
            {track.artist || "Unknown Artist"}
            {track.durationSec ? ` • ${formatMinutesSeconds(track.durationSec)}` : ""}
          </span>
        </div>

        <div
          onPointerDown={(e) => onDragStart(e, absoluteIndex)}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          className="flex size-10 shrink-0 items-center justify-center text-white/40 hover:text-white active:text-white cursor-grab active:cursor-grabbing touch-none rounded-lg"
          aria-label="Hold and drag to reorder"
          title="Hold and drag to reorder"
        >
          <DragHandleIcon size={20} />
        </div>
      </div>
    </div>
  );
});

const ShimmerQueueRow = memo(function ShimmerQueueRow({ index }: { index: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 100}ms` }}
      className="relative overflow-hidden flex items-center justify-between gap-3 py-2.5 px-3 rounded-2xl bg-[#171717] border border-white/10 my-1 shadow-xs"
    >
      {/* Shimmer light sweep */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

      {/* Album Art Placeholder */}
      <div className="size-11 shrink-0 rounded-xl bg-white/10 border border-white/5" />

      {/* Text Lines */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div
          className="h-3.5 rounded-md bg-white/15"
          style={{ width: `${60 + (index % 3) * 15}%` }}
        />
        <div
          className="h-2.5 rounded-md bg-white/10"
          style={{ width: `${35 + (index % 2) * 20}%` }}
        />
      </div>

      {/* Drag handle placeholder */}
      <div className="size-6 rounded-md bg-white/5 shrink-0" />
    </div>
  );
});

interface SleepTimerButtonProps {
  onClick: () => void;
}

const SleepTimerButton = memo(function SleepTimerButton({ onClick }: SleepTimerButtonProps) {
  const [sleepRemainingMs, setSleepRemainingMs] = useState<number | null>(() =>
    playerController.getSleepTimerRemainingMs(),
  );
  const isSleepActive = sleepRemainingMs !== null;

  useEffect(() => {
    const tick = () => setSleepRemainingMs(playerController.getSleepTimerRemainingMs());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex size-10 items-center justify-center rounded-full transition-all active:scale-90",
        isSleepActive
          ? "text-primary font-bold bg-primary/20"
          : "text-white/90 hover:text-white",
      )}
      aria-label="Sleep timer"
      title="Sleep Timer"
    >
      <ClockIcon size={20} />
      {isSleepActive && sleepRemainingMs !== null && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground tabular-nums shadow-sm">
          {Math.ceil(sleepRemainingMs / 60000)}m
        </span>
      )}
    </button>
  );
});

interface SleepTimerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onTimerSet: (minutes: number | null) => void;
}

const SleepTimerSheet = memo(function SleepTimerSheet({
  isOpen,
  onClose,
  onTimerSet,
}: SleepTimerSheetProps) {
  const [sleepRemainingMs, setSleepRemainingMs] = useState<number | null>(() =>
    playerController.getSleepTimerRemainingMs(),
  );
  const isSleepActive = sleepRemainingMs !== null;

  useEffect(() => {
    if (!isOpen) return;
    const tick = () => setSleepRemainingMs(playerController.getSleepTimerRemainingMs());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  const handleSelect = (mins: number | null) => {
    playerController.setSleepTimer(mins);
    onTimerSet(mins);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative z-10 flex flex-col rounded-t-3xl bg-[#1c1c1e] border-t border-white/10 px-5 pt-4 pb-8 shadow-2xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/30" />

            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ClockIcon size={20} className="text-primary" />
                <span className="text-base font-bold text-white">Sleep Timer</span>
              </div>
              {isSleepActive && sleepRemainingMs !== null && (
                <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full tabular-nums">
                  {formatMinutesSeconds(Math.ceil(sleepRemainingMs / 1000))} left
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5 pt-3">
              {[15, 30, 45, 60, 90].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleSelect(mins)}
                  className="flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-sm font-medium text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors"
                >
                  <span>{mins} minutes</span>
                  {isSleepActive &&
                    sleepRemainingMs !== null &&
                    Math.ceil(sleepRemainingMs / 60000) === mins && (
                      <CheckIcon size={18} className="text-primary" />
                    )}
                </button>
              ))}

              {isSleepActive && (
                <button
                  type="button"
                  onClick={() => handleSelect(null)}
                  className="flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-sm font-semibold text-destructive hover:bg-destructive/10 active:bg-destructive/15 transition-colors mt-1 border-t border-white/5"
                >
                  <span>Turn off timer</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export function MobileNowPlayingModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  onOpenArtist,
}: MobileNowPlayingModalProps) {
  const storeIsOpen = useIsMobileNowPlayingOpen();
  const isOpen = propIsOpen !== undefined ? propIsOpen : storeIsOpen;
  const onClose = useCallback(() => {
    if (propOnClose) {
      propOnClose();
    } else {
      playerUIStore.setMobileNowPlayingOpen(false);
    }
  }, [propOnClose]);

  // Mode toggles
  const [queueSheetState, setQueueSheetState] = useState<QueueSheetState>("collapsed");
  const [audioMode, setAudioMode] = useState<AudioMode>("audio");
  const [isDisliked, setIsDisliked] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Real-time zero-lag bottom sheet gesture refs
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetTouchStartYRef = useRef<number | null>(null);
  const sheetTouchStartXRef = useRef<number | null>(null);
  const sheetInitialPxRef = useRef<number>(0);
  const isSheetDraggingRef = useRef(false);

  // Double-tap 5-sec skip state & refs
  const [skipAnimation, setSkipAnimation] = useState<{
    side: "left" | "right";
    seconds: number;
    timestamp: number;
  } | null>(null);
  const skipAnimationTimeoutRef = useRef<number | null>(null);
  const lastArtworkTapRef = useRef<{ time: number; side: "left" | "right" } | null>(null);
  const lastArtworkTouchTimeRef = useRef(0);

  const getSheetPxForState = useCallback((state: QueueSheetState) => {
    if (typeof window === "undefined") return 0;
    if (state === "full") return 0;
    if (state === "half") return Math.round(window.innerHeight * 0.46);
    return Math.max(0, window.innerHeight - 52);
  }, []);

  const navigateArtist = useArtistNavigation();

  const handleArtistClick = (artistRef: { id?: string; name: string }) => {
    onClose();
    if (onOpenArtist) {
      onOpenArtist({ id: artistRef.id ?? "", name: artistRef.name });
    } else if (navigateArtist) {
      navigateArtist({ id: artistRef.id ?? "", name: artistRef.name }, false);
    }
  };

  // Lyrics state
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsActiveIndex, setLyricsActiveIndex] = useState(-1);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lyricsLineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const isLyricsUserScrollingRef = useRef(false);
  const userScrollResumeTimerRef = useRef<number | null>(null);

  // Player state
  const state = usePlayerSelector(
    (player) => ({
      currentTrack: player.currentTrack,
      status: player.status,
      playbackOrderMode: player.playbackOrderMode,
      shuffleEnabled: player.shuffleEnabled,
    }),
    shallowEqual,
  );
  const { toggleTrackLike, openPlaylistPicker, openTrackMenu } = useTrackContextMenu();

  // Queue state
  const { queue, queueIndex, queueWindowStart, queueContext } = usePlayerSessionSelector(
    selectQueueSlice,
    queueSliceEqual,
  );

  const currentTrack = state.currentTrack;
  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading";
  const isShuffle = state.shuffleEnabled;
  const isRepeatAll = state.playbackOrderMode === "repeat-all";
  const isRepeatOne = state.playbackOrderMode === "repeat-one";

  // HD artwork URL — maxresdefault for YouTube videos, large variant for music covers.
  // The TrackArtwork component already handles this via its candidate ladder, but the
  // ambient backdrop <div> loads the URL directly, so we pick the best candidate here.
  const hdArtworkUrl = currentTrack?.artworkUrl
    ? (getArtworkUrlCandidates(currentTrack.artworkUrl)[0] ?? currentTrack.artworkUrl)
    : undefined;

  // Instant reactive hook with 0ms delay across track switches
  const isLiked = useTrackLiked(currentTrack?.id);

  // downloadStatus is read per-render from the synchronous offline store.
  // Previously we had useOfflineState() at the top of the component which caused
  // the entire 1440-line modal to re-render on every download byte — moved to a
  // targeted read here, which is safe because download events also trigger a
  // re-render via the player state subscription when track changes.
  const downloadStatus = currentTrack ? getOfflineStatus(currentTrack.id) : "absent";

  // Calculate upcoming queue tracks (only compute when modal is actually open)
  const upcomingTracks = useMemo(() => {
    if (!isOpen) return EMPTY_UPCOMING_TRACKS;
    const start = Math.max(queueIndex + 1, 0);
    const entries: { track: Track; absoluteIndex: number; position: number }[] = [];
    for (let offset = 0; start + offset < queue.length; offset += 1) {
      entries.push({
        track: queue[start + offset],
        absoluteIndex: queueWindowStart + start + offset,
        position: offset + 1,
      });
    }
    return entries;
  }, [isOpen, queue, queueIndex, queueWindowStart]);

  // Touch gesture state references
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  // Reset states on modal close/open
  useEffect(() => {
    if (isOpen) {
      setQueueSheetState("collapsed");
    }
  }, [isOpen]);

  // Fetch lyrics when track changes or when lyrics mode is active and modal is open
  useEffect(() => {
    if (!isOpen || !currentTrack || audioMode !== "lyrics") return;
    let cancelled = false;
    setLyricsLoading(true);
    setLyrics(null);
    setLyricsActiveIndex(-1);

    playerController
      .getLyrics(currentTrack)
      .then((res) => {
        if (!cancelled) setLyrics(res);
      })
      .catch(() => {
        if (!cancelled) setLyrics(null);
      })
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentTrack?.id, audioMode]);

  // Track active lyric line in real-time
  useEffect(() => {
    if (!isOpen || audioMode !== "lyrics" || !lyrics || !isSyncedLyrics(lyrics)) {
      setLyricsActiveIndex(-1);
      return;
    }

    const interval = setInterval(() => {
      const currentTime = playerController.getCurrentTime();
      const nextIndex = findActiveLineIndex(lyrics.lines, currentTime);
      setLyricsActiveIndex((prev) => {
        if (prev !== nextIndex) {
          if (!isLyricsUserScrollingRef.current && nextIndex >= 0) {
            const lineEl = lyricsLineRefs.current[nextIndex];
            const container = lyricsContainerRef.current;
            if (lineEl && container) {
              container.scrollTo({
                top: Math.max(
                  0,
                  lineEl.offsetTop - container.clientHeight / 2 + lineEl.offsetHeight / 2,
                ),
                behavior: "smooth",
              });
            }
          }
          return nextIndex;
        }
        return prev;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isOpen, audioMode, lyrics]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(null), 2500);
  };

  const [isSleepTimerSheetOpen, setIsSleepTimerSheetOpen] = useState(false);

  const handleTimerSet = (minutes: number | null) => {
    if (minutes !== null) {
      showToast(`Sleep timer set for ${minutes} min`);
    } else {
      showToast("Sleep timer turned off");
    }
  };

  // Header "Playing from" label
  const playingFromTitle =
    queueContext?.title
      ? (queueContext.type === "radio" ? queueContext.title : queueContext.title)
      : currentTrack?.title
      ? `${currentTrack.title} Radio`
      : currentTrack?.album || (currentTrack?.artist ? `${currentTrack.artist} Radio` : "Up Next");

  // Android Hardware Back Button interception for modal & Up Next queue sheet
  useEffect(() => {
    if (!isOpen) return;
    const win = window as unknown as { __active_modal_back?: () => boolean };
    win.__active_modal_back = () => {
      // 1. If sleep timer is open, close sleep timer first
      if (isSleepTimerSheetOpen) {
        setIsSleepTimerSheetOpen(false);
        return true;
      }
      // 2. If Up Next queue sheet is open (half or full), collapse it back to normal player
      if (queueSheetState !== "collapsed") {
        setQueueSheetState("collapsed");
        return true;
      }
      // 3. If in lyrics mode, switch back to normal player view
      if (audioMode === "lyrics") {
        setAudioMode("audio");
        return true;
      }
      // 4. If normal player, smoothly minimize player (returning to current page)
      if (isOpen) {
        onClose();
        return true;
      }
      return false;
    };
    return () => {
      delete win.__active_modal_back;
    };
  }, [isOpen, isSleepTimerSheetOpen, queueSheetState, audioMode, onClose]);

  // Realistic/stable like count formatted like YouTube Music (e.g. 11K)
  const likeCountText = useMemo(() => {
    if (!currentTrack) return "11K";
    if (currentTrack.viewCount) {
      const approx = Math.max(1000, Math.round(currentTrack.viewCount * 0.04));
      if (approx >= 1_000_000) return `${(approx / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
      if (approx >= 1_000) return `${Math.round(approx / 1_000)}K`;
      return `${approx}`;
    }
    // Stable pseudo-hash based on track id so count doesn't jump randomly
    let hash = 0;
    for (let i = 0; i < currentTrack.id.length; i++) {
      hash = (hash * 31 + currentTrack.id.charCodeAt(i)) & 0xfffff;
    }
    const count = 5 + (hash % 90);
    return `${count}K`;
  }, [currentTrack]);

  // Save upcoming queue as a new playlist
  const handleSaveQueueAsPlaylist = async () => {
    if (saveStatus !== "idle") return;
    setSaveStatus("saving");
    const title = currentTrack?.album
      ? `${currentTrack.album} Queue`
      : currentTrack?.title
      ? `${currentTrack.title} Mix`
      : "My Queue";
    const trackIds = [
      ...(currentTrack ? [currentTrack.id] : []),
      ...upcomingTracks.map((entry) => entry.track.id),
    ];
    try {
      await libraryController.createPlaylist(title, { trackIds });
      setSaveStatus("saved");
      showToast("Saved queue to playlists!");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("idle");
    }
  };


  // Handle Like
  const handleToggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    if (isDisliked) setIsDisliked(false);
    toggleTrackLike(currentTrack);
  };

  // Handle Dislike
  const handleToggleDislike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    if (isLiked) {
      toggleTrackLike(currentTrack);
    }
    setIsDisliked((prev) => !prev);
  };

  // Handle Save
  const handleSaveToPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    openPlaylistPicker(currentTrack);
  };

  // Handle Download
  const handleToggleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    if (downloadStatus === "ready") {
      void removeDownload(currentTrack.id);
      showToast("Download removed");
    } else if (downloadStatus === "downloading" || downloadStatus === "queued") {
      cancelDownload(currentTrack.id);
      showToast("Download cancelled");
    } else {
      queueDownload(currentTrack);
      showToast("Downloading track...");
    }
  };

  // Handle Share button
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    const shareUrl = `https://music.youtube.com/watch?v=${encodeURIComponent(currentTrack.id)}`;
    const result = await shareContent({
      title: currentTrack.title,
      text: `Listening to ${currentTrack.title} by ${currentTrack.artist}`,
      url: shareUrl,
    });
    if (result.copied) {
      showToast("Link copied to clipboard!");
    }
  };

  // Switch between audio and lyrics view; collapse queue sheet when entering lyrics
  const handleSetAudioMode = (mode: "audio" | "lyrics") => {
    setAudioMode(mode);
    if (mode === "lyrics" && queueSheetState !== "collapsed") {
      setQueueSheetState("collapsed");
    }
  };

  // Lyrics user scroll handler to prevent jitter
  const handleLyricsScroll = () => {
    isLyricsUserScrollingRef.current = true;
    if (userScrollResumeTimerRef.current) window.clearTimeout(userScrollResumeTimerRef.current);
    userScrollResumeTimerRef.current = window.setTimeout(() => {
      isLyricsUserScrollingRef.current = false;
    }, 3500);
  };

  // Trigger double-tap 5s skip on artwork (left = -5s, right = +5s). Single tap does NOTHING.
  const triggerDoubleTap = useCallback(
    (side: "left" | "right") => {
      if (!currentTrack) return;
      const now = Date.now();
      const lastTap = lastArtworkTapRef.current;

      if (
        lastTap &&
        lastTap.side === side &&
        now - lastTap.time < 420
      ) {
        lastArtworkTapRef.current = null;
        const delta = side === "right" ? 5 : -5;
        const current = playerController.getCurrentTime();
        const duration = currentTrack.durationSec || Infinity;
        const target = Math.max(0, Math.min(current + delta, duration));
        void playerController.seekTo(target);

        setSkipAnimation({ side, seconds: 5, timestamp: now });
        if (skipAnimationTimeoutRef.current) {
          window.clearTimeout(skipAnimationTimeoutRef.current);
        }
        skipAnimationTimeoutRef.current = window.setTimeout(() => {
          setSkipAnimation(null);
        }, 650);

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(25);
          } catch {
            // ignore
          }
        }
      } else {
        // First tap / single click: record tap timestamp. DO NOTHING ELSE (no sheet opening).
        lastArtworkTapRef.current = { time: now, side };
      }
    },
    [currentTrack, playerController],
  );

  const handleArtworkTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    // Isolate poster touches completely so swiping or clicking poster never triggers parent body drag or sheet
    e.stopPropagation();
  }, []);

  const handleArtworkTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const handleArtworkTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.stopPropagation();
      lastArtworkTouchTimeRef.current = Date.now();
      if (e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = touch.clientX - rect.left;
      const isRight = clickX > rect.width / 2;
      const side: "left" | "right" = isRight ? "right" : "left";
      triggerDoubleTap(side);
    },
    [triggerDoubleTap],
  );

  // Mouse fallback for double-click on desktop
  const handleArtworkClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      // If a touch was just handled, ignore synthesized mouse click
      if (Date.now() - lastArtworkTouchTimeRef.current < 500) {
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const isRight = clickX > rect.width / 2;
      const side: "left" | "right" = isRight ? "right" : "left";
      triggerDoubleTap(side);
    },
    [triggerDoubleTap],
  );

  // Handle touch events on the drag handle / sheet header with real-time tracking
  const handleSheetTouchStart = (e: React.TouchEvent) => {
    sheetTouchStartYRef.current = e.touches[0].clientY;
    sheetTouchStartXRef.current = e.touches[0].clientX;
    sheetInitialPxRef.current = getSheetPxForState(queueSheetState);
    isSheetDraggingRef.current = false;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  };

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    if (sheetTouchStartYRef.current === null || sheetTouchStartXRef.current === null) return;
    const deltaY = e.touches[0].clientY - sheetTouchStartYRef.current;
    const deltaX = e.touches[0].clientX - sheetTouchStartXRef.current;

    if (!isSheetDraggingRef.current) {
      if (Math.abs(deltaY) > 6 && Math.abs(deltaY) > Math.abs(deltaX)) {
        isSheetDraggingRef.current = true;
      } else if (Math.abs(deltaX) > 12) {
        return;
      }
    }

    if (isSheetDraggingRef.current && sheetRef.current) {
      const maxPx = Math.max(0, window.innerHeight - 52);
      const targetPx = Math.max(0, Math.min(maxPx, sheetInitialPxRef.current + deltaY));
      sheetRef.current.style.transform = `translate3d(0, ${targetPx}px, 0)`;
    }
  };

  const handleSheetTouchEnd = (e: React.TouchEvent) => {
    if (sheetTouchStartYRef.current === null) return;
    const deltaY = e.changedTouches[0].clientY - sheetTouchStartYRef.current;
    const wasDragging = isSheetDraggingRef.current;

    sheetTouchStartYRef.current = null;
    sheetTouchStartXRef.current = null;
    isSheetDraggingRef.current = false;

    let nextState: QueueSheetState = queueSheetState;

    if (wasDragging) {
      if (queueSheetState === "collapsed") {
        if (deltaY < -200) {
          nextState = "full";
        } else if (deltaY < -25) {
          nextState = "half";
        } else {
          nextState = "collapsed";
        }
      } else if (queueSheetState === "half") {
        if (deltaY < -50) {
          nextState = "full";
        } else if (deltaY > 50) {
          nextState = "collapsed";
        } else {
          nextState = "half";
        }
      } else if (queueSheetState === "full") {
        if (deltaY > 200) {
          nextState = "collapsed";
        } else if (deltaY > 40) {
          nextState = "half";
        } else {
          nextState = "full";
        }
      }
    }

    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)";
      sheetRef.current.style.transform = "";
    }
    setQueueSheetState(nextState);
  };

  // Touch gestures on main player body / poster / controls to swipe up or down
  const handlePlayerBodyTouchStart = (e: React.TouchEvent) => {
    if (audioMode === "lyrics") return;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartXRef.current = e.touches[0].clientX;
    if (queueSheetState === "collapsed") {
      sheetInitialPxRef.current = getSheetPxForState("collapsed");
      isSheetDraggingRef.current = false;
      if (sheetRef.current) {
        sheetRef.current.style.transition = "none";
      }
    }
  };

  const handlePlayerBodyTouchMove = (e: React.TouchEvent) => {
    if (audioMode === "lyrics" || touchStartYRef.current === null || touchStartXRef.current === null) return;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;

    if (queueSheetState === "collapsed" && deltaY < 0) {
      if (!isSheetDraggingRef.current) {
        if (Math.abs(deltaY) > 6 && Math.abs(deltaY) > Math.abs(deltaX)) {
          isSheetDraggingRef.current = true;
        }
      }
      if (isSheetDraggingRef.current && sheetRef.current) {
        const maxPx = Math.max(0, window.innerHeight - 52);
        const targetPx = Math.max(0, Math.min(maxPx, sheetInitialPxRef.current + deltaY));
        sheetRef.current.style.transform = `translate3d(0, ${targetPx}px, 0)`;
      }
    }
  };

  const handlePlayerBodyTouchEnd = (e: React.TouchEvent) => {
    if (audioMode === "lyrics") {
      touchStartYRef.current = null;
      touchStartXRef.current = null;
      return;
    }
    if (touchStartYRef.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    const deltaX = touchStartXRef.current
      ? e.changedTouches[0].clientX - touchStartXRef.current
      : 0;
    touchStartYRef.current = null;
    touchStartXRef.current = null;
    isSheetDraggingRef.current = false;

    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)";
      sheetRef.current.style.transform = "";
    }

    if (Math.abs(deltaY) > 25 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY < -200) {
        // Swiped UP far -> full queue sheet
        setQueueSheetState("full");
      } else if (deltaY < -30) {
        // Swiped UP slightly -> half queue sheet ("thora sa scrool krne se half tk outhna chyea")
        setQueueSheetState("half");
      } else if (deltaY > 35) {
        // Swiped DOWN
        if (queueSheetState === "full") {
          setQueueSheetState("half");
        } else if (queueSheetState === "half") {
          setQueueSheetState("collapsed");
        } else if (queueSheetState === "collapsed") {
          // Return to mini player
          onClose();
        }
      }
    }
  };

  // Header specific touch gestures (swipe down anywhere on header minimizes)
  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleHeaderTouchEnd = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    const deltaX = touchStartXRef.current
      ? e.changedTouches[0].clientX - touchStartXRef.current
      : 0;
    touchStartYRef.current = null;
    touchStartXRef.current = null;

    if (deltaY > 25 && Math.abs(deltaY) > Math.abs(deltaX)) {
      onClose();
    }
  };

  // Queue list scroll container top pull-down handling
  const queueTouchStartYRef = useRef<number | null>(null);
  const queueScrollTopRef = useRef<number>(0);

  const handleQueueListTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    queueTouchStartYRef.current = e.touches[0].clientY;
    queueScrollTopRef.current = e.currentTarget.scrollTop;
  };

  const handleQueueListTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (queueTouchStartYRef.current === null) return;
    const deltaY = e.changedTouches[0].clientY - queueTouchStartYRef.current;

    if (queueScrollTopRef.current <= 0 && deltaY > 35) {
      if (queueSheetState === "full") {
        setQueueSheetState("half");
      } else if (queueSheetState === "half") {
        setQueueSheetState("collapsed");
      }
    }
    queueTouchStartYRef.current = null;
  };

  // Drag-to-reorder track in queue state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; insertAfter: boolean } | null>(null);

  const pointerDragRef = useRef<{
    pointerId: number;
    sourceIndex: number;
    startY: number;
    isDragging: boolean;
  } | null>(null);
  const dropTargetRef = useRef<{ index: number; insertAfter: boolean } | null>(null);
  const isDraggingRef = useRef(false);

  const handlePlayQueueTrack = useCallback((absoluteIndex: number) => {
    if (!isDraggingRef.current) {
      void playerController.playQueueTrackAt(absoluteIndex);
    }
  }, []);

  const handleInstantPlayTrack = useCallback((absoluteIndex: number, track: Track) => {
    showToast(`Playing ${track.title}`);
    void playerController.playQueueTrackAt(absoluteIndex);
  }, []);

  const handleRemoveTrack = useCallback((absoluteIndex: number, _track: Track) => {
    playerController.removeFromQueueAt(absoluteIndex);
    showToast("Removed from Up Next");
  }, []);

  const handleRowDragStart = useCallback((e: React.PointerEvent, absoluteIndex: number) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignored if pointer capture fails
    }

    pointerDragRef.current = {
      pointerId: e.pointerId,
      sourceIndex: absoluteIndex,
      startY: e.clientY,
      isDragging: false,
    };
    dropTargetRef.current = null;
    setDropTarget(null);
  }, []);

  const handleRowDragMove = useCallback((e: React.PointerEvent) => {
    const drag = pointerDragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    const deltaY = Math.abs(e.clientY - drag.startY);
    if (!drag.isDragging && deltaY > 4) {
      drag.isDragging = true;
      isDraggingRef.current = true;
      setDraggedIndex(drag.sourceIndex);
    }

    if (!drag.isDragging) return;

    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const targetEl = elements
      .map((el) => el.closest<HTMLElement>("[data-queue-index]"))
      .find((el) => Boolean(el) && Number(el?.dataset.queueIndex) !== drag.sourceIndex);

    if (!targetEl) {
      setDropTarget(null);
      dropTargetRef.current = null;
      return;
    }

    const targetIndex = Number(targetEl.dataset.queueIndex);
    const bounds = targetEl.getBoundingClientRect();
    const insertAfter = e.clientY >= bounds.top + bounds.height / 2;

    const newDrop = { index: targetIndex, insertAfter };
    dropTargetRef.current = newDrop;
    setDropTarget(newDrop);
  }, []);

  const handleRowDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = pointerDragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const drop = dropTargetRef.current;
    if (drag.isDragging && drop && drop.index !== drag.sourceIndex) {
      playerController.moveQueueTrack(drag.sourceIndex, drop.index, drop.insertAfter);
    }

    pointerDragRef.current = null;
    dropTargetRef.current = null;
    setDraggedIndex(null);
    setDropTarget(null);

    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="mobile-now-playing-modal"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className="fixed inset-0 z-50 flex flex-col bg-[#050505] text-foreground select-none overflow-hidden transform-gpu will-change-transform"
        >
          {/* Glassmorphic Ambient Background reacting to Artwork */}
          {hdArtworkUrl && (
            <div
              key={hdArtworkUrl}
              className="absolute inset-0 -z-20 pointer-events-none scale-110 bg-cover bg-center opacity-30 blur-3xl transition-opacity duration-300"
              style={{
                backgroundImage: `url("${hdArtworkUrl}")`,
              }}
            />
          )}
          <div className="absolute inset-0 -z-15 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,5,5,0.85)_75%)]" />
          <div className="absolute inset-0 -z-10 pointer-events-none bg-gradient-to-b from-black/55 via-[#0a0a0a]/85 to-[#050505]/95 backdrop-blur-2xl" />

          {/* ── TOP HEADER (Chevron, Headphones/Lyrics Switcher, 3-Dots) ── */}
          {queueSheetState !== "full" && (
            <header
              onTouchStart={handleHeaderTouchStart}
              onTouchEnd={handleHeaderTouchEnd}
              className="relative flex items-center justify-between px-3 pt-9 pb-2 z-20 transition-colors duration-200"
            >
              {/* Minimize button */}
              <button
                type="button"
                onClick={onClose}
                className="flex size-10 items-center justify-center rounded-full text-white/90 bg-white/10 backdrop-blur-md border border-white/10 transition-transform active:scale-90 hover:opacity-80 shadow-sm"
                aria-label="Minimize now playing"
              >
                <ChevronDownIcon size={28} />
              </button>

              {/* Audio (Headphone) vs Lyrics Switcher Pill — absolutely centred so unequal L/R buttons don't shift it */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center rounded-full bg-black/40 backdrop-blur-xl p-0.5 border border-white/15 shadow-md">
                {/* Song / Audio Mode */}
                <button
                  type="button"
                  onClick={() => handleSetAudioMode("audio")}
                  className={cn(
                    "flex h-7 px-3 items-center justify-center rounded-full transition-all active:scale-95",
                    audioMode === "audio"
                      ? "bg-white/20 text-white shadow-sm font-medium"
                      : "text-white/60 hover:text-white/90",
                  )}
                  aria-label="Audio mode"
                  title="Song View"
                >
                  <HeadphonesRoundIcon size={18} />
                </button>

                {/* Lyrics Mode */}
                <button
                  type="button"
                  onClick={() => handleSetAudioMode("lyrics")}
                  className={cn(
                    "flex h-7 px-3 items-center justify-center rounded-full transition-all active:scale-95",
                    audioMode === "lyrics"
                      ? "bg-white/20 text-white shadow-sm font-medium"
                      : "text-white/60 hover:text-white/90",
                  )}
                  aria-label="Lyrics mode"
                  title="Lyrics View"
                >
                  <QuoteIcon size={16} />
                </button>
              </div>

              {/* Right Action Icons: Sleep Timer & 3-dots Menu */}
              <div className="flex items-center gap-1">
                <SleepTimerButton onClick={() => setIsSleepTimerSheetOpen(true)} />
                <button
                  type="button"
                  onClick={(e) => currentTrack && openTrackMenu(e, currentTrack)}
                  className="flex size-10 items-center justify-center rounded-full text-white/90 transition-transform active:scale-90 hover:text-white"
                  aria-label="More options"
                >
                  <MoreVerticalIcon size={22} />
                </button>
              </div>
            </header>
          )}

          {/* ── MAIN PLAYER CONTENT (Collapsed & Half States) ── */}
          {queueSheetState !== "full" && (
            <div
              onTouchStart={audioMode === "audio" ? handlePlayerBodyTouchStart : undefined}
              onTouchMove={audioMode === "audio" ? handlePlayerBodyTouchMove : undefined}
              onTouchEnd={audioMode === "audio" ? handlePlayerBodyTouchEnd : undefined}
              className={cn(
                "flex flex-1 flex-col overflow-hidden z-10",
                queueSheetState === "half" ? "pb-[52vh]" : audioMode === "lyrics" ? "pb-2" : "pb-14",
              )}
            >
              {/* ── AUDIO MODE VIEW ── */}
              {audioMode === "audio" ? (
                <div className="flex flex-1 flex-col justify-between overflow-hidden pb-1">
                  {/* Square Contained Artwork Card (YouTube Music Style with Double-Tap 5s Skip) */}
                  <div className="flex flex-1 items-center justify-center px-6 py-2 min-h-0">
                    <div
                      onClick={handleArtworkClick}
                      onTouchStart={handleArtworkTouchStart}
                      onTouchMove={handleArtworkTouchMove}
                      onTouchEnd={handleArtworkTouchEnd}
                      className={cn(
                        "relative overflow-hidden rounded-2xl shadow-[0_16px_44px_rgba(0,0,0,0.85)] select-none border border-white/5 cursor-pointer",
                        queueSheetState === "half"
                          ? "size-36 sm:size-44 aspect-square"
                          : "w-[84vw] max-w-[340px] max-h-[38vh] aspect-square",
                      )}
                    >
                      <TrackArtwork
                        artworkUrl={currentTrack?.artworkUrl}
                        className="size-full object-cover pointer-events-none"
                      />
                      {/* Double-tap 5s Skip Visual Feedback Overlay */}
                      {skipAnimation && (
                        <div
                          className={cn(
                            "absolute inset-y-0 w-1/2 z-30 flex flex-col items-center justify-center pointer-events-none select-none transition-all duration-200",
                            skipAnimation.side === "left"
                              ? "left-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent rounded-l-2xl"
                              : "right-0 bg-gradient-to-l from-black/80 via-black/45 to-transparent rounded-r-2xl",
                          )}
                        >
                          <div className="flex flex-col items-center justify-center gap-1.5 animate-in zoom-in-90 fade-in duration-150">
                            <div className="flex size-11 items-center justify-center rounded-full bg-white/25 backdrop-blur-md text-white border border-white/30 shadow-lg">
                              <span className="text-sm font-black tracking-wider">
                                {skipAnimation.side === "right" ? "+5s" : "-5s"}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-white drop-shadow-md tracking-wider uppercase">
                              {skipAnimation.side === "right" ? "Forward 5s" : "Rewind 5s"}
                            </span>
                          </div>
                        </div>
                      )}
                      {isLoading && (
                        <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2.5 transition-all">
                          <div className="size-12 rounded-full bg-black/75 border border-white/20 flex items-center justify-center shadow-lg">
                            <SpinnerSteps size={24} className="text-primary" />
                          </div>
                          <span className="text-xs font-semibold text-white/90 px-3 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-md">
                            Buffering stream...
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata & Controls Container (Systematic YT Music Structure) */}
                  <div className="shrink-0 flex flex-col gap-3 px-6 pb-2">
                    {/* Song Title & Artist */}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h2 className="truncate text-[22px] leading-tight font-bold tracking-tight text-white drop-shadow-sm">
                          {currentTrack?.title || "No track playing"}
                        </h2>
                        <ChevronRightIcon size={18} className="text-white/60 shrink-0" />
                      </div>
                      <div className="mt-1 flex items-center min-w-0">
                        {currentTrack ? (
                          <button
                            type="button"
                            onClick={() => {
                              const primaryArtist = currentTrack.artists?.[0] ?? {
                                id: "",
                                name: currentTrack.artist || "Unknown Artist",
                              };
                              handleArtistClick(primaryArtist);
                            }}
                            className="truncate text-sm font-medium text-white/75 hover:text-white active:text-primary transition-colors text-left underline-offset-2 hover:underline focus:outline-none"
                          >
                            {currentTrack.artist || "Unknown Artist"}
                          </button>
                        ) : (
                          <p className="truncate text-sm font-normal text-white/70">
                            Unknown Artist
                          </p>
                        )}
                      </div>
                    </div>

                    {/* ACTION PILLS ROW (Like/Dislike, Lyrics, Save, Share, Download) */}
                    {queueSheetState === "collapsed" && (
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                        {/* Like / Dislike Combined Pill */}
                        <div className="flex items-center rounded-full bg-black/40 backdrop-blur-xl hover:bg-black/50 border border-white/15 h-9 px-3.5 gap-2.5 text-xs font-medium text-white shrink-0 shadow-sm">
                          <button
                            type="button"
                            onClick={handleToggleLike}
                            className={cn(
                              "flex items-center gap-1.5 transition-colors active:scale-95",
                              isLiked ? "text-white font-bold" : "text-white/90 hover:text-white",
                            )}
                            aria-label="Like"
                          >
                            {isLiked ? (
                              <LikeActiveIcon size={18} className="fill-current text-white" />
                            ) : (
                              <LikeIcon size={18} />
                            )}
                            <span>{likeCountText}</span>
                          </button>
                          <div className="h-3.5 w-px bg-white/20" />
                          <button
                            type="button"
                            onClick={handleToggleDislike}
                            className={cn(
                              "transition-colors active:scale-95",
                              isDisliked ? "text-white font-bold" : "text-white/90 hover:text-white",
                            )}
                            aria-label="Dislike"
                          >
                            {isDisliked ? (
                              <DislikeActiveIcon size={18} className="fill-current text-white" />
                            ) : (
                              <DislikeIcon size={18} />
                            )}
                          </button>
                        </div>

                        {/* Lyrics Pill */}
                        <button
                          type="button"
                          onClick={() => handleSetAudioMode("lyrics")}
                          className="flex items-center gap-2 rounded-full h-9 px-4 text-xs font-medium shrink-0 active:scale-95 transition-all bg-black/40 backdrop-blur-xl hover:bg-black/50 border border-white/15 text-white/90 hover:text-white shadow-sm"
                        >
                          <QuoteIcon size={16} />
                          <span>Lyrics</span>
                        </button>

                        {/* Save to Playlist Pill */}
                        <button
                          type="button"
                          onClick={handleSaveToPlaylist}
                          className="flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-xl hover:bg-black/50 border border-white/15 h-9 px-4 text-xs font-medium text-white/90 hover:text-white active:scale-95 transition-all shrink-0 shadow-sm"
                        >
                          <YTSaveIcon size={18} />
                          <span>Save</span>
                        </button>

                        {/* Share Pill */}
                        <button
                          type="button"
                          onClick={handleShare}
                          className="flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-xl hover:bg-black/50 border border-white/15 h-9 px-4 text-xs font-medium text-white/90 hover:text-white active:scale-95 transition-all shrink-0 shadow-sm"
                        >
                          <ShareIcon size={18} />
                          <span>Share</span>
                        </button>

                        {/* Download Pill */}
                        <button
                          type="button"
                          onClick={handleToggleDownload}
                          className={cn(
                            "flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-xl hover:bg-black/50 border border-white/15 h-9 px-4 text-xs font-medium active:scale-95 transition-all shrink-0 shadow-sm",
                            downloadStatus === "ready"
                              ? "text-white font-semibold"
                              : "text-white/90 hover:text-white",
                          )}
                          aria-label="Download"
                          title={
                            downloadStatus === "ready"
                              ? "Downloaded (click to remove)"
                              : "Download track"
                          }
                        >
                          {downloadStatus === "downloading" ? (
                            <SpinnerSteps size={16} className="text-white" />
                          ) : downloadStatus === "ready" ? (
                            <CheckIcon size={18} className="text-white" />
                          ) : (
                            <DownloadIcon size={18} />
                          )}
                          <span>{downloadStatus === "ready" ? "Downloaded" : downloadStatus === "downloading" ? "Downloading" : "Download"}</span>
                        </button>
                      </div>
                    )}

                    {/* SEEKBAR PROGRESS */}
                    <div className="w-full mt-3">
                      <SeekBar layout="stacked" />
                    </div>

                    {/* MAIN TRANSPORT CONTROLS */}
                    <div className="flex items-center justify-between w-full px-2 mt-2 mb-1">
                      {/* Shuffle */}
                      <button
                        type="button"
                        onClick={() => playerController.toggleShuffle()}
                        className={cn(
                          "flex size-11 items-center justify-center transition-all active:scale-85 duration-100 ease-out",
                          isShuffle ? "text-white" : "text-white/70 hover:text-white",
                        )}
                        aria-label="Shuffle"
                      >
                        {isShuffle ? <ShuffleActiveIcon size={24} /> : <ShuffleIcon size={24} />}
                      </button>

                      {/* Skip Previous */}
                      <button
                        type="button"
                        onClick={() => void playerController.skipToPrevious()}
                        className="flex size-12 items-center justify-center text-white transition-all active:scale-85 duration-100 ease-out hover:opacity-80"
                        aria-label="Previous track"
                      >
                        <SkipPreviousIcon size={32} />
                      </button>

                      {/* Big White Circular Play/Pause */}
                      <button
                        type="button"
                        onClick={() => void playerController.togglePlayPause()}
                        className="flex size-16 items-center justify-center rounded-full bg-white text-black shadow-2xl active:scale-90 duration-100 ease-out transition-transform"
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isLoading ? (
                          <SpinnerSteps size={32} className="text-black" />
                        ) : isPlaying ? (
                          <PauseActiveIcon size={32} />
                        ) : (
                          <PlayActiveIcon size={32} className="translate-x-0.5" />
                        )}
                      </button>

                      {/* Skip Next */}
                      <button
                        type="button"
                        onClick={() => void playerController.skipToNext()}
                        className="flex size-12 items-center justify-center text-white transition-all active:scale-85 duration-100 ease-out hover:opacity-80"
                        aria-label="Next track"
                      >
                        <SkipNextIcon size={32} />
                      </button>

                      {/* Repeat */}
                      <button
                        type="button"
                        onClick={() => playerController.cyclePlaybackOrderMode()}
                        className={cn(
                          "flex size-11 items-center justify-center transition-all active:scale-85 duration-100 ease-out",
                          isRepeatAll || isRepeatOne
                            ? "text-white"
                            : "text-white/70 hover:text-white",
                        )}
                        aria-label="Repeat mode"
                      >
                        {isRepeatOne ? (
                          <RepeatOneActiveIcon size={24} />
                        ) : isRepeatAll ? (
                          <RepeatActiveIcon size={24} />
                        ) : (
                          <RepeatIcon size={24} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
              /* ── LIVE SYNCED LYRICS VIEW ── */
              <div className="flex flex-1 flex-col justify-between overflow-hidden px-6 pt-2">
                <div
                  ref={lyricsContainerRef}
                  onScroll={handleLyricsScroll}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  className="flex-1 overflow-y-auto overscroll-contain py-8 touch-pan-y no-scrollbar"
                >
                  {lyricsLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-white/60">
                      <SpinnerSteps size={32} className="text-primary" />
                      <span className="text-sm font-medium">Loading lyrics...</span>
                    </div>
                  ) : !lyrics || lyrics.lines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center text-white/50 px-4">
                      <p className="text-base font-semibold text-white/80">
                        No lyrics available for this song
                      </p>
                      <p className="text-xs text-white/50">
                        Enjoy the music or switch back to the poster view anytime.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5 pb-20">
                      {lyrics.lines.map((line, index) => {
                        const isActive = isSyncedLyrics(lyrics) && index === lyricsActiveIndex;
                        const isSeekable =
                          typeof line.startTimeSec === "number" && line.text.trim().length > 0;

                        return (
                          <div
                            key={index}
                            ref={(el) => {
                              lyricsLineRefs.current[index] = el;
                            }}
                            onClick={() => {
                              if (isSeekable && typeof line.startTimeSec === "number") {
                                void playerController.seekTo(line.startTimeSec);
                              }
                            }}
                            className={cn(
                              "transition-colors duration-200 select-text leading-relaxed",
                              isSeekable ? "cursor-pointer" : "cursor-default",
                              isActive
                                ? "text-white font-bold text-2xl sm:text-3xl scale-[1.03] origin-left drop-shadow-md"
                                : "text-white/40 font-semibold text-lg sm:text-xl hover:text-white/70",
                            )}
                          >
                            {line.text || "♪"}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Compact Seekbar & Controls under Lyrics */}
                <div
                  className="flex flex-col gap-2 pt-2 border-t border-white/10 bg-[#080808] -mx-6 px-6 pb-2"
                >
                  <div className="w-full">
                    <SeekBar layout="stacked" />
                  </div>
                  <div className="flex items-center justify-between pb-1">
                    <button
                      type="button"
                      onClick={() => void playerController.skipToPrevious()}
                      className="flex size-10 items-center justify-center text-white transition-transform active:scale-90"
                      aria-label="Previous track"
                    >
                      <SkipPreviousIcon size={26} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void playerController.togglePlayPause()}
                      className="flex size-13 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform active:scale-90"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <PauseActiveIcon size={26} />
                      ) : (
                        <PlayActiveIcon size={26} className="translate-x-0.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void playerController.skipToNext()}
                      className="flex size-10 items-center justify-center text-white transition-transform active:scale-90"
                      aria-label="Next track"
                    >
                      <SkipNextIcon size={26} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── UP NEXT QUEUE BOTTOM SHEET (Only in Audio Mode) ── */}
        {audioMode === "audio" && (
          <div
            ref={sheetRef}
            style={{
              transform:
                queueSheetState === "full"
                  ? "translate3d(0, 0%, 0)"
                  : queueSheetState === "half"
                  ? "translate3d(0, 46%, 0)"
                  : "translate3d(0, calc(100% - 52px), 0)",
            }}
            className={cn(
              "fixed inset-x-0 bottom-0 top-0 z-40 flex flex-col transform-gpu transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-transform",
              queueSheetState === "full"
                ? "bg-[#0a0a0a]/95 backdrop-blur-2xl text-foreground"
                : queueSheetState === "half"
                ? "bg-[#121215]/85 backdrop-blur-2xl rounded-t-3xl border-t border-white/20 shadow-[0_-16px_48px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.2)]"
                : "bg-[#121215]/80 backdrop-blur-xl border-t border-white/15 cursor-pointer shadow-[0_-8px_24px_rgba(0,0,0,0.6)]",
            )}
          >
            {/* DRAG HANDLE & HEADER BAR */}
            <div
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              onClick={() => {
                if (queueSheetState === "collapsed") {
                  setQueueSheetState("half");
                }
              }}
              className="flex shrink-0 flex-col pt-2 pb-2 px-4 cursor-grab active:cursor-grabbing select-none"
            >
              {/* STAGE 2: STICKY MINI PLAYER BAR */}
              {queueSheetState === "full" && (
                <div className="flex items-center justify-between pb-3 pt-1 border-b border-white/10">
                  <div
                    onClick={() => setQueueSheetState("half")}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="size-11 shrink-0 overflow-hidden rounded-lg shadow border border-white/10">
                      <TrackArtwork
                        artworkUrl={currentTrack?.artworkUrl}
                        size={44}
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold text-white">
                        {currentTrack?.title || "No track playing"}
                      </span>
                      <span className="truncate text-xs font-medium text-white/60">
                        {currentTrack?.artist || "Unknown Artist"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void playerController.togglePlayPause()}
                      className="flex size-9 items-center justify-center text-white hover:opacity-80 active:scale-90"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <PauseActiveIcon size={22} /> : <PlayActiveIcon size={22} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Horizontal Pill Drag Handle */}
              <div className="mx-auto h-1 w-10 rounded-full bg-white/35 my-1.5" />

              {/* "Playing from [Source]" Peek / Header */}
              {queueSheetState === "collapsed" ? (
                <div className="text-center pb-1">
                  <span className="truncate text-xs font-semibold text-white/80">
                    Playing from <span className="text-white">{playingFromTitle}</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1 pb-1.5 border-b border-white/10 mb-2">
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-white tracking-tight">
                        Up Next
                      </span>
                      {upcomingTracks.length > 0 && (
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white/80">
                          {upcomingTracks.length}
                        </span>
                      )}
                    </div>
                    <span className="truncate text-xs font-medium text-white/50 leading-tight mt-0.5">
                      Playing from <span className="text-white/80">{playingFromTitle}</span>
                    </span>
                  </div>

                  {/* Actions: Save Queue & Collapse button */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveQueueAsPlaylist}
                      disabled={saveStatus !== "idle"}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
                    >
                      <BookmarkIcon size={13} />
                      <span>
                        {saveStatus === "saving"
                          ? "Saving..."
                          : saveStatus === "saved"
                          ? "Saved!"
                          : "Save"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQueueSheetState("collapsed")}
                      className="flex size-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-all active:scale-90"
                      aria-label="Collapse queue"
                    >
                      <ChevronDownIcon size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* UP NEXT TRACK LIST */}
            {queueSheetState !== "collapsed" && (
              <div
                onTouchStart={handleQueueListTouchStart}
                onTouchEnd={handleQueueListTouchEnd}
                className="flex-1 overflow-y-auto overscroll-contain px-3 pb-20 touch-pan-y"
              >
                {upcomingTracks.length === 0 ? (
                  isLoading || queue.length <= 1 ? (
                    <div className="flex flex-col py-2">
                      <div className="flex items-center gap-2 px-2 pb-2 text-xs font-semibold text-white/50">
                        <SpinnerSteps size={14} className="text-primary" />
                        <span>Loading upcoming tracks...</span>
                      </div>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <ShimmerQueueRow key={i} index={i} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-white/50 text-xs">
                      <p>No upcoming tracks in queue.</p>
                    </div>
                  )
                ) : (
                  upcomingTracks.map(({ track, absoluteIndex }) => (
                    <SwipeableQueueRow
                      key={`${track.id}-${absoluteIndex}`}
                      track={track}
                      absoluteIndex={absoluteIndex}
                      isDragged={draggedIndex === absoluteIndex}
                      dropEdge={
                        dropTarget?.index === absoluteIndex
                          ? dropTarget.insertAfter
                            ? "after"
                            : "before"
                          : null
                      }
                      onPlay={handlePlayQueueTrack}
                      onInstantPlay={handleInstantPlayTrack}
                      onRemove={handleRemoveTrack}
                      onDragStart={handleRowDragStart}
                      onDragMove={handleRowDragMove}
                      onDragEnd={handleRowDragEnd}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Feedback toast */}
        {toastMessage && (
          <div className="fixed top-14 sm:top-8 left-1/2 -translate-x-1/2 z-[250] flex items-center gap-2.5 rounded-full bg-neutral-900/95 dark:bg-zinc-950/95 px-4 py-2 text-sm font-medium text-white shadow-[0_16px_40px_rgba(0,0,0,0.7)] border border-white/15 backdrop-blur-2xl pointer-events-none select-none whitespace-nowrap animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckIcon size={14} aria-hidden="true" />
            </div>
            <span className="text-xs sm:text-sm font-semibold tracking-wide text-white">{toastMessage}</span>
          </div>
        )}

        {/* Sleep Timer Bottom Sheet Modal */}
        <SleepTimerSheet
          isOpen={isSleepTimerSheetOpen}
          onClose={() => setIsSleepTimerSheetOpen(false)}
          onTimerSet={handleTimerSet}
        />
      </motion.div>
    )}
  </AnimatePresence>
);
}
