import { memo } from "react";
import { cn } from "@/lib/utils";
import type { Track } from "../../datasource/types";
import type { PlayerControllerActions } from "../../player/playerStore";
import { PlayActiveIcon } from "../icons";
import { TrackArtwork } from "./TrackArtwork";
import { useTrackContextMenu } from "./TrackContextMenu";

interface DailyDiscoverCardProps {
  track: Track;
  reasonText?: string;
  playerController: PlayerControllerActions;
  className?: string;
}

export const DailyDiscoverCard = memo(function DailyDiscoverCard({
  track,
  reasonText,
  playerController,
  className,
}: DailyDiscoverCardProps) {
  const { openTrackMenu } = useTrackContextMenu();

  const handlePlay = () => {
    void playerController.playTrackById(track.id);
  };

  const subtitle = [track.artist, track.viewCountText].filter(Boolean).join(" • ") || track.artist || "Recommended";
  const recommendationTag = reasonText || `For fans of ${track.artist || "Top Artists"}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handlePlay}
      onContextMenu={(e) => openTrackMenu(e, track)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlePlay();
        }
      }}
      className={cn(
        "group/discover relative w-[84vw] max-w-[340px] aspect-[4/5] min-h-[340px] shrink-0 snap-center",
        "rounded-3xl overflow-hidden bg-neutral-900/60 backdrop-blur-2xl border border-white/20",
        "shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.25)]",
        "select-none cursor-pointer transition-transform duration-300 active:scale-98",
        className,
      )}
    >
      {/* Dynamic Ambient Diffused Glow for Glass Refraction */}
      {track.artworkUrl && (
        <div
          className="absolute -inset-4 bg-cover bg-center blur-2xl opacity-45 scale-110 pointer-events-none"
          style={{ backgroundImage: `url("${track.artworkUrl}")` }}
        />
      )}

      {/* Background artwork */}
      <TrackArtwork
        artworkUrl={track.artworkUrl}
        size={360}
        variant="album"
        className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover/discover:scale-105"
      />

      {/* Frosted glass scrim & specular shine */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15 backdrop-blur-[2px]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/15 via-white/[0.03] to-transparent pointer-events-none" />

      {/* Card Content Overlay */}
      <div className="relative size-full p-4 sm:p-5 flex flex-col justify-between">
        {/* Top: Frosted glass title capsule */}
        <div className="flex flex-col gap-1 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/15 p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-white line-clamp-2 leading-tight drop-shadow-sm">
            {track.title}
          </h3>
          <p className="text-xs text-white/80 font-medium truncate mt-0.5">
            {subtitle}
          </p>
        </div>

        {/* Center / Float Glass Play Button */}
        <div className="self-center my-auto size-15 rounded-full bg-white/90 backdrop-blur-xl text-black flex items-center justify-center shadow-[0_12px_32px_rgba(0,0,0,0.6),0_0_24px_rgba(255,255,255,0.3)] border border-white/50 scale-95 group-hover/discover:scale-110 active:scale-90 transition-all duration-200">
          <PlayActiveIcon size={26} className="translate-x-0.5 fill-black text-black" />
        </div>

        {/* Bottom: Recommendation tag in frosted glass pill */}
        <div className="flex items-center">
          <div className="rounded-full bg-black/45 backdrop-blur-xl border border-white/15 px-3.5 py-1.5 shadow-md flex items-center gap-1.5 max-w-full">
            <span className="size-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
            <p className="text-[11px] italic text-white/95 font-medium drop-shadow-sm truncate">
              {recommendationTag}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
