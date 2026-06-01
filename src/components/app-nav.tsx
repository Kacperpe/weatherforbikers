"use client";

import { useLang } from "@/contexts/lang-context";

export type AppTab = "map" | "weather" | "settings";

type Props = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  isDark: boolean;
  alertCount: number;
};

export function AppNav({ activeTab, onTabChange, isDark, alertCount }: Props) {
  const { t } = useLang();
  const TABS: { id: AppTab; icon: string; labelKey: string }[] = [
    { id: "map",      icon: "🗺",  labelKey: "nav.map"      },
    { id: "weather",  icon: "⛅",  labelKey: "nav.weather"  },
    { id: "settings", icon: "⚙️", labelKey: "nav.settings" },
  ];
  const navBg = isDark
    ? "bg-slate-950/95 border-slate-700/80"
    : "bg-white/95 border-slate-300/90";

  function itemCls(id: AppTab) {
    const active = id === activeTab;
    if (active) return isDark ? "text-cyan-400" : "text-slate-900";
    return isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700";
  }

  return (
    <>
      {/* Mobile: bottom bar */}
      <nav className={`fixed bottom-0 inset-x-0 h-16 z-[1200] flex border-t backdrop-blur md:hidden ${navBg}`}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${itemCls(tab.id)}`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-xs font-medium">{t(tab.labelKey)}</span>
            {tab.id === "weather" && alertCount > 0 && (
              <span className="absolute right-[calc(50%-18px)] top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Desktop: left sidebar */}
      <nav className={`fixed left-0 inset-y-0 w-16 z-[1200] hidden flex-col border-r backdrop-blur md:flex ${navBg}`}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-col items-center justify-center gap-1 py-5 transition-colors ${itemCls(tab.id)}`}
          >
            <span className="text-2xl leading-none">{tab.icon}</span>
            <span className="text-[9px] font-medium">{t(tab.labelKey)}</span>
            {tab.id === "weather" && alertCount > 0 && (
              <span className="absolute right-1 top-2 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </>
  );
}
