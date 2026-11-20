import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  EyeClosedIcon,
  EyeIcon,
  HeartIcon,
  PlayActiveIcon,
  SearchIcon,
  ShuffleIcon,
} from "@/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import type { Album, Artist, Playlist, Track } from "../../datasource/types";
import type { LibraryController, LibraryState } from "../../player/LibraryController";
import type { PlayerControllerActions } from "../../player/playerStore";
import { queueDownloads, useOfflineState } from "../../player/offlineStore";
import { getLocalPlaylistItems, subscribeToLocalPlaylists } from "../../player/localPlaylists";
import {
  setAutoDownloadLikedEnabled,
  useAutoDownloadLikedEnabled,
} from "../settings/autoDownloadLiked";
import { AlbumCard } from "../components/AlbumCard";
import { SelectionBar } from "../components/SelectionBar";
import { TrackRow } from "../components/TrackRow";
import { useTrackContextMenu } from "../components/TrackContextMenu";
import { usePlaylistContextMenu } from "../components/PlaylistContextMenu";
import { useNowPlaying } from "../hooks/useNowPlaying";
import { useTrackSelection } from "../hooks/useTrackSelection";
import { isLikedSongsId, likedSongsCover } from "../likedSongsArtwork";
import { useHiddenPlaylistIds } from "../settings/hiddenPlaylists";
import { DownloadsPage } from "./DownloadsPage";

export type LibraryTab = "downloads" | "liked" | "playlists" | "albums";

const TABS: Array<{ value: LibraryTab; label: string }> = [
  { value: "downloads", label: "Downloads" },
  { value: "liked", label: "Liked Songs" },
  { value: "playlists", label: "Playlists" },
  { value: "albums", label: "Albums" },
];

/* Responsive 2-column grid on mobile, expanding to multi-column on desktop */
const GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:[grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))] lg:gap-5";

type LibrarySort = "recent" | "title" | "artist";

function matches(query: string, ...fields: Array<string | undefined>): boolean {
  if (!query) return true;
  return fields.some((field) => field?.toLocaleLowerCase().includes(query));
}

