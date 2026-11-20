import { useEffect, useMemo, useRef, useState } from "react";
import { TrackRow } from "../components/TrackRow";
import { TrackListSkeleton } from "../components/Skeleton";
import { useNowPlaying } from "../hooks/useNowPlaying";
import type { Album, Track } from "../../datasource/types";
import type { LibraryController } from "../../player/LibraryController";
import type { PlayerControllerActions } from "../../player/playerStore";
import { shuffleTracks } from "../../player/shuffleTracks";
import { useTrackContextMenu } from "../components/TrackContextMenu";
import { SelectionBar } from "../components/SelectionBar";
import { useTrackSelection } from "../hooks/useTrackSelection";
import { queueDownloads, useOfflineState } from "../../player/offlineStore";
import { ArtistLinks } from "../components/ArtistLinks";
import { formatCollectionMeta, MediaHeader } from "../components/MediaHeader";
import { useKeyboardShortcuts } from "../settings/keyboardShortcuts";
import { shouldStartPageSearch } from "./pageSearchKeyboard";

interface AlbumViewProps {
  album?: Album;
  playerController: PlayerControllerActions;
  libraryController: LibraryController;
}

function getTrackRenderKey(track: Track, index: number): string {
  return track.playlistItemId ?? `${track.id}:${index}`;
}

