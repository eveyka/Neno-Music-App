import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { RELEASE_NOTE_BODY } from "../../internal/releaseNote";

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
            {/* Header */}
            <div className="relative border-b border-border/40 px-6 pt-6 pb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-primary uppercase">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  What's New
                </span>
              </div>
              <h2 id="release-note-title" className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                Neno <span className="text-primary font-semibold">v{version}</span>
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Here's what has been improved and added in this release.
              </p>
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

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border/40 px-6 py-4 bg-popover/80 backdrop-blur-md">
              <span className="text-xs text-muted-foreground/70">
                Tap anywhere outside or Got it to close
              </span>
              <button
                ref={dismissRef}
                type="button"
                className={cn(
                  "rounded-full bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20",
                  "transition-all duration-150 hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                onClick={onDismiss}
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

