import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Loader } from "@/components/motion/loader";
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  RefreshIcon,
  ArrowUpRightIcon,
} from "@/ui/icons";
import type {
  UpdateInfo,
  UpdateInstallProgress,
} from "../../internal/updateChecker";
import {
  installUpdate,
  snoozeUpdate,
  isApkDownloadedLocally,
  installDownloadedApkDirectly,
} from "../../internal/updateChecker";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 120_000;

interface UpdateToastProps {
  update: UpdateInfo;
  onDismiss: () => void;
}

type UpdateStage = "available" | "downloading" | "downloaded" | "error";

export function UpdateToast({ update, onDismiss }: UpdateToastProps) {
  const [stage, setStage] = useState<UpdateStage>(() => {
    if (update.canInstall && isApkDownloadedLocally(update.version)) {
      return "downloaded";
    }
    return "available";
  });
  const [progress, setProgress] = useState<UpdateInstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss timer (paused while downloading or when ready to install)
  useEffect(() => {
    if (stage === "downloading" || stage === "downloaded") return;
    const timer = window.setTimeout(() => {
      snoozeUpdate(update.version);
      onDismiss();
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [stage, onDismiss, update.version]);

  const dismiss = () => {
    if (stage === "downloading") return;
    snoozeUpdate(update.version);
    onDismiss();
  };

  const handleStartDownload = async (_isReinstall = false) => {
    setStage("downloading");
    setError(null);
    setProgress(null);
    try {
      await installUpdate(update, (p) => {
        setProgress(p);
      });
      // Download completed and APK verified
      setStage("downloaded");
    } catch (err) {
      console.error("[UpdateToast] update failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Download failed. Please check your internet connection and try again.",
      );
      setStage("error");
    }
  };

  const handleInstallNow = () => {
    setError(null);
    const triggered = installDownloadedApkDirectly(update.version);
    if (!triggered) {
      // Fallback to downloading/installing if direct call fails
      void handleStartDownload(false);
    }
  };

  const handleRedownload = () => {
    // Re-download fresh copy from server
    void handleStartDownload(true);
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 32, scale: 0.94 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className={cn(
          "fixed bottom-24 sm:bottom-28 inset-x-3 sm:inset-x-auto sm:right-6 z-50",
          "w-auto sm:w-[440px] max-w-[calc(100vw-1.5rem)]",
          "rounded-3xl bg-[#121216]/95 p-4 sm:p-5 text-foreground backdrop-blur-2xl",
          "border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.9),0_0_35px_rgba(255,0,51,0.18)]",
          "flex flex-col gap-3.5 select-none",
        )}
        role="status"
        aria-live="polite"
      >
        {/* Header: Title, glowing version pill, and close button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-2xl shrink-0 shadow-inner border transition-colors",
                stage === "downloaded"
                  ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                  : stage === "downloading"
                  ? "bg-primary/20 border-primary/30 text-primary"
                  : "bg-primary/20 border-primary/30 text-primary",
              )}
            >
              {stage === "downloaded" ? (
                <CheckIcon size={22} className="text-emerald-400" />
              ) : stage === "downloading" ? (
                <Loader variant="spinner" size={20} />
              ) : (
                <DownloadIcon size={20} />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white truncate">
                  {stage === "downloaded"
                    ? "Update Downloaded"
                    : stage === "downloading"
                    ? "Downloading Update"
                    : "New Update Available"}
                </span>
                <span className="rounded-full bg-primary/20 border border-primary/30 px-2 py-0.5 text-[10px] font-extrabold text-primary tabular-nums tracking-wide">
                  v{update.version}
                </span>
              </div>
              <span className="text-xs text-white/60 truncate mt-0.5">
                {update.installedVersion
                  ? `Current: v${update.installedVersion}  →  Latest: v${update.version}`
                  : `Neon Music v${update.version}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            disabled={stage === "downloading"}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dismiss update notification"
            title="Dismiss"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Informative Text Body depending on stage */}
        {stage === "available" && (
          <p className="text-xs text-white/75 leading-relaxed">
            A new version of Neon Music is available. Download now to get the latest features, faster performance, and bug fixes.
          </p>
        )}

        {stage === "downloaded" && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">
            <CheckIcon size={16} className="shrink-0 text-emerald-400" />
            <span className="leading-snug">
              Update package ready. You can install it now or re-download a fresh copy if needed.
            </span>
          </div>
        )}

        {/* Progress Bar (Visible while downloading) */}
        {stage === "downloading" && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between text-xs text-white/80">
              <span className="font-medium">
                {progress?.percent !== undefined
                  ? `Downloading update (${progress.percent}%)`
                  : "Connecting to server..."}
              </span>
              {progress?.downloadedBytes ? (
                <span className="tabular-nums font-semibold text-white/90">
                  {formatBytes(progress.downloadedBytes)}
                  {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}
                </span>
              ) : null}
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10 p-0.5 border border-white/5">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary/90 to-primary shadow-[0_0_12px_rgba(255,0,51,0.6)]"
                initial={false}
                animate={{
                  width: `${progress?.percent !== undefined ? Math.max(4, progress.percent) : 25}%`,
                }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {stage === "error" && error && (
          <div className="rounded-xl bg-destructive/15 border border-destructive/30 px-3 py-2 text-xs text-destructive leading-snug">
            {error}
          </div>
        )}

        {/* Action Controls & Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
          <button
            type="button"
            onClick={() => void openUrl(update.releaseUrl)}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
          >
            <span>Release notes</span>
            <ArrowUpRightIcon size={12} />
          </button>

          <div className="flex items-center gap-2 ml-auto">
            {/* Stage: AVAILABLE */}
            {stage === "available" && (
              <>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartDownload(false)}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <DownloadIcon size={14} />
                  <span>Download Update</span>
                </button>
              </>
            )}

            {/* Stage: DOWNLOADING */}
            {stage === "downloading" && (
              <div className="flex items-center gap-2 text-xs font-semibold text-white/60 px-2 py-1">
                <Loader variant="spinner" size={14} />
                <span>Downloading...</span>
              </div>
            )}

            {/* Stage: DOWNLOADED -> Show Install Now & Re-download Buttons */}
            {stage === "downloaded" && (
              <>
                <button
                  type="button"
                  onClick={handleRedownload}
                  className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2 text-xs font-semibold text-white transition-all active:scale-95"
                  title="Download a fresh copy of the update package"
                >
                  <RefreshIcon size={13} />
                  <span>Re-download</span>
                </button>
                <button
                  type="button"
                  onClick={handleInstallNow}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950/40 transition-all active:scale-95"
                >
                  <CheckIcon size={15} />
                  <span>Install Now</span>
                </button>
              </>
            )}

            {/* Stage: ERROR -> Retry button */}
            {stage === "error" && (
              <>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartDownload(false)}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <RefreshIcon size={14} />
                  <span>Retry Download</span>
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
