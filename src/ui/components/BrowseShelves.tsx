import { memo } from "react";
import { cn } from "@/lib/utils";
import type { Album, Artist, BrowseLink, BrowseShelf, Playlist, Track } from "../../datasource/types";
import type { PlayerControllerActions } from "../../player/playerStore";
import type { LibraryController } from "../../player/LibraryController";
import { ChevronRightIcon, MenuDotsIcon, PlayActiveIcon } from "../icons";
import { AlbumCard } from "./AlbumCard";
import { TrackArtwork } from "./TrackArtwork";
import { usePlaylistContextMenu } from "./PlaylistContextMenu";
import { useTrackContextMenu } from "./TrackContextMenu";
import { CommunityPlaylistCard } from "./CommunityPlaylistCard";
import { DailyDiscoverCard } from "./DailyDiscoverCard";

/** Horizontal, scrollable, and clipped at the edge so there is a hint of more. */
const SHELF_ROW = "flex gap-2.5 sm:gap-3.5 overflow-x-auto pb-1.5 no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]";

function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function isCommunityShelf(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("community") || t.includes("कम्युनिटी");
}

function isDailyDiscoverShelf(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("daily discover") || t.includes("discover") || t.includes("खोज") || t.includes("for you");
}

function isHitsShelf(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("hit") || t.includes("trending") || t.includes("hitlist") || t.includes("सुपरहिट");
}

const QuickPickItem = memo(function QuickPickItem({
  track,
  onSelect,
  onContextMenu,
  onWarm,
}: {
  track: Track;
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onWarm?: () => void;
}) {
  const subtitle = [track.artist, track.viewCountText].filter(Boolean).join(" • ") || track.artist || "Unknown Artist";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onMouseEnter={onWarm}
      onTouchStart={onWarm}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex items-center gap-3 p-1.5 sm:p-2 rounded-xl select-none cursor-pointer text-left",
        "bg-transparent hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="relative size-12 sm:size-13 shrink-0 rounded-lg overflow-hidden bg-white/5 shadow-xs">
        <TrackArtwork
          artworkUrl={track.artworkUrl}
          size={56}
          iconSize={22}
          variant="album"
          className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md scale-90 group-hover:scale-100 transition-transform">
            <PlayActiveIcon size={14} className="translate-x-0.5 fill-black text-black" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-w-0 flex-col justify-center gap-0.5">
        <span className="truncate text-sm font-semibold tracking-tight text-white group-hover:text-primary transition-colors">
          {track.title}
        </span>
        <span className="truncate text-xs text-white/60">
          {subtitle}
        </span>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e);
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white active:scale-90 transition-all opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="More options"
      >
        <MenuDotsIcon size={16} />
      </button>
    </div>
  );
});

const ArtistTile = memo(function ArtistTile({ artist, onOpen }: { artist: Artist; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-28 sm:w-32 shrink-0 flex-col items-center gap-2 rounded-xl p-1.5 sm:p-2 text-center transition-all hover:bg-card active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TrackArtwork
        className="size-20 sm:size-24 rounded-full shadow-sm"
        size={96}
        artworkUrl={artist.artworkUrl}
        iconSize={28}
        variant="artist"
      />
      <span className="line-clamp-2 text-xs font-semibold text-foreground">{artist.name}</span>
    </button>
  );
});

const PlaylistTile = memo(function PlaylistTile({ playlist, onOpen }: { playlist: Playlist; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-32 sm:w-36 shrink-0 flex-col gap-2 rounded-xl p-1.5 sm:p-2 text-left transition-all hover:bg-card active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TrackArtwork
        className="size-28 sm:size-32 rounded-xl object-cover shadow-sm border border-white/10"
        size={128}
        artworkUrl={playlist.artworkUrl}
        iconSize={28}
        variant="playlist"
      />
      <span className="line-clamp-2 text-xs font-semibold text-foreground leading-snug">{playlist.title}</span>
      <span className="truncate text-[11px] text-muted-foreground">{playlist.owner}</span>
    </button>
  );
});

export interface BrowseShelvesProps {
  shelves: readonly BrowseShelf[];
  playerController: PlayerControllerActions;
  libraryController?: LibraryController;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  /** Absent hides the chips: a surface with nowhere to drill into should not offer to. */
  onFollowLink?: (link: BrowseLink) => void;
  className?: string;
}

