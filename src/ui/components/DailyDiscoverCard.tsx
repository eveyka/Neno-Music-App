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
        "group/discover relative w-[84vw] max-w-[340px] aspect-[4/5] min-h-[340px] shrink-0 snap-start",
        "rounded-3xl overflow-hidden bg-neutral-900 border border-white/10 shadow-2xl",
        "select-none cursor-pointer transition-transform duration-300 active:scale-98",
        className,
      )}
    >
      {/* Background artwork */}
      <TrackArtwork
        artworkUrl={track.artworkUrl}
        size={360}
        variant="album"
        className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover/discover:scale-105"
      />

      {/* Dark gradient scrims */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/20" />

      {/* Card Content Overlay */}
      <div className="relative size-full p-5 sm:p-6 flex flex-col justify-between">
        {/* Top: Track title & artist */}
        <div className="flex flex-col gap-1 drop-shadow-md">
          <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white line-clamp-2 leading-tight">
            {track.title}
          </h3>
          <p className="text-xs sm:text-sm text-white/80 font-medium truncate mt-0.5">
            {subtitle}
          </p>
        </div>

        {/* Center / Float Play Button */}
        <div className="self-center my-auto size-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl scale-95 group-hover/discover:scale-110 active:scale-90 transition-all duration-200">
          <PlayActiveIcon size={24} className="translate-x-0.5 fill-black text-black" />
        </div>

        {/* Bottom: Recommendation tag badge */}
        <div className="pt-2 border-t border-white/10">
          <p className="text-xs italic text-white/90 font-medium drop-shadow-sm truncate">
            {recommendationTag}
          </p>
        </div>
      </div>
    </div>
  );
});
