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

const AUTO_DISMISS_MS = 90_000;

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
      // Download completed and installer triggered
      setStage("downloaded");
    } catch (err) {
      console.error("[UpdateToast] update failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Download failed. Please check connection and try again.",
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

  const handleReinstall = () => {
    // Re-trigger the installer intent, or re-download fresh
    const triggered = installDownloadedApkDirectly(update.version);
    if (!triggered) {
      void handleStartDownload(true);
    }
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
          "w-auto sm:w-[420px] max-w-[calc(100vw-1.5rem)]",
          "rounded-3xl bg-[#131318]/95 p-4 sm:p-5 text-foreground backdrop-blur-2xl",
          "border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_35px_rgba(255,0,51,0.2)]",
          "flex flex-col gap-3.5 select-none",
        )}
        role="status"
        aria-live="polite"
      >
        {/* Header: Title, glowing version pill, and close button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-primary/20 text-primary shrink-0 shadow-inner">
              {stage === "downloaded" ? (
                <CheckIcon size={20} className="text-emerald-400" />
              ) : stage === "downloading" ? (
                <Loader variant="spinner" size={18} />
              ) : (
                <DownloadIcon size={20} />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white truncate">
                  {stage === "downloaded"
                    ? "Update Ready"
                    : stage === "downloading"
                      ? "Downloading Update"
                      : "New Version Available"}
                </span>
                <span className="rounded-full bg-primary/20 border border-primary/30 px-2 py-0.5 text-[10px] font-bold text-primary tabular-nums">
                  v{update.version}
                </span>
              </div>
              <span className="text-xs text-white/60 truncate">
                {update.installedVersion ? `Current: v${update.installedVersion} → New: v${update.version}` : `v${update.version}`}
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

        {/* Progress Bar (Visible while downloading) */}
        {stage === "downloading" && (
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>
                {progress?.percent !== undefined
                  ? `Downloading update (${progress.percent}%)`
                  : "Connecting to server..."}
              </span>
              {progress?.downloadedBytes ? (
                <span className="tabular-nums">
                  {formatBytes(progress.downloadedBytes)}
                  {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}
                </span>
              ) : null}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{
                  width: `${progress?.percent !== undefined ? Math.max(3, progress.percent) : 25}%`,
                }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {stage === "error" && error && (
          <div className="rounded-xl bg-destructive/15 border border-destructive/30 px-3 py-2 text-xs text-destructive">
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
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <DownloadIcon size={14} />
                  <span>Download</span>
                </button>
              </>
            )}

            {/* Stage: DOWNLOADING */}
            {stage === "downloading" && (
              <div className="flex items-center gap-2 text-xs font-medium text-white/60 px-2 py-1">
                <Loader variant="spinner" size={14} />
                <span>Downloading...</span>
              </div>
            )}

            {/* Stage: DOWNLOADED -> Show Install & Reinstall Buttons */}
            {stage === "downloaded" && (
              <>
                <button
                  type="button"
                  onClick={handleReinstall}
                  className="flex items-center gap-1.5 rounded-xl bg-card border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                  title="Re-open installer or re-download the APK"
                >
                  <RefreshIcon size={13} />
                  <span>Reinstall</span>
                </button>
                <button
                  type="button"
                  onClick={handleInstallNow}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all active:scale-95"
                >
                  <CheckIcon size={14} />
                  <span>Install</span>
                </button>
              </>
            )}

            {/* Stage: ERROR -> Retry button */}
            {stage === "error" && (
              <button
                type="button"
                onClick={() => void handleStartDownload(false)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
              >
                <RefreshIcon size={14} />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
