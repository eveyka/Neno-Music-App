import {
  HomeActiveIcon,
  HomeIcon,
  PlaylistActiveIcon,
  PlaylistIcon,
  SearchIcon,
  SettingsActiveIcon,
  SettingsIcon,
} from "@/ui/icons";
import { cn } from "@/lib/utils";
import type { TabView } from "../../types/tab";

interface MobileBottomNavProps {
  activeView: TabView;
  onNavigateHome: () => void;
  onOpenSearch: () => void;
  onNavigateLibrary: () => void;
  onOpenSettings: () => void;
  className?: string;
}

export function MobileBottomNav({
  activeView,
  onNavigateHome,
  onOpenSearch,
  onNavigateLibrary,
  onOpenSettings,
  className,
}: MobileBottomNavProps) {
  const isHome = activeView === "home";
  const isSearch = activeView === "search";
  const isLibrary = activeView === "library";
  const isSettings = activeView === "settings";

  const navItems = [
    {
      id: "home",
      label: "Home",
      isActive: isHome,
      onClick: onNavigateHome,
      ActiveIcon: HomeActiveIcon,
      InactiveIcon: HomeIcon,
    },
    {
      id: "search",
      label: "Search",
      isActive: isSearch,
      onClick: onOpenSearch,
      ActiveIcon: SearchIcon,
      InactiveIcon: SearchIcon,
    },
    {
      id: "library",
      label: "Library",
      isActive: isLibrary,
      onClick: onNavigateLibrary,
      ActiveIcon: PlaylistActiveIcon,
      InactiveIcon: PlaylistIcon,
    },
    {
      id: "settings",
      label: "Settings",
      isActive: isSettings,
      onClick: onOpenSettings,
      ActiveIcon: SettingsActiveIcon,
      InactiveIcon: SettingsIcon,
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className={cn(
        "w-full flex items-center justify-around border-t border-white/[0.08] bg-[#0f0f10]/98 backdrop-blur-md px-1 pt-2 pb-[max(env(safe-area-inset-bottom,0px),8px)] shadow-[0_-8px_24px_rgba(0,0,0,0.6)] select-none",
        className,
      )}
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          className={cn(
            "relative flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors select-none",
            item.isActive ? "text-white" : "text-white/50 hover:text-white/80 active:scale-95",
          )}
          aria-label={item.label}
        >
          <div className="relative">
            {item.isActive ? (
              <item.ActiveIcon size={24} className="text-white fill-white" />
            ) : (
              <item.InactiveIcon size={24} className="text-white/60" />
            )}
          </div>
          <span
            className={cn(
              "text-[10px] tracking-tight leading-none transition-all",
              item.isActive ? "font-semibold text-white" : "font-normal text-white/60",
            )}
          >
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
