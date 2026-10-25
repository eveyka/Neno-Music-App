import { memo, useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AccountProfile, Album, Artist, Playlist, SpeedDialItem, Track } from "../../datasource/types";
import type { PlayerControllerActions } from "../../player/playerStore";
import { ChevronRightIcon, PlayActiveIcon } from "../icons";
import { AccountAvatar } from "./AccountSwitcher";
import { TrackArtwork } from "./TrackArtwork";
import { useTrackContextMenu } from "./TrackContextMenu";

interface SpeedDialSectionProps {
  items?: readonly SpeedDialItem[];
  tracks?: readonly Track[];
  account?: AccountProfile | null;
  playerController: PlayerControllerActions;
  onOpenSpeedDial?: () => void;
  onOpenAlbum?: (album: Album) => void;
  onOpenPlaylist?: (playlist: Playlist) => void;
  onOpenArtist?: (artist: Artist) => void;
  isLoading?: boolean;
  className?: string;
}

const ITEMS_PER_PAGE = 9;
const MAX_SPEED_DIAL_ITEMS = 27;

export const SpeedDialSection = memo(function SpeedDialSection({
  items: customItems,
  tracks,
  account,
  playerController,
  onOpenSpeedDial,
  onOpenAlbum,
  onOpenPlaylist,
  onOpenArtist,
  isLoading = false,
  className,
}: SpeedDialSectionProps) {
  const { openTrackMenu } = useTrackContextMenu();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Normalize into SpeedDialItem list
  const speedDialItems = useMemo<SpeedDialItem[]>(() => {
    if (customItems && customItems.length > 0) {
      return customItems.slice(0, MAX_SPEED_DIAL_ITEMS);
    }
    if (tracks && tracks.length > 0) {
      return tracks.slice(0, MAX_SPEED_DIAL_ITEMS).map((track) => ({
        kind: "track" as const,
        item: track,
      }));
    }
    return [];
  }, [customItems, tracks]);

  const totalPages = Math.max(1, Math.ceil(speedDialItems.length / ITEMS_PER_PAGE));

  // Chunk into pages of 9 items (3x3)
  const pages = useMemo(() => {
    const chunks: SpeedDialItem[][] = [];
    for (let i = 0; i < speedDialItems.length; i += ITEMS_PER_PAGE) {
      chunks.push(speedDialItems.slice(i, i + ITEMS_PER_PAGE));
    }
    return chunks;
  }, [speedDialItems]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || el.clientWidth === 0) return;
    const pageIndex = Math.round(el.scrollLeft / el.clientWidth);
    setCurrentPage((prev) => (prev !== pageIndex ? pageIndex : prev));
  }, []);

  const scrollToPage = (pageIndex: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      left: pageIndex * el.clientWidth,
      behavior: "smooth",
    });
    setCurrentPage(pageIndex);
  };

  const handleItemClick = (speedDialItem: SpeedDialItem) => {
    switch (speedDialItem.kind) {
      case "track":
        void playerController.playTrackById(speedDialItem.item.id);
        break;
      case "album":
        onOpenAlbum?.(speedDialItem.item);
        break;
      case "playlist":
        onOpenPlaylist?.(speedDialItem.item);
        break;
      case "artist":
        onOpenArtist?.(speedDialItem.item);
        break;
    }
  };

  if (!isLoading && speedDialItems.length === 0) {
    return null;
  }

  return (
    <section className={cn("flex flex-col gap-3.5 select-none", className)}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenSpeedDial}
          className="group flex items-center gap-2.5 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <AccountAvatar
            artworkUrl={account?.artworkUrl}
            className="size-8 sm:size-9 rounded-full border border-white/10 shrink-0"
            iconSize={18}
          />
          <div className="flex flex-col justify-center min-w-0">
            {account?.name && (
              <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider line-clamp-1 leading-none mb-1">
                {account.name}
              </span>
            )}
            <div className="flex items-center gap-1 text-white group-hover:text-primary transition-colors">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-none">
                Speed dial
              </h2>
              <ChevronRightIcon
                size={20}
                className="text-white/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
              />
            </div>
          </div>
        </button>
      </div>

      {/* ── 3x3 Grid Paged Carousel ─────────────────────────────────────── */}
      <div className="relative w-full">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex w-full overflow-x-auto snap-x snap-mandatory no-scrollbar [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {isLoading ? (
            <div className="w-full shrink-0 snap-start grid grid-cols-3 grid-rows-3 gap-2 sm:gap-3">
              {Array.from({ length: ITEMS_PER_PAGE }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-square w-full rounded-xl sm:rounded-2xl bg-card/60 animate-pulse border border-white/5"
                />
              ))}
            </div>
          ) : (
            pages.map((pageItems, pageIdx) => (
              <div
                key={`speed-dial-page-${pageIdx}`}
                className="w-full shrink-0 snap-start grid grid-cols-3 grid-rows-3 gap-2 sm:gap-3"
              >
                {pageItems.map((entry, entryIdx) => {
                  const isTrack = entry.kind === "track";
                  const isArtist = entry.kind === "artist";
                  const isAlbum = entry.kind === "album";
                  const isPlaylist = entry.kind === "playlist";

                  const title = isArtist
                    ? entry.item.name
                    : entry.item.title;

                  const artworkUrl = entry.item.artworkUrl;

                  let badgeLabel: string | null = null;
                  if (isAlbum) badgeLabel = "Album";
                  else if (isPlaylist) badgeLabel = "Playlist";
                  else if (isArtist) badgeLabel = "Artist";

                  return (
                    <div
                      key={`${entry.kind}-${entry.item.id || entryIdx}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleItemClick(entry)}
                      onMouseEnter={() => {
                        if (isTrack) playerController.warmTrack(entry.item);
                      }}
                      onTouchStart={() => {
                        if (isTrack) playerController.warmTrack(entry.item);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleItemClick(entry);
                        }
                      }}
                      onContextMenu={(e) => {
                        if (isTrack) openTrackMenu(e, entry.item);
                      }}
                      className={cn(
                        "group relative aspect-square w-full overflow-hidden cursor-pointer select-none",
                        isArtist ? "rounded-2xl sm:rounded-3xl" : "rounded-2xl",
                        "border border-white/[0.1] bg-card/40 backdrop-blur-md transition-all duration-300",
                        "hover:border-white/[0.28] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] active:scale-[0.97]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      {/* Top Specular glass highlight line */}
                      <span
                        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent z-10"
                        aria-hidden="true"
                      />

                      {/* Artwork */}
                      <div className="size-full overflow-hidden">
                        <TrackArtwork
                          artworkUrl={artworkUrl}
                          size={240}
                          iconSize={32}
                          variant={isArtist ? "artist" : "album"}
                          className={cn(
                            "size-full object-cover transition-transform duration-300 group-hover:scale-105",
                            isArtist && "scale-[0.92] rounded-full",
                          )}
                        />
                      </div>

                      {/* Gradient Overlay for Readability */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />

                      {/* Top Badge for Album/Playlist/Artist */}
                      {badgeLabel && (
                        <div className="absolute top-2 left-2 pointer-events-none z-10">
                          <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] sm:text-[10px] font-bold text-white/90 uppercase tracking-wider border border-white/15 shadow-xs">
                            {badgeLabel}
                          </span>
                        </div>
                      )}

                      {/* Desktop Play Overlay Icon for Track */}
                      {isTrack && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                          <div className="size-11 rounded-full bg-primary/95 text-primary-foreground flex items-center justify-center shadow-[0_4px_20px_rgba(255,0,51,0.5)] transform scale-85 group-hover:scale-100 transition-transform">
                            <PlayActiveIcon size={20} className="translate-x-0.5" />
                          </div>
                        </div>
                      )}

                      {/* Title Text */}
                      <div className="absolute bottom-2 left-2.5 right-2.5 sm:bottom-3 sm:left-3 sm:right-3 pointer-events-none z-10">
                        <span className="line-clamp-2 text-xs sm:text-sm font-bold text-white leading-tight drop-shadow-md tracking-tight">
                          {title}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Pagination Indicator Dots ───────────────────────────────────── */}
      {totalPages > 1 && !isLoading && (
        <div className="flex items-center justify-center gap-1.5 py-1">
          {Array.from({ length: totalPages }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => scrollToPage(idx)}
              aria-label={`Go to speed dial page ${idx + 1}`}
              className={cn(
                "transition-all duration-300 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                currentPage === idx
                  ? "w-4.5 sm:w-5 h-1.5 bg-white shadow-xs"
                  : "size-1.5 bg-white/30 hover:bg-white/60",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
});