export const BrowseShelves = memo(function BrowseShelves({
  shelves,
  playerController,
  libraryController,
  onOpenAlbum,
  onOpenArtist,
  onOpenPlaylist,
  onFollowLink,
  className,
}: BrowseShelvesProps) {
  const { openTrackMenu } = useTrackContextMenu();
  const { openPlaylistMenu, openAlbumMenu } = usePlaylistContextMenu();

  const playShelfTrack = (_shelfTracks: Track[], track: Track) => {
    void playerController.playTrackById(track.id);
  };

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {shelves.map((shelf, shelfIndex) => {
        const shelfTitle = shelf.title?.trim() || (
          shelf.albums.length > 0 ? "Recommended Albums" :
          shelf.playlists.length > 0 ? "Featured Playlists" :
          shelf.artists.length > 0 ? "Featured Artists" :
          shelf.tracks.length > 0 ? "Recommended Songs" : `Section ${shelfIndex + 1}`
        );

        const isCommunity = isCommunityShelf(shelfTitle) && shelf.playlists.length > 0;
        const isDailyDiscover = isDailyDiscoverShelf(shelfTitle) && shelf.tracks.length > 0;
        const isHits = isHitsShelf(shelfTitle) && shelf.playlists.length > 0;
        const isArtistSpotlight = Boolean(shelf.primaryArtist);

        const hasMultipleTypes = [
          shelf.tracks.length > 0,
          shelf.albums.length > 0,
          shelf.playlists.length > 0,
          shelf.artists.length > 0,
        ].filter(Boolean).length > 1;

        const hasTracks = shelf.tracks.length > 0;
        const playAllTracks = () => {
          if (hasTracks) {
            void playerController.playTrackById(shelf.tracks[0].id);
          }
        };

        // ── 1. COMMUNITY PLAYLISTS SHELF (Screenshot 1) ─────────────────
        if (isCommunity) {
          return (
            <section key={`${shelfTitle}:${shelfIndex}`} className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {shelfTitle}
                </h2>
              </div>

              <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]">
                {shelf.playlists.map((playlist) => (
                  <CommunityPlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    playerController={playerController}
                    libraryController={libraryController}
                    onOpenPlaylist={onOpenPlaylist}
                  />
                ))}
              </div>
            </section>
          );
        }

        // ── 2. YOUR DAILY DISCOVER SHELF (Screenshot 3) ──────────────────
        if (isDailyDiscover) {
          return (
            <section key={`${shelfTitle}:${shelfIndex}`} className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {shelfTitle}
                </h2>
                {hasTracks && (
                  <button
                    type="button"
                    onClick={playAllTracks}
                    className="rounded-full border border-white/20 bg-white/10 hover:bg-white/20 active:scale-95 px-3.5 py-1 text-xs font-semibold text-white transition-all shadow-xs cursor-pointer"
                  >
                    Play all
                  </button>
                )}
              </div>

              <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]">
                {shelf.tracks.map((track) => (
                  <DailyDiscoverCard
                    key={track.id}
                    track={track}
                    playerController={playerController}
                  />
                ))}
              </div>
            </section>
          );
        }

        return (
          <section key={`${shelfTitle}:${shelfIndex}`} className="flex flex-col gap-3.5">
            {/* ── Shelf Header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              {isArtistSpotlight && shelf.primaryArtist ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => shelf.primaryArtist && onOpenArtist(shelf.primaryArtist)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      shelf.primaryArtist && onOpenArtist(shelf.primaryArtist);
                    }
                  }}
                  className="flex items-center gap-2.5 group/artist cursor-pointer select-none"
                >
                  {shelf.primaryArtist.artworkUrl && (
                    <TrackArtwork
                      artworkUrl={shelf.primaryArtist.artworkUrl}
                      size={36}
                      iconSize={18}
                      variant="artist"
                      className="size-9 rounded-full object-cover ring-2 ring-white/10 shadow-sm group-hover/artist:ring-primary transition-all"
                    />
                  )}
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white group-hover/artist:text-primary transition-colors flex items-center gap-1.5">
                    {shelf.primaryArtist.name || shelfTitle}
                    <ChevronRightIcon size={20} className="text-white/60 group-hover/artist:text-white group-hover/artist:translate-x-0.5 transition-all" />
                  </h2>
                </div>
              ) : (
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {shelfTitle}
                </h2>
              )}

              {hasTracks && !isArtistSpotlight && (
                <button
                  type="button"
                  onClick={playAllTracks}
                  className="rounded-full border border-white/20 bg-white/5 hover:bg-white/10 active:scale-95 px-3 py-1 text-xs font-semibold text-white transition-all shadow-xs cursor-pointer"
                >
                  Play all
                </button>
              )}
            </div>

            {/* ── Tracks row (Quick picks / Songs) ──────────────────────── */}
            {hasTracks && (
              <div className="flex gap-2.5 sm:gap-4 overflow-x-auto pb-2 no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]">
                {chunkArray(shelf.tracks, 4).map((chunk, colIndex) => (
                  <div
                    key={`col-${colIndex}`}
                    className="w-[88vw] max-w-[360px] shrink-0 flex flex-col gap-1.5"
                  >
                    {chunk.map((track) => (
                      <QuickPickItem
                        key={track.id}
                        track={track}
                        onSelect={() => playShelfTrack(shelf.tracks, track)}
                        onContextMenu={(event) => openTrackMenu(event, track)}
                        onWarm={() => playerController.warmTrack(track)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* ── Follow links / Mood chips ────────────────────────────── */}
            {onFollowLink && shelf.links.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {shelf.links.map((link) => (
                  <button
                    key={link.browseId}
                    type="button"
                    onClick={() => onFollowLink(link)}
                    className="rounded-full bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    {link.title}
                  </button>
                ))}
              </div>
            )}

            {/* ── Albums Row ───────────────────────────────────────────── */}
            {shelf.albums.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {hasMultipleTypes && shelf.tracks.length > 0 && (
                  <h3 className="text-lg font-bold tracking-tight text-foreground pt-3">
                    Recommended Albums
                  </h3>
                )}
                <div className={SHELF_ROW}>
                  {shelf.albums.map((album) => (
                    <div
                      key={album.id}
                      className="w-32 sm:w-36 shrink-0"
                      onContextMenu={(event) => openAlbumMenu(event, album)}
                    >
                      <AlbumCard
                        artworkUrl={album.artworkUrl}
                        title={album.title}
                        subtitle={album.artist}
                        onClick={() => onOpenAlbum(album)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Playlists Row (Hits / Standard) ──────────────────────── */}
            {shelf.playlists.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {hasMultipleTypes && (shelf.tracks.length > 0 || shelf.albums.length > 0) && (
                  <h3 className="text-lg font-bold tracking-tight text-foreground pt-3">
                    Featured Playlists
                  </h3>
                )}
                {isHits ? (
                  /* Bold Hitlist / Trending playlist cards (Screenshot 2) */
                  <div className={SHELF_ROW}>
                    {shelf.playlists.map((playlist) => (
                      <button
                        key={playlist.id}
                        type="button"
                        onClick={() => onOpenPlaylist(playlist)}
                        onContextMenu={(event) => openPlaylistMenu(event, playlist)}
                        className="group/hit flex w-36 sm:w-44 shrink-0 flex-col gap-2 rounded-2xl p-1.5 text-left transition-all hover:bg-white/[0.04] active:scale-95 cursor-pointer"
                      >
                        <div className="relative size-36 sm:size-44 rounded-2xl overflow-hidden shadow-lg border border-white/10 bg-neutral-900">
                          <TrackArtwork
                            className="size-full object-cover group-hover/hit:scale-105 transition-transform duration-300"
                            size={176}
                            artworkUrl={playlist.artworkUrl}
                            iconSize={32}
                            variant="playlist"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/hit:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="size-11 rounded-full bg-white text-black flex items-center justify-center shadow-md">
                              <PlayActiveIcon size={18} className="translate-x-0.5 fill-black text-black" />
                            </div>
                          </div>
                        </div>
                        <span className="line-clamp-2 text-sm font-bold text-white group-hover/hit:text-primary transition-colors leading-snug">
                          {playlist.title}
                        </span>
                        {playlist.owner && (
                          <span className="truncate text-xs text-white/60">
                            {playlist.owner}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={SHELF_ROW}>
                    {shelf.playlists.map((playlist) => (
                      <div
                        key={playlist.id}
                        onContextMenu={(event) => openPlaylistMenu(event, playlist)}
                      >
                        <PlaylistTile playlist={playlist} onOpen={() => onOpenPlaylist(playlist)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Artists Row ──────────────────────────────────────────── */}
            {shelf.artists.length > 0 && !isArtistSpotlight && (
              <div className="flex flex-col gap-2.5">
                {hasMultipleTypes && (shelf.tracks.length > 0 || shelf.albums.length > 0 || shelf.playlists.length > 0) && (
                  <h3 className="text-lg font-bold tracking-tight text-foreground pt-3">
                    Featured Artists
                  </h3>
                )}
                <div className={SHELF_ROW}>
                  {shelf.artists.map((artist) => (
                    <ArtistTile
                      key={artist.id}
                      artist={artist}
                      onOpen={() => onOpenArtist(artist)}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
});