export function AlbumView({ album, playerController, libraryController }: AlbumViewProps) {
  const { openPlaylistPicker, openTrackMenu } = useTrackContextMenu();
  const keyboardShortcuts = useKeyboardShortcuts();
  const {
    currentTrackId,
    isPlaying,
    isLoading: isPlayerLoading,
    playbackOrderMode,
  } = useNowPlaying();
  const [tracks, setTracks] = useState<Track[]>([]);
  /*
   * Derived from the offline store so the header button can say what pressing it would do.
   * Recomputed from entries rather than tracked separately: a count kept in parallel with the
   * store is a count that drifts the moment a download finishes elsewhere.
   */
  const offlineState = useOfflineState();
  const downloadCounts = useMemo(
    () => ({
      downloaded: tracks.filter((track) => Boolean(offlineState.entries[track.id])).length,
      total: tracks.length,
    }),
    [tracks, offlineState.entries],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [albumSearchQuery, setAlbumSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const albumSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!album) return;
    let active = true;
    setTracks([]);
    setAlbumSearchQuery("");
    setIsLoading(true);
    setError(null);
    let showedTracks = false;
    void libraryController.getAlbumTracks(album, (updatedTracks) => {
      if (!active) return;
      showedTracks = updatedTracks.length > 0;
      setTracks(updatedTracks);
      if (updatedTracks.length > 0) setIsLoading(false);
    })
      .then((items) => {
        if (!active) return;
        showedTracks = true;
        setTracks(items);
        if (items[0]) playerController.warmTrack(items[0]);
      })
      .catch(() => {
        if (active && !showedTracks) setError("Unable to load this album.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [album, libraryController]);

  const visibleTracks = useMemo(() => {
    const query = albumSearchQuery.trim().toLocaleLowerCase();
    if (!query) return tracks;
    return tracks.filter((track) => [
      track.title,
      track.artist,
      track.album,
      ...(track.artists?.map((artist) => artist.name) ?? []),
    ].some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [albumSearchQuery, tracks]);

  useEffect(() => {
    if (!album || isLoading || error || tracks.length === 0) return;

    const handlePageSearchKeyDown = (event: KeyboardEvent) => {
      if (!shouldStartPageSearch(event, keyboardShortcuts)) return;
      event.preventDefault();
      setIsSearchOpen(true);
      setAlbumSearchQuery((current) => `${current}${event.key}`);
      window.requestAnimationFrame(() => albumSearchInputRef.current?.focus());
    };

    window.addEventListener("keydown", handlePageSearchKeyDown);
    return () => window.removeEventListener("keydown", handlePageSearchKeyDown);
  }, [album, error, isLoading, keyboardShortcuts, tracks.length]);

  if (!album) return null;


  const trackIds = useMemo(() => new Set(tracks.map((track) => track.id)), [tracks]);
  const isCurrentCollection = currentTrackId !== null && trackIds.has(currentTrackId);

  const togglePlayCollection = () => {
    if (isCurrentCollection) {
      playerController.togglePlayPause();
      return;
    }
    playInOrder();
  };

  const playInOrder = () => {
    const firstTrack = tracks[0];
    if (firstTrack) {
      void playerController.playTrackById(firstTrack.id, tracks, true, false, {
        type: "album",
        title: album.title,
        id: album.id,
      });
    }
  };

  /*
   * Order is set before playback starts, not after: playTrackById resolves asynchronously,
   * and a mode applied afterwards can lose a race with a track that ends almost immediately.
   */
  const selection = useTrackSelection(visibleTracks);

  const playInLoop = () => {
    const firstTrack = tracks[0];
    if (!firstTrack) return;
    playerController.setPlaybackOrderMode("repeat-all");
    void playerController.playTrackById(firstTrack.id, tracks, true, false, {
      type: "album",
      title: album.title,
      id: album.id,
    });
  };

  /*
   * Queued in album order with shuffle switched on afterwards, not pre-shuffled — so the player
   * bar's toggle reflects reality, and turning shuffle off restores the album's real running
   * order rather than treating the shuffle as the original.
   */
  const playShuffled = async () => {
    const firstTrack = shuffleTracks(tracks)[0];
    if (!firstTrack) return;
    const started = await playerController.playTrackById(firstTrack.id, tracks, false, true, {
      type: "album",
      title: album.title,
      id: album.id,
    });
    if (!started) return;
    playerController.setShuffleEnabled(true);
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <MediaHeader
        eyebrow="Album"
        title={album.title}
        subtitle={<ArtistLinks artists={album.artists} fallback={album.artist} />}
        meta={formatCollectionMeta(tracks)}
        artworkUrl={album.artworkUrl}
        artworkVariant="album"
        actionsDisabled={isLoading || Boolean(error) || tracks.length === 0}
        playback={{
          onToggle: togglePlayCollection,
          isPlaying: isCurrentCollection && isPlaying,
          isLoading: isCurrentCollection && isPlayerLoading,
        }}
        onShuffle={() => void playShuffled()}
        loop={{
          onPlay: playInLoop,
          onCycle: () => playerController.setPlaybackOrderMode(
            playbackOrderMode === "repeat-all" ? "repeat-one" : "in-order",
          ),
          mode: isCurrentCollection ? playbackOrderMode : "in-order",
        }}
        onAddToQueue={() => playerController.addTracksToQueue(tracks)}
        onAddToPlaylist={() => openPlaylistPicker(tracks[0], tracks)}
        download={{ onStart: () => queueDownloads(tracks), counts: downloadCounts }}
        search={{
          isOpen: isSearchOpen,
          onToggle: () => {
            setIsSearchOpen((prev) => {
              const next = !prev;
              if (next) {
                window.requestAnimationFrame(() => albumSearchInputRef.current?.focus());
              }
              return next;
            });
          },
          query: albumSearchQuery,
          onQueryChange: setAlbumSearchQuery,
          placeholder: `Search in ${album.title}...`,
          onClear: () => setAlbumSearchQuery(""),
          resultCount: visibleTracks.length,
          inputRef: albumSearchInputRef,
        }}
      />
      {error && <p className="px-2 py-10 text-center text-sm text-muted-foreground">{error}</p>}
      {!error && (isLoading || tracks.length > 0) && (
        <>
          {isLoading ? (
            <TrackListSkeleton label="Loading songs" />
          ) : visibleTracks.length === 0 && albumSearchQuery.trim() ? (
            <p className="px-2 py-10 text-center text-sm text-muted-foreground">No songs match this search.</p>
          ) : (
            <div className="flex flex-col gap-2 sm:gap-2.5">
              {visibleTracks.map((track, index) => {
                /*
                 * Matched on track identity rather than row position: the queue can be
                 * shuffled or reordered independently of how this album is displayed.
                 */
                const isCurrent = currentTrackId !== null && track.id === currentTrackId;
                return (
                  <TrackRow
                    key={getTrackRenderKey(track, index)}
                    track={track}
                    index={index}
                    isCurrent={isCurrent}
                    isPlaying={isCurrent && isPlaying}
                    isSelected={selection.isSelected(track.id)}
                    isSelectionActive={selection.isActive}
                    onToggleSelected={() => selection.toggle(track.id, index)}
                    onSelect={(event) => {
                      if (selection.handleRowClick(event, index)) return;
                      void playerController.playTrackById(track.id, visibleTracks, true, false, {
                        type: "album",
                        title: album.title,
                        id: album.id,
                      });
                    }}
                    showDownload

                    showRating
                    onQuickAddToQueue={() => playerController.addToQueue(track)}
                    onQuickAdd={() => openPlaylistPicker(track)}
                    onContextMenu={(event) => openTrackMenu(event, track)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
      <SelectionBar
        selection={selection}
        onAddToQueue={(selected) => {
          playerController.addTracksToQueue(selected);
          selection.clear();
        }}
        onAddToPlaylist={(selected) => {
          openPlaylistPicker(selected[0], selected);
          selection.clear();
        }}
        onDownload={(selected) => {
          queueDownloads(selected);
          selection.clear();
        }}
      />

    </div>
  );
}
