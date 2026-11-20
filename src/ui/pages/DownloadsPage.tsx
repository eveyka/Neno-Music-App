import { useMemo, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import {
  CloseIcon,
  CompassIcon,
  DownloadIcon,
  PlayActiveIcon,
  SearchIcon,
  ShuffleIcon,
  StorageIcon,
  TrashIcon,
} from "@/ui/icons";
import type { Album, Artist, Playlist, Track } from "../../datasource/types";
import type { LibraryController, LibraryState } from "../../player/LibraryController";
import type { PlayerControllerActions } from "../../player/playerStore";
import {
  cancelDownload,
  DEFAULT_OFFLINE_MAX_BYTES,
  getOfflineMaxBytes,
  queueDownloads,
  removeAllDownloads,
  useOfflineState,
} from "../../player/offlineStore";
import { useDownloadedPlaylists } from "../../player/downloadedPlaylists";
import { getLocalPlaylistItems, subscribeToLocalPlaylists } from "../../player/localPlaylists";
import { TrackRow } from "../components/TrackRow";
import { TrackArtwork } from "../components/TrackArtwork";
import { AlbumCard } from "../components/AlbumCard";
import { SelectionBar } from "../components/SelectionBar";
import { useTrackContextMenu } from "../components/TrackContextMenu";
import { usePlaylistContextMenu } from "../components/PlaylistContextMenu";
import { useNowPlaying } from "../hooks/useNowPlaying";
import { useTrackSelection } from "../hooks/useTrackSelection";
import { isLikedSongsId, likedSongsCover } from "../likedSongsArtwork";

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:[grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))] lg:gap-5";

type DownloadsSubTab = "songs" | "playlists";

interface DownloadsPageProps {
  playerController: PlayerControllerActions;
  libraryController?: LibraryController;
  libraryState?: LibraryState;
  onOpenAlbum?: (album: Album) => void;
  onOpenArtist?: (artist: Artist) => void;
  onOpenPlaylist?: (playlist: Playlist) => void;
  onOpenBrowse?: () => void;
  embedded?: boolean;
}

