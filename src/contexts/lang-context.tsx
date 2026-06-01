"use client";

import { createContext, useContext, useState, useMemo } from "react";
import { makeT, LANGS, type Lang } from "@/lib/i18n/translations";

type LangContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: ReturnType<typeof makeT>;
};

const LangContext = createContext<LangContextType | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "pl";
    const saved = window.localStorage.getItem("lang") as Lang | null;
    return saved && LANGS.includes(saved) ? saved : "pl";
  });

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("lang", l);
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
