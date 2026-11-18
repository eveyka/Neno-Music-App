import { useRef } from "react";
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
  const lastHomeClickRef = useRef<number>(0);

  const handleHomeClick = () => {
    const scrollRoot = document.querySelector("[data-page-scroll-root]");

    if (!isHome) {
      lastHomeClickRef.current = Date.now();
      onNavigateHome();
      if (scrollRoot) {
        scrollRoot.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    // Already on home screen:
    const now = Date.now();
    const isDoubleClick = now - lastHomeClickRef.current < 450;
    lastHomeClickRef.current = isDoubleClick ? 0 : now;

    if (scrollRoot) {
      scrollRoot.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (isDoubleClick) {
      // Refresh home feed completely from scratch
      window.dispatchEvent(new CustomEvent("neno:refresh-home"));
    }
  };

  const navItems = [
    {
      id: "home",
      label: "Home",
      isActive: isHome,
      onClick: handleHomeClick,
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
        "w-full flex items-center justify-around border-t border-white/[0.08] bg-[#0f0f10] px-1 pt-2 pb-[max(env(safe-area-inset-bottom,0px),8px)] shadow-[0_-8px_24px_rgba(0,0,0,0.6)] select-none",
        className,
      )}
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          className={cn(
            "relative flex flex-1 flex-col items-center justify-center gap-1 py-1 select-none touch-manipulation cursor-pointer transition-transform duration-75 active:scale-90",
            item.isActive ? "text-white" : "text-white/50 hover:text-white/80",
          )}
          aria-label={item.label}
        >
          <div className="relative pointer-events-none">
            {item.isActive ? (
              <item.ActiveIcon size={24} className="text-white fill-white" />
            ) : (
              <item.InactiveIcon size={24} className="text-white/60" />
            )}
          </div>
          <span
            className={cn(
              "text-[10px] tracking-tight leading-none transition-all pointer-events-none",
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
