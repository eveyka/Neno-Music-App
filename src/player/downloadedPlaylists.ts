import { useSyncExternalStore } from "react";
import type { Playlist, Track } from "../datasource/types";
import { getAppSetting, setAppSetting } from "../internal/appSettings";
import { logInternalWarn } from "../internal/logging";

const STORAGE_KEY = "neno.downloaded-playlists.v1";
const CHANGE_EVENT = "downloaded-playlists-change";

export interface DownloadedPlaylistInfo {
  id: string;
  title: string;
  owner?: string;
  artworkUrl?: string;
  kind?: string;
  trackIds: string[];
  updatedAt: number;
}

let cached: Record<string, DownloadedPlaylistInfo> | null = null;
let cachedList: DownloadedPlaylistInfo[] = [];
const EMPTY_LIST: DownloadedPlaylistInfo[] = [];
const listeners = new Set<() => void>();

function updateCache(data: Record<string, DownloadedPlaylistInfo>): void {
  cached = data;
  cachedList = Object.values(data);
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

function readFromStorage(): Record<string, DownloadedPlaylistInfo> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DownloadedPlaylistInfo>) : {};
  } catch {
    return {};
  }
}

function writeToStorage(data: Record<string, DownloadedPlaylistInfo>): void {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      logInternalWarn("writeToStorage failed for downloaded-playlists", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (typeof window !== "undefined") {
    void setAppSetting(STORAGE_KEY, data);
  }
}

export function getDownloadedPlaylists(): DownloadedPlaylistInfo[] {
  if (cached === null) {
    updateCache(readFromStorage());
  }
  return cachedList;
}

export function recordDownloadedPlaylist(playlist: Playlist, tracks: Track[]): void {
  if (!playlist?.id) return;
  const current = cached ?? readFromStorage();
  const trackIds = tracks.map((t) => t.id);
  const next: Record<string, DownloadedPlaylistInfo> = {
    ...current,
    [playlist.id]: {
      id: playlist.id,
      title: playlist.title,
      owner: playlist.owner,
      artworkUrl: playlist.artworkUrl,
      kind: playlist.kind,
      trackIds,
      updatedAt: Date.now(),
    },
  };
  updateCache(next);
  writeToStorage(next);
  emit();
}

export function removeDownloadedPlaylist(playlistId: string): void {
  const current = cached ?? readFromStorage();
  if (!current[playlistId]) return;
  const { [playlistId]: _, ...next } = current;
  updateCache(next);
  writeToStorage(next);
  emit();
}

export function clearDownloadedPlaylists(): void {
  updateCache({});
  writeToStorage({});
  emit();
}

export async function hydrateDownloadedPlaylists(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const durable = await getAppSetting<Record<string, DownloadedPlaylistInfo>>(STORAGE_KEY);
    if (durable && typeof durable === "object") {
      const merged = { ...readFromStorage(), ...durable };
      updateCache(merged);
      writeToStorage(merged);
      emit();
    }
  } catch {
    // Non-fatal
  }
}

export function subscribeToDownloadedPlaylists(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDownloadedPlaylists(): DownloadedPlaylistInfo[] {
  return useSyncExternalStore(subscribeToDownloadedPlaylists, getDownloadedPlaylists, () => EMPTY_LIST);
}
