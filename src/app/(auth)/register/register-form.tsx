"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register } from "../actions";
import { useLang } from "@/contexts/lang-context";

export function RegisterForm() {
  const { t, lang } = useLang();
  const [error, action, isPending] = useActionState(register, null);

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">
          {t("auth.registerTitle")}
        </h1>
        <p className="text-sm text-slate-400">{t("auth.tagline")}</p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="lang" value={lang} />
        {error && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-300">
            {t("auth.email")}
          </label>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/40 placeholder:text-slate-500 focus:ring"
            placeholder="ty@przykład.pl"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-300">
            {t("auth.password")}
          </label>
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            minLength={6}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/40 placeholder:text-slate-500 focus:ring"
            placeholder={t("auth.passwordPlaceholder")}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
        >
          {isPending ? t("auth.registering") : t("auth.registerBtn")}
        </button>
      </form>

      <p className="text-center text-sm text-slate-400">
        {t("auth.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-cyan-400 hover:text-cyan-300">
          {t("auth.hasAccountLink")}
        </Link>
      </p>
    </div>
  );
}
