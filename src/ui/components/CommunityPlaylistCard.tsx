import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Playlist, Track } from "../../datasource/types";
import type { PlayerControllerActions } from "../../player/playerStore";
import type { LibraryController } from "../../player/LibraryController";
import { MenuDotsIcon, PlayActiveIcon } from "../icons";
import { TrackArtwork } from "./TrackArtwork";
import { useTrackContextMenu } from "./TrackContextMenu";

interface CommunityPlaylistCardProps {
  playlist: Playlist;
  playerController: PlayerControllerActions;
  libraryController?: LibraryController;
  onOpenPlaylist: (playlist: Playlist) => void;
  className?: string;
}

const previewTracksCache = new Map<string, Track[]>();

export const CommunityPlaylistCard = memo(function CommunityPlaylistCard({
  playlist,
  playerController,
  libraryController,
  onOpenPlaylist,
  className,
}: CommunityPlaylistCardProps) {
  const { openTrackMenu } = useTrackContextMenu();
  const [tracks, setTracks] = useState<Track[] | null>(() => previewTracksCache.get(playlist.id) ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => !previewTracksCache.has(playlist.id));

  useEffect(() => {
    if (!libraryController) return;
    const cached = previewTracksCache.get(playlist.id);
    if (cached) {
      setTracks(cached);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    libraryController
      .getPlaylistTracks(playlist)
      .then((items) => {
        if (!isMounted) return;
        const slice = items.slice(0, 4);
        previewTracksCache.set(playlist.id, slice);
        setTracks(slice);
      })
      .catch(() => {
        if (!isMounted) return;
        setTracks([]);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [libraryController, playlist]);

  const handlePlayPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tracks && tracks.length > 0) {
      void playerController.playTrackById(tracks[0].id);
    } else {
      onOpenPlaylist(playlist);
    }
  };

  const handlePlayTrack = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    void playerController.playTrackById(track.id);
  };

  const subtitle = [
    playlist.owner || "Community",
    playlist.trackCount ? `${playlist.trackCount} songs` : (tracks && tracks.length > 0 ? `${tracks.length} songs` : null),
  ].filter(Boolean).join(" • ");

  const has4Tracks = Boolean(tracks && tracks.length >= 4);

  return (
    <div
      onClick={() => onOpenPlaylist(playlist)}
      className={cn(
        "group/card w-[84vw] max-w-[340px] shrink-0 snap-center rounded-3xl",
        "bg-[#18181a] border border-white/[0.08] hover:border-white/[0.18]",
        "p-4 sm:p-5 flex flex-col gap-3.5 shadow-xl transition-all duration-200 select-none cursor-pointer",
        className,
      )}
    >
      {/* ── Collage or Playlist Cover ──────────────────────────────────── */}
      <div className="relative size-40 sm:size-44 mx-auto rounded-2xl overflow-hidden shadow-md bg-black/40 border border-white/5">
        {has4Tracks && tracks ? (
          <div className="grid grid-cols-2 grid-rows-2 size-full gap-0.5">
            {tracks.slice(0, 4).map((t, idx) => (
              <TrackArtwork
                key={t.id || idx}
                artworkUrl={t.artworkUrl}
                size={88}
                className="size-full object-cover"
                variant="album"
              />
            ))}
          </div>
        ) : (
          <TrackArtwork
            artworkUrl={playlist.artworkUrl}
            size={176}
            className="size-full object-cover transition-transform duration-300 group-hover/card:scale-105"
            variant="playlist"
          />
        )}
      </div>

      {/* ── Playlist Header (Title, Author, Circular Play Button) ────────── */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div className="flex flex-col min-w-0 flex-1">
          <h3 className="truncate text-base sm:text-lg font-bold tracking-tight text-white group-hover/card:text-primary transition-colors">
            {playlist.title}
          </h3>
          <span className="truncate text-xs text-white/60 mt-0.5">
            {subtitle}
          </span>
        </div>

        <button
          type="button"
          onClick={handlePlayPlaylist}
          className="size-11 sm:size-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer"
          aria-label={`Play ${playlist.title}`}
        >
          <PlayActiveIcon size={20} className="translate-x-0.5 fill-black text-black" />
        </button>
      </div>

      {/* ── 3 Preview Tracks ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 pt-1 border-t border-white/[0.06]">
        {isLoading && !tracks && (
          <div className="flex flex-col gap-2 py-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-1 animate-pulse">
                <div className="size-10 rounded-lg bg-white/10 shrink-0" />
                <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                  <div className="h-3 w-3/4 rounded bg-white/10" />
                  <div className="h-2.5 w-1/2 rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {tracks && tracks.slice(0, 3).map((track) => (
          <div
            key={track.id}
            role="button"
            tabIndex={0}
            onClick={(e) => handlePlayTrack(track, e)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handlePlayTrack(track, e as unknown as React.MouseEvent);
              }
            }}
            className="group/track relative flex items-center gap-3 p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors cursor-pointer text-left"
          >
            <div className="relative size-10 rounded-lg overflow-hidden shrink-0 bg-white/5 shadow-xs">
              <TrackArtwork
                artworkUrl={track.artworkUrl}
                size={40}
                iconSize={18}
                variant="album"
                className="size-full object-cover group-hover/track:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/track:opacity-100 transition-opacity">
                <PlayActiveIcon size={14} className="text-white fill-white translate-x-0.5" />
              </div>
            </div>

            <div className="flex flex-1 min-w-0 flex-col justify-center gap-0.5">
              <span className="truncate text-xs sm:text-sm font-semibold text-white group-hover/track:text-primary transition-colors">
                {track.title}
              </span>
              <span className="truncate text-[11px] sm:text-xs text-white/60">
                {track.artist || "Unknown Artist"}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openTrackMenu(e, track);
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white active:scale-90 transition-all opacity-80 sm:opacity-0 sm:group-hover/track:opacity-100"
              aria-label="Track options"
            >
              <MenuDotsIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});
