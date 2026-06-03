"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { makeT, LANGS, type Lang } from "@/lib/i18n/translations";

type LangContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: ReturnType<typeof makeT>;
};

const LangContext = createContext<LangContextType | null>(null);
const LANG_CHANGE_EVENT = "app-lang-change";

function detectDeviceLang(): Lang {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of candidates) {
    const code = raw.split("-")[0].toLowerCase() as Lang;
    if (LANGS.includes(code)) return code;
  }
  return "pl";
}

function getClientLang(): Lang {
  const saved = window.localStorage.getItem("lang") as Lang | null;
  if (saved && LANGS.includes(saved)) return saved;
  return detectDeviceLang();
}

function getServerLang(): Lang {
  return "pl";
}

function subscribeToLangChange(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LANG_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LANG_CHANGE_EVENT, onStoreChange);
  };
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribeToLangChange, getClientLang, getServerLang);

  function setLang(l: Lang) {
    window.localStorage.setItem("lang", l);
    window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
  }

  const t = useMemo(() => makeT(lang), [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}

// Standalone t() for use outside React (e.g. in popup HTML strings)
export function getTFn(lang: Lang) {
  return makeT(lang);
}

export type { Lang };