export function DownloadsPage({
  playerController,
  libraryController,
  libraryState,
  onOpenAlbum: _onOpenAlbum,
  onOpenArtist: _onOpenArtist,
  onOpenPlaylist,
  onOpenBrowse,
  embedded = false,
}: DownloadsPageProps) {
  const offline = useOfflineState();
  const maxBytes = getOfflineMaxBytes() || DEFAULT_OFFLINE_MAX_BYTES;
  const [subTab, setSubTab] = useState<DownloadsSubTab>("songs");
  const [query, setQuery] = useState("");
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
  const [showOfflineStorage, setShowOfflineStorage] = useState(false);
  const { currentTrackId, isPlaying } = useNowPlaying();
  const { openTrackMenu, openPlaylistPicker } = useTrackContextMenu();
  const { openPlaylistMenu } = usePlaylistContextMenu();

  // All downloaded songs in offline store (includes individual, album, playlist, and liked downloads)
  const downloads = useMemo(
    () =>
      Object.values(offline.entries).sort(
        (left, right) => right.downloadedAt - left.downloadedAt,
      ),
    [offline.entries],
  );

  const downloadedTracks = useMemo(() => downloads.map((e) => e.track), [downloads]);

  const inFlight = useMemo(() => {
    const ids = [
      ...(offline.downloadingId ? [offline.downloadingId] : []),
      ...offline.queued,
    ];
    return ids
      .map((id) => offline.pending[id])
      .filter((track): track is NonNullable<typeof track> => Boolean(track));
  }, [offline.downloadingId, offline.pending, offline.queued]);

  const registeredPlaylists = useDownloadedPlaylists();
  const localPlaylists = useSyncExternalStore(
    subscribeToLocalPlaylists,
    getLocalPlaylistItems,
    getLocalPlaylistItems,
  );

  // Derive downloaded playlists: registered ones + local ones + liked songs (if downloaded tracks exist)
  const downloadedPlaylists = useMemo(() => {
    const result: Array<{ playlist: Playlist; downloadedCount: number }> = [];
    const seenIds = new Set<string>();

    // 1. Liked Songs playlist if any liked songs are in offline store
    const currentLibrary = libraryState?.library ?? libraryController?.getState().library;
    const likedSongs = currentLibrary?.likedSongs ?? [];
    const downloadedLikedCount = likedSongs.filter((t) => Boolean(offline.entries[t.id])).length;
    if (downloadedLikedCount > 0) {
      seenIds.add("liked-songs");
      seenIds.add(currentLibrary?.likedSongsPlaylist?.id ?? "LM");
      result.push({
        playlist: {
          id: currentLibrary?.likedSongsPlaylist?.id ?? "LM",
          title: "Liked Songs",
          owner: "YouTube Music",
          artworkUrl: likedSongsCover,
          kind: "liked-songs",
        },
        downloadedCount: downloadedLikedCount,
      });
    }

    // 2. Playlists explicitly downloaded and registered
    for (const item of registeredPlaylists) {
      if (seenIds.has(item.id)) continue;
      const count = item.trackIds.filter((id) => Boolean(offline.entries[id])).length;
      if (count > 0 || item.trackIds.length === 0) {
        seenIds.add(item.id);
        result.push({
          playlist: {
            id: item.id,
            title: item.title,
            owner: item.owner || "Downloaded Playlist",
            artworkUrl: item.artworkUrl,
            kind: (item.kind === "local" || item.kind === "liked-songs" ? item.kind : "playlist"),
          },
          downloadedCount: count,
        });
      }
    }

    // 3. Any library playlists that have tracks in offline storage
    for (const pl of currentLibrary?.playlists ?? []) {
      if (seenIds.has(pl.id)) continue;
      // If any registered playlist or matching cached playlist
      const match = registeredPlaylists.find((r) => r.id === pl.id);
      if (match) {
        const count = match.trackIds.filter((id) => Boolean(offline.entries[id])).length;
        if (count > 0) {
          seenIds.add(pl.id);
          result.push({ playlist: pl, downloadedCount: count });
        }
      }
    }

    // 4. Local playlists (audio files located locally)
    for (const lp of localPlaylists) {
      if (seenIds.has(lp.id)) continue;
      seenIds.add(lp.id);
      result.push({
        playlist: lp,
        downloadedCount: lp.localPaths?.length ?? 0,
      });
    }

    return result;
  }, [
    libraryState?.library,
    libraryController,
    offline.entries,
    registeredPlaylists,
    localPlaylists,
  ]);

  const filteredDownloads = useMemo(() => {
    if (!query.trim()) return downloads;
    const lower = query.trim().toLowerCase();
    return downloads.filter(
      (entry) =>
        entry.track.title.toLowerCase().includes(lower) ||
        entry.track.artist?.toLowerCase().includes(lower) ||
        entry.track.album?.toLowerCase().includes(lower),
    );
  }, [downloads, query]);

  const filteredPlaylists = useMemo(() => {
    if (!query.trim()) return downloadedPlaylists;
    const lower = query.trim().toLowerCase();
    return downloadedPlaylists.filter(
      (item) =>
        item.playlist.title.toLowerCase().includes(lower) ||
        item.playlist.owner?.toLowerCase().includes(lower),
    );
  }, [downloadedPlaylists, query]);

  const selection = useTrackSelection(downloadedTracks);

  const usedPercent = Math.min(100, Math.round((offline.usedBytes / maxBytes) * 100));

  const playAllDownloads = (shuffle = false) => {
    if (downloads.length === 0) return;
    const tracks = downloads.map((entry) => entry.track);
    if (shuffle) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      void playerController.playTrackById(shuffled[0].id, shuffled);
    } else {
      void playerController.playTrackById(tracks[0].id, tracks);
    }
  };

  const playTrack = (track: Track, index: number, event: React.MouseEvent<HTMLElement>) => {
    if (selection.handleRowClick(event, index)) return;
    const allTracks = downloads.map((item) => item.track);
    void playerController.playTrackById(track.id, allTracks.length > 0 ? allTracks : [track]);
  };

  return (
    <div className="flex flex-col gap-6 pb-40 md:pb-12 w-full max-w-full">
      {/* ── Standalone Page Header (hidden when embedded in LibraryPage) ── */}
      {!embedded && (
        <header className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <DownloadIcon size={20} aria-hidden="true" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Downloads
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground pl-0.5">
            Offline library · {downloads.length} {downloads.length === 1 ? "song" : "songs"} ·{" "}
            {formatBytes(offline.usedBytes)} used
            {inFlight.length > 0 ? ` · ${inFlight.length} in progress` : ""}
          </p>
        </header>
      )}

      {/* ── Empty State ── */}
      {downloads.length === 0 && inFlight.length === 0 && downloadedPlaylists.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-card border border-border/50 text-primary shadow-sm">
            <DownloadIcon size={38} aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1.5 max-w-sm">
            <h2 className="text-lg font-bold text-foreground">No downloaded music</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Download your favorite tracks, playlists, and albums to listen offline anytime, anywhere, with zero data usage.
            </p>
          </div>
          {onOpenBrowse && (
            <button
              type="button"
              onClick={onOpenBrowse}
              className="mt-2 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-transform active:scale-95 hover:bg-primary/90"
            >
              <CompassIcon size={16} />
              <span>Explore Music</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* ── Primary Action Bar with Play, Shuffle & Storage Details Toggle ── */}
          {downloads.length > 0 && (
            <div className="flex items-center gap-2.5 w-full">
              <button
                type="button"
                onClick={() => playAllDownloads(false)}
                className="h-11 sm:h-12 flex-1 flex items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-transform active:scale-95 hover:brightness-110"
              >
                <PlayActiveIcon size={18} />
                <span className="whitespace-nowrap">Play All</span>
              </button>
              <button
                type="button"
                onClick={() => playAllDownloads(true)}
                className="h-11 sm:h-12 flex-1 flex items-center justify-center gap-2 rounded-full bg-card/90 border border-white/10 px-4 text-sm font-semibold text-foreground transition-transform active:scale-95 hover:bg-muted"
                aria-label="Shuffle all downloaded songs"
              >
                <ShuffleIcon size={18} />
                <span className="whitespace-nowrap">Shuffle</span>
              </button>
              <button
                type="button"
                onClick={() => setShowOfflineStorage((prev) => !prev)}
                className={cn(
                  "size-11 sm:size-12 shrink-0 flex items-center justify-center rounded-full border transition-all active:scale-95 select-none",
                  showOfflineStorage
                    ? "bg-primary/20 text-primary border-primary/40 shadow-sm"
                    : "bg-card/90 text-foreground border-white/10 hover:bg-muted",
                )}
                title={showOfflineStorage ? "Hide storage details" : "Show offline storage details"}
                aria-expanded={showOfflineStorage}
                aria-label="Toggle offline storage details"
              >
                <StorageIcon size={18} />
              </button>
            </div>
          )}

          {/* ── Collapsible Offline Storage Details Card (Hidden by Default) ── */}
          <AnimatePresence>
            {showOfflineStorage && (
              <motion.div
                key="offline-storage-details-card"
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3.5 rounded-2xl bg-card/75 border border-border/40 p-4 sm:p-5 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-foreground">Offline Storage</span>
                        <span className="rounded-full bg-primary/15 border border-primary/25 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {usedPercent}% used
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatBytes(offline.usedBytes)} of {formatBytes(maxBytes)} allocated
                        {offline.downloadingId
                          ? offline.progress !== null
                            ? ` · downloading ${offline.progress}%`
                            : " · downloading"
                          : ""}
                      </span>
                    </div>

                    {downloads.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirmRemoveAll) {
                            void removeAllDownloads();
                            setConfirmRemoveAll(false);
                            return;
                          }
                          setConfirmRemoveAll(true);
                        }}
                        onBlur={() => setConfirmRemoveAll(false)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all shrink-0 select-none",
                          confirmRemoveAll
                            ? "bg-destructive text-destructive-foreground shadow-sm shadow-destructive/20 animate-pulse"
                            : "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20",
                        )}
                      >
                        <TrashIcon size={14} />
                        <span>{confirmRemoveAll ? "Confirm Remove All" : "Remove All"}</span>
                      </button>
                    )}
                  </div>

                  {/* Storage Meter Bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={false}
                      animate={{ width: `${Math.max(2, usedPercent)}%` }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Active In-Flight Downloads Section ── */}
          {inFlight.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>Downloading</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.2 text-xs font-semibold text-primary tabular-nums">
                    {inFlight.length}
                  </span>
                </h2>
              </div>

              <div className="flex flex-col gap-1.5">
                {inFlight.map((track, index) => {
                  const isActive = offline.downloadingId === track.id;
                  const progress = isActive ? offline.progress : null;

                  return (
                    <div
                      key={`pending:${track.id}`}
                      className="flex items-center gap-3 rounded-xl bg-card/50 border border-border/30 p-2.5"
                    >
                      <TrackArtwork
                        className="size-10 shrink-0 rounded-lg"
                        size={40}
                        artworkUrl={track.artworkUrl}
                        iconSize={18}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-xs font-medium text-foreground">
                          {track.title}
                        </span>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            {isActive
                              ? progress !== null
                                ? `Downloading ${progress}%`
                                : "Downloading..."
                              : `Queued (${index + 1} of ${inFlight.length})`}
                          </span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full bg-primary transition-all duration-300",
                              progress === null && "w-1/3 animate-pulse",
                            )}
                            style={progress !== null ? { width: `${progress}%` } : undefined}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelDownload(track.id)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Cancel download"
                        aria-label={`Cancel download of ${track.title}`}
                      >
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Sub-navigation: All Songs & Playlists ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div
              className="flex shrink-0 gap-1 rounded-full bg-card/70 p-1"
              role="tablist"
              aria-label="Downloaded sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={subTab === "songs"}
                onClick={() => setSubTab("songs")}
                className={cn(
                  "relative isolate rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  subTab === "songs" ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {subTab === "songs" && (
                  <motion.span
                    layoutId="downloads-subtab-indicator"
                    className="absolute inset-0 -z-10 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  />
                )}
                All Songs
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={subTab === "playlists"}
                onClick={() => setSubTab("playlists")}
                className={cn(
                  "relative isolate rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  subTab === "playlists" ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {subTab === "playlists" && (
                  <motion.span
                    layoutId="downloads-subtab-indicator"
                    className="absolute inset-0 -z-10 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  />
                )}
                Playlists
              </button>
            </div>

            {/* Search Filter Bar */}
            <div className="relative flex-1 min-w-44 sm:max-w-72">
              <SearchIcon
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={subTab === "songs" ? "Filter all downloaded songs..." : "Filter downloaded playlists..."}
                className="w-full rounded-full bg-card/70 border border-white/10 pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </div>
          </div>

          {/* ── Tab 1: All Songs (Includes songs from downloaded playlists) ── */}
          {subTab === "songs" && (
            <section className="flex flex-col gap-3">
              {filteredDownloads.length === 0 ? (
                <p className="px-4 py-12 text-center text-xs sm:text-sm text-muted-foreground">
                  {query ? `No downloaded songs match "${query}".` : "No downloaded songs yet."}
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:gap-2.5">
                  <AnimatePresence initial={false}>
                    {filteredDownloads.map((entry, index) => (
                      <TrackRow
                        key={entry.track.id}
                        track={entry.track}
                        index={index}
                        showAlbum
                        hideIndex
                        isCurrent={currentTrackId === entry.track.id}
                        isPlaying={isPlaying && currentTrackId === entry.track.id}
                        isSelected={selection.isSelected(entry.track.id)}
                        isSelectionActive={selection.isActive}
                        onToggleSelected={() => selection.toggle(entry.track.id, index)}
                        onSelect={(event) => playTrack(entry.track, index, event)}
                        onContextMenu={(event) => openTrackMenu(event, entry.track)}
                        onQuickAdd={() => openPlaylistPicker(entry.track)}
                        onQuickAddToQueue={() => playerController.addToQueue(entry.track)}
                        showDownload
                        showRating
                        trailing={
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatBytes(entry.byteLength)}
                          </span>
                        }
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
          )}

          {/* ── Tab 2: Playlists (Downloaded Playlists) ── */}
          {subTab === "playlists" && (
            <section className="flex flex-col gap-3">
              {filteredPlaylists.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                  <p className="text-sm text-muted-foreground">
                    {query
                      ? `No downloaded playlists match "${query}".`
                      : "No downloaded playlists found."}
                  </p>
                  <p className="text-xs text-muted-foreground/75 max-w-md">
                    To download a playlist, open any playlist in your library and click the Download button. All of its songs will also appear in All Songs!
                  </p>
                </div>
              ) : (
                <div className={GRID}>
                  {filteredPlaylists.map(({ playlist, downloadedCount }) => (
                    <AlbumCard
                      key={playlist.id}
                      artworkUrl={
                        isLikedSongsId(playlist.id, playlist.kind)
                          ? likedSongsCover
                          : playlist.artworkUrl
                      }
                      title={playlist.title}
                      subtitle={
                        downloadedCount > 0
                          ? `${downloadedCount} downloaded ${downloadedCount === 1 ? "song" : "songs"}`
                          : playlist.owner
                      }
                      onClick={() => onOpenPlaylist?.(playlist)}
                      onContextMenu={(event) => openPlaylistMenu(event, playlist)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Multi-selection Action Bar for Downloaded Songs (only when standalone) */}
      {!embedded && (
        <SelectionBar
          selection={selection}
          onAddToQueue={(tracks) => {
            playerController.addTracksToQueue(tracks);
            selection.clear();
          }}
          onAddToPlaylist={(tracks) => {
            openPlaylistPicker(tracks[0], tracks);
            selection.clear();
          }}
          onDownload={(tracks) => {
            queueDownloads(tracks);
            selection.clear();
          }}
        />
      )}
    </div>
  );
}
