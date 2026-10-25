import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { logInternalError } from "./logging";

const RELEASE_TAG_PREFIX = "v";
const RELEASES_URL =
  "https://github.com/jupiterbania/Neno-Music-App/releases/tag";
const RELEASES_API_URL =
  "https://api.github.com/repos/jupiterbania/Neno-Music-App/releases/latest";
const SNOOZE_PREFIX = "just-another-music-client:update-snooze:";
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  installedVersion: string;
  version: string;
  releaseUrl: string;
  canInstall: boolean;
  update?: Update;
  apkDownloadUrl?: string;
}

export interface UpdateInstallProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
}

export async function getInstalledVersion(): Promise<string> {
  return getVersion();
}

function parseVersion(version: string): number[] {
  return version.replace(/^v/, "").split(".").map(Number);
}

function isNewerVersion(installed: string, candidate: string): boolean {
  const installedParts = parseVersion(installed);
  const candidateParts = parseVersion(candidate);
  for (let i = 0; i < Math.max(installedParts.length, candidateParts.length); i++) {
    const a = installedParts[i] ?? 0;
    const b = candidateParts[i] ?? 0;
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubReleaseResponse {
  tag_name?: string;
  assets?: GithubAsset[];
}

function pickBestApkUrl(assets: GithubAsset[] = []): string | undefined {
  // Prefer arm64-v8a or universal, then any .apk
  const arm64 = assets.find((a) => /arm64|aarch64/i.test(a.name) && a.name.endsWith(".apk"));
  if (arm64) return arm64.browser_download_url;
  const universal = assets.find((a) => /universal/i.test(a.name) && a.name.endsWith(".apk"));
  if (universal) return universal.browser_download_url;
  const anyApk = assets.find((a) => a.name.endsWith(".apk"));
  return anyApk?.browser_download_url;
}

async function checkViaGithubApi(): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(RELEASES_API_URL);
    if (!response.ok) return null;
    const data = (await response.json()) as GithubReleaseResponse;
    const tagName = data.tag_name ?? "";
    const latestVersion = tagName.replace(RELEASE_TAG_PREFIX, "");
    const installedVersion = await getVersion();

    if (!latestVersion || !isNewerVersion(installedVersion, latestVersion)) {
      return null;
    }

    const isMobileAndroid =
      typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
    const hasAndroidBridge =
      typeof window !== "undefined" &&
      typeof (window as unknown as { AndroidMediaBridge?: { downloadAndInstallApk?: unknown } })
        ?.AndroidMediaBridge?.downloadAndInstallApk === "function";

    const apkUrl = pickBestApkUrl(data.assets);
    const canInstallOnAndroid = (isMobileAndroid || hasAndroidBridge) && Boolean(apkUrl);

    return {
      installedVersion,
      version: latestVersion,
      releaseUrl: `${RELEASES_URL}/${encodeURIComponent(tagName || latestVersion)}`,
      canInstall: canInstallOnAndroid,
      apkDownloadUrl: apkUrl,
    };
  } catch {
    return null;
  }
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const isMacOS =
    typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);
  const isMobile =
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMacOS || isMobile) {
    return checkViaGithubApi();
  }

  let update: Update | null;
  try {
    update = await check();
  } catch (error) {
    logInternalError("updateChecker.checkForUpdates failed, falling back to GitHub API", error);
    return checkViaGithubApi();
  }

  if (!update) return null;

  return {
    installedVersion: update.currentVersion,
    version: update.version,
    releaseUrl: `${RELEASES_URL}/${RELEASE_TAG_PREFIX}${encodeURIComponent(update.version)}`,
    canInstall: true,
    update,
  };
}

export async function installUpdate(
  info: UpdateInfo,
  onProgress?: (progress: UpdateInstallProgress) => void,
): Promise<void> {
  // If Android APK installation
  if (info.apkDownloadUrl) {
    const bridge = (
      window as unknown as {
        AndroidMediaBridge?: {
          downloadAndInstallApk?: (url: string, version: string) => void;
        };
      }
    ).AndroidMediaBridge;

    if (bridge && typeof bridge.downloadAndInstallApk === "function") {
      return new Promise<void>((resolve, reject) => {
        const handler = (event: Event) => {
          const customEvent = event as CustomEvent<{
            status: "started" | "progress" | "finished" | "error";
            percent?: number;
            downloaded?: number;
            total?: number;
            error?: string;
          }>;
          const detail = customEvent.detail;
          if (!detail) return;

          if (detail.status === "progress" || detail.status === "started") {
            onProgress?.({
              downloadedBytes: detail.downloaded ?? 0,
              totalBytes: detail.total,
              percent: detail.percent,
            });
          } else if (detail.status === "finished") {
            window.removeEventListener("neno-update-download-progress", handler);
            onProgress?.({
              downloadedBytes: detail.downloaded ?? detail.total ?? 0,
              totalBytes: detail.total,
              percent: 100,
            });
            resolve();
          } else if (detail.status === "error") {
            window.removeEventListener("neno-update-download-progress", handler);
            reject(new Error(detail.error || "Failed to download and install APK"));
          }
        };

        window.addEventListener("neno-update-download-progress", handler);
        try {
          bridge.downloadAndInstallApk!(info.apkDownloadUrl!, info.version);
        } catch (e) {
          window.removeEventListener("neno-update-download-progress", handler);
          reject(e);
        }
      });
    }
  }

  // Desktop (Tauri updater)
  if (!info.update) {
    throw new Error(
      "This update cannot be installed automatically. Please download it from the release page.",
    );
  }

  let downloadedBytes = 0;
  let totalBytes: number | undefined;

  const reportProgress = (event: DownloadEvent) => {
    if (event.event === "Started") {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength;
    } else if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
    } else if (event.event === "Finished" && totalBytes !== undefined) {
      downloadedBytes = totalBytes;
    }

    onProgress?.({
      downloadedBytes,
      totalBytes,
      percent:
        totalBytes && totalBytes > 0
          ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
          : undefined,
    });
  };

  try {
    await info.update.downloadAndInstall(reportProgress);
    await relaunch();
  } catch (error) {
    logInternalError("updateChecker.installUpdate failed", error, {
      version: info.version,
    });
    throw error;
  }
}

export function getUpdateFailureMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.trim();

  if (!message) {
    return "Unable to check for updates. The updater did not return an error message.";
  }

  return `Unable to check for updates: ${message}`;
}

export function isUpdateSnoozed(version: string): boolean {
  const snoozedUntil = Number(localStorage.getItem(`${SNOOZE_PREFIX}${version}`));
  return Number.isFinite(snoozedUntil) && snoozedUntil > Date.now();
}

export function snoozeUpdate(version: string): void {
  localStorage.setItem(
    `${SNOOZE_PREFIX}${version}`,
    String(Date.now() + SNOOZE_DURATION_MS),
  );
}
