import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { RELEASE_NOTE_BODY } from "../../internal/releaseNote";
import whatsNewIcon from "../../../assets/img/whats-new-icon.png";

interface ReleaseNoteDialogProps {
  /** The version being announced, or null when there is nothing to announce. */
  version: string | null;
  onDismiss: () => void;
}

/**
 * Shown once after an update installs.
 *
 * Portalled and centred rather than dropped into the page, because it has to survive whatever
 * view happens to be mounted at startup — including the lyrics screen, which owns its own
 * scrolling and would clip anything rendered inside it.
 */
export function ReleaseNoteDialog({ version, onDismiss }: ReleaseNoteDialogProps) {
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!version) return;
    // Focus the way out, not a link: the dialog interrupts a launch nobody asked to have
    // interrupted, so Enter and Escape should both simply close it.
    dismissRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [version, onDismiss]);

  return createPortal(
    <AnimatePresence>
      {version ? (
        <motion.div
          /* Rounded to the window: a square scrim over a rounded window paints past the
             corner cutout. The variable is 0 when maximized, so it follows the window. */
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden rounded-[var(--window-radius)] bg-background/70 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          /* The scrim dismisses too — this is an announcement, not a decision. */
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onDismiss();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-note-title"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-border/60"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
          >
            {/* Header with App Waveform Icon */}
            <div className="relative border-b border-border/40 px-6 pt-6 pb-4 bg-gradient-to-b from-card/80 to-transparent">
              <div className="flex items-center gap-4">
                <div className="relative size-14 shrink-0 rounded-2xl p-0.5 bg-gradient-to-br from-primary/50 via-white/10 to-transparent shadow-[0_8px_24px_rgba(255,0,0,0.28)] ring-1 ring-white/15">
                  <img
                    src={whatsNewIcon}
                    alt="Neno Music Waveform"
                    className="size-full rounded-[14px] object-cover"
                  />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/25 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase shadow-xs">
                      <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                      What's New
                    </span>
                  </div>
                  <h2 id="release-note-title" className="mt-1 text-2xl font-black tracking-tight text-foreground">
                    Neno Music <span className="text-primary font-bold">v{version}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    Explore new features, improvements & performance updates.
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable Structured Feature List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5 [scrollbar-width:none]">
              {RELEASE_NOTE_BODY.split("\n").filter((l) => l.trim().length > 0).map((line, idx) => {
                const isFinalLine = !line.startsWith("**");
                if (isFinalLine) {
                  return (
                    <div key={idx} className="pt-2 text-center text-xs font-medium text-muted-foreground/80">
                      {line}
                    </div>
                  );
                }

                // Split title (**Title**) and description (— description)
                const titleMatch = line.match(/^\*\*([^*]+)\*\*\s*—?\s*(.*)$/);
                const title = titleMatch ? titleMatch[1] : "";
                const desc = titleMatch ? titleMatch[2] : line;

                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-1 rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors p-3.5 border border-border/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-primary/80" />
                      <span className="text-sm font-semibold text-foreground tracking-tight">
                        {title}
                      </span>
                    </div>
                    <p className="pl-4 text-xs leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Footer with Structured Action Bar */}
            <div className="flex flex-col gap-2.5 border-t border-border/40 px-6 py-4 bg-card/70 backdrop-blur-md">
              <button
                ref={dismissRef}
                type="button"
                onClick={onDismiss}
                className={cn(
                  "group relative flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary/90 py-3 px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25",
                  "transition-all duration-200 hover:brightness-110 active:scale-[0.98] cursor-pointer select-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                <span>Got it</span>
                <svg
                  className="size-4.5 transition-transform duration-200 group-hover:scale-110"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
              <p className="text-center text-[11px] text-muted-foreground/60 select-none">
                Tap Got it or anywhere outside to close
              </p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