function compareText(left: string | undefined, right: string | undefined): number {
  return (left || "").localeCompare(right || "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortItems<T>(
  items: T[],
  sort: LibrarySort,
  title: (item: T) => string,
  artist: (item: T) => string,
): T[] {
  if (sort === "recent") return items;
  const key = sort === "artist" ? artist : title;
  return [...items].sort((left, right) => compareText(key(left), key(right)));
}

function EmptyState({
  noun,
  query,
  onClearQuery,
}: {
  noun: string;
  query: string;
  onClearQuery: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        {query ? `No ${noun} match "${query}".` : `No ${noun} in your library yet.`}
      </p>
      {query && (
        <button
          type="button"
          onClick={onClearQuery}
          className="rounded-full bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

export function LibraryPage({
  libraryState,
  libraryController,
  playerController,
  onOpenAlbum,
  onOpenArtist,
  onOpenPlaylist,
  initialTab = "liked",
}: {
  libraryState: LibraryState;
  libraryController?: LibraryController;
  playerController: PlayerControllerActions;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  initialTab?: LibraryTab;
}) {
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const { currentTrackId, isPlaying } = useNowPlaying();
  const { openTrackMenu, openPlaylistPicker } = useTrackContextMenu();
  const { openPlaylistMenu, openAlbumMenu } = usePlaylistContextMenu();
  const offline = useOfflineState();
  const autoDownloadLiked = useAutoDownloadLikedEnabled();

  const localPlaylists = useSyncExternalStore(
    subscribeToLocalPlaylists,
    getLocalPlaylistItems,
    getLocalPlaylistItems,
  );

  const library = libraryState.library;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const isFiltering = normalizedQuery.length > 0;
  const activeSort: LibrarySort = sort;

  // Liked songs from the account in full
  const allLikedSongs = useMemo(() => {
    return library?.likedSongs ?? [];
  }, [library?.likedSongs]);

  const likedSongs = useMemo(
    () =>
      sortItems(
        allLikedSongs.filter((track) =>
          matches(normalizedQuery, track.title, track.artist, track.album),
        ),
        activeSort,
        (track) => track.title,
        (track) => track.artist,
      ),
    [activeSort, allLikedSongs, normalizedQuery],
  );

  const downloadedLikedCount = useMemo(() => {
    return allLikedSongs.filter((track) => Boolean(offline.entries[track.id])).length;
  }, [allLikedSongs, offline.entries]);

  const unDownloadedLikedCount = Math.max(0, allLikedSongs.length - downloadedLikedCount);

  // Download all liked songs (both old and new)
  const handleDownloadAllLiked = useCallback(() => {
    if (allLikedSongs.length === 0) return;
    queueDownloads(allLikedSongs);
  }, [allLikedSongs]);

  // Toggle auto-download liked songs; if turned on, instantly trigger downloading old liked songs too!
  const handleToggleAutoDownloadLiked = useCallback(
    (enabled: boolean) => {
      setAutoDownloadLikedEnabled(enabled);
      if (enabled && allLikedSongs.length > 0) {
        queueDownloads(allLikedSongs);
      }
    },
    [allLikedSongs],
  );

  const albums = useMemo(
    () =>
      sortItems(
        (library?.albums ?? []).filter((album) =>
          matches(normalizedQuery, album.title, album.artist),
        ),
        activeSort,
        (album) => album.title,
        (album) => album.artist,
      ),
    [activeSort, library?.albums, normalizedQuery],
  );

  const playlists = useMemo(() => {
    const all = [...(library?.playlists ?? []), ...localPlaylists];
    return sortItems(
      all.filter((playlist) => matches(normalizedQuery, playlist.title, playlist.owner)),
      activeSort,
      (playlist) => playlist.title,
      (playlist) => playlist.owner,
    );
  }, [activeSort, library?.playlists, localPlaylists, normalizedQuery]);

  const hiddenPlaylistIds = useHiddenPlaylistIds();
  const hiddenPlaylistIdSet = useMemo(() => new Set(hiddenPlaylistIds), [hiddenPlaylistIds]);
  const [showHiddenPlaylists, setShowHiddenPlaylists] = useState(false);
  const visiblePlaylists = useMemo(
    () => playlists.filter((item) => !hiddenPlaylistIdSet.has(item.id)),
    [playlists, hiddenPlaylistIdSet],
  );
  const hiddenPlaylistCount = playlists.length - visiblePlaylists.length;
  const displayedPlaylists = showHiddenPlaylists ? playlists : visiblePlaylists;

  const selection = useTrackSelection(likedSongs);
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectTab = useCallback(
    (next: LibraryTab) => {
      setTab(next);
      setQuery("");
      selection.clear();
    },
    [selection.clear],
  );

  const onTabKeyDown = useCallback(
    (event: ReactKeyboardEvent, index: number) => {
      const last = TABS.length - 1;
      const next =
        event.key === "ArrowRight"
          ? index === last
            ? 0
            : index + 1
          : event.key === "ArrowLeft"
            ? index === 0
              ? last
              : index - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? last
                : -1;
      if (next < 0) return;
      event.preventDefault();
      selectTab(TABS[next].value);
      tabRefs.current[next]?.focus();
    },
    [selectTab],
  );

  const playLikedSong = (track: Track, index: number, event: MouseEvent<HTMLElement>) => {
    if (selection.handleRowClick(event, index)) return;
    void playerController.playTrackById(track.id, likedSongs);
  };

  const playAllLikedSongs = (shuffle = false) => {
    if (likedSongs.length === 0) return;
    if (shuffle) {
      const shuffled = [...likedSongs].sort(() => Math.random() - 0.5);
      void playerController.playTrackById(shuffled[0].id, shuffled);
    } else {
      void playerController.playTrackById(likedSongs[0].id, likedSongs);
    }
  };

  const counts: Record<LibraryTab, number> = {
    downloads: Object.keys(offline.entries).length,
    liked: allLikedSongs.length,
    playlists: visiblePlaylists.length,
    albums: albums.length,
  };

  if (!library) {
    return (
      <p className="px-2 py-16 text-center text-sm text-muted-foreground">
        {libraryState.status === "signed-out"
          ? "Sign in to see your library."
          : "Loading your library..."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-44 md:pb-8 w-full max-w-full">
      {/* ── Library Header ── */}
      <header className="flex flex-col gap-5 pb-1">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-foreground">
          Library
        </h1>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main 4 Library Options: Downloads, Liked Songs, Playlists, Albums */}
          <div
            className="flex shrink-0 gap-1 rounded-full bg-card/70 p-1 max-w-full overflow-x-auto no-scrollbar scroll-smooth [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]"
            role="tablist"
            aria-label="Library section"
          >
            {TABS.map((item, index) => {
              const active = tab === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  id={`${tabsId}-tab-${item.value}`}
                  aria-selected={active}
                  aria-controls={`${tabsId}-panel`}
                  tabIndex={active ? 0 : -1}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  onClick={() => selectTab(item.value)}
                  className={cn(
                    "relative isolate rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={`${tabsId}-indicator`}
                      className="absolute inset-0 -z-10 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 320, damping: 32 }}
                    />
                  )}
                  {item.label}
                  <span className="ml-1.5 tabular-nums opacity-60">({counts[item.value]})</span>
                </button>
              );
            })}
          </div>

          {/* Search & Sort Controls (Shown for Liked, Albums, Playlists tabs) */}
          {tab !== "downloads" && (
            <div className="flex w-full sm:w-auto sm:ml-auto min-w-0 items-center justify-between sm:justify-end gap-2">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-card/70 px-3.5 text-muted-foreground transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring sm:max-w-72">
                <SearchIcon size={16} aria-hidden="true" className="shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Filter ${tab === "liked" ? "liked songs" : tab}`}
                  aria-label="Filter library"
                  className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {isFiltering && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear filter"
                    className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </label>

              <Select
                className="w-auto shrink-0"
                value={activeSort}
                onValueChange={(value) => setSort(value as LibrarySort)}
              >
                <SelectTrigger
                  className="h-10 rounded-full border border-white/10 bg-card/70 px-3.5 text-sm whitespace-nowrap gap-2 hover:bg-card"
                  aria-label="Sort library"
                >
                  <SelectValue className="truncate whitespace-nowrap" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recently added</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="artist">
                    {tab === "playlists" ? "Owner" : "Artist"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${tab}`}>
        {/* 1. DOWNLOADS OPTION */}
        {tab === "downloads" && (
          <DownloadsPage
            playerController={playerController}
            libraryController={libraryController}
            libraryState={libraryState}
            onOpenAlbum={onOpenAlbum}
            onOpenArtist={onOpenArtist}
            onOpenPlaylist={onOpenPlaylist}
            embedded
          />
        )}

        {/* 2. LIKED SONGS OPTION */}
        {tab === "liked" && (
          <div className="flex flex-col gap-5">
            {/* Action Bar for Liked Songs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl bg-card/70 border border-border/40 p-4 sm:p-5 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary shrink-0 shadow-inner">
                  <HeartIcon size={22} fill="currentColor" />
                </div>
                <div className="flex flex-col gap-2 sm:gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-foreground">Liked Songs</span>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                      {allLikedSongs.length}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    All songs you have liked across your YouTube Music account.
                  </span>
                </div>
              </div>

              {/* Play / Shuffle / Download All / Auto-Download Toggle */}
              <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
                {likedSongs.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => playAllLikedSongs(false)}
                      className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform active:scale-95 hover:bg-primary/90"
                    >
                      <PlayActiveIcon size={14} />
                      <span>Play All</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => playAllLikedSongs(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-card border border-border/50 px-3.5 py-2 text-xs font-semibold text-foreground transition-transform active:scale-95 hover:bg-muted"
                      aria-label="Shuffle liked songs"
                    >
                      <ShuffleIcon size={14} />
                      <span>Shuffle</span>
                    </button>
                  </>
                )}

                {/* Download All liked songs button */}
                {unDownloadedLikedCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleDownloadAllLiked}
                    className="flex items-center gap-1.5 rounded-xl bg-secondary/80 hover:bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground transition-all active:scale-95"
                    title="Download all liked songs to offline storage"
                  >
                    <DownloadIcon size={14} />
                    <span>Download All ({unDownloadedLikedCount})</span>
                  </button>
                ) : allLikedSongs.length > 0 ? (
                  <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-400">
                    <CheckIcon size={14} />
                    <span>All downloaded</span>
                  </div>
                ) : null}

                {/* Auto-download Liked Songs Toggle with live status */}
                <button
                  type="button"
                  onClick={() => handleToggleAutoDownloadLiked(!autoDownloadLiked)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-all active:scale-95 select-none",
                    autoDownloadLiked
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-card text-muted-foreground border-border/50 hover:text-foreground",
                  )}
                  title="When enabled, automatically downloads all old and new liked songs to listen offline"
                >
                  <DownloadIcon size={14} />
                  <span>Auto-download {autoDownloadLiked ? "ON" : "OFF"}</span>
                </button>
              </div>
            </div>

            {/* Song list */}
            {likedSongs.length === 0 ? (
              <EmptyState noun="liked songs" query={query.trim()} onClearQuery={() => setQuery("")} />
            ) : (
              <div className="flex flex-col">
                <div className="flex flex-col gap-2 sm:gap-2.5">
                  {likedSongs.map((track, index) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={index}
                      showAlbum
                      hideIndex
                      isCurrent={currentTrackId === track.id}
                      isPlaying={isPlaying && currentTrackId === track.id}
                      isSelected={selection.isSelected(track.id)}
                      isSelectionActive={selection.isActive}
                      onToggleSelected={() => selection.toggle(track.id, index)}
                      onSelect={(event) => playLikedSong(track, index, event)}
                      onContextMenu={(event) => openTrackMenu(event, track)}
                      onQuickAdd={() => openPlaylistPicker(track)}
                      onQuickAddToQueue={() => playerController.addToQueue(track)}
                      showDownload
                      showRating
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. PLAYLISTS OPTION */}
        {tab === "playlists" && (
          playlists.length === 0 ? (
            <EmptyState noun="playlists" query={query.trim()} onClearQuery={() => setQuery("")} />
          ) : (
            <div className="flex flex-col gap-3">
              {hiddenPlaylistCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHiddenPlaylists((current) => !current)}
                  className="flex w-fit items-center gap-1.5 rounded-full bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showHiddenPlaylists ? <EyeClosedIcon size={14} /> : <EyeIcon size={14} />}
                  {showHiddenPlaylists
                    ? "Hide the hidden playlists"
                    : `Show ${hiddenPlaylistCount} hidden`}
                </button>
              )}
              {displayedPlaylists.length === 0 ? (
                <p className="px-2 py-16 text-center text-sm text-muted-foreground">
                  All your playlists are hidden.
                </p>
              ) : (
                <div className={GRID}>
                  {displayedPlaylists.map((playlist) => (
                    <div
                      key={playlist.id}
                      className={hiddenPlaylistIdSet.has(playlist.id) ? "opacity-40" : undefined}
                    >
                      <AlbumCard
                        artworkUrl={
                          isLikedSongsId(playlist.id, playlist.kind)
                            ? likedSongsCover
                            : playlist.artworkUrl
                        }
                        title={playlist.title}
                        subtitle={playlist.owner}
                        onClick={() => onOpenPlaylist(playlist)}
                        onContextMenu={(event) => openPlaylistMenu(event, playlist)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {/* 4. ALBUMS OPTION */}
        {tab === "albums" && (
          albums.length === 0 ? (
            <EmptyState noun="albums" query={query.trim()} onClearQuery={() => setQuery("")} />
          ) : (
            <div className={GRID}>
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  artworkUrl={isLikedSongsId(album.id) ? likedSongsCover : album.artworkUrl}
                  title={album.title}
                  subtitle={album.artist}
                  onClick={() => onOpenAlbum(album)}
                  onContextMenu={(event) => openAlbumMenu(event, album)}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Track Selection Bar */}
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
    </div>
  );
}
