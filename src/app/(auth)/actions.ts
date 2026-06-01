"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Lang = "pl" | "en" | "de" | "fr" | "es" | "it" | "cs" | "nl" | "pt" | "sv" | "ua";

const AUTH_MSGS = {
  loginFailed: {
    pl: "Nieprawidłowy email lub hasło.",
    en: "Invalid email or password.",
    de: "Ungültige E-Mail oder Passwort.",
    fr: "E-mail ou mot de passe incorrect.",
    es: "Correo o contraseña incorrectos.",
    it: "Email o password non validi.",
    cs: "Neplatný e-mail nebo heslo.",
    nl: "Ongeldig e-mailadres of wachtwoord.",
    pt: "Email ou senha inválidos.",
    sv: "Ogiltig e-post eller lösenord.",
    ua: "Невірний email або пароль.",
  },
  emailInUse: {
    pl: "Konto z tym adresem email już istnieje.",
    en: "An account with this email already exists.",
    de: "Ein Konto mit dieser E-Mail existiert bereits.",
    fr: "Un compte avec cet e-mail existe déjà.",
    es: "Ya existe una cuenta con este correo.",
    it: "Esiste già un account con questa email.",
    cs: "Účet s touto e-mailovou adresou již existuje.",
    nl: "Er bestaat al een account met dit e-mailadres.",
    pt: "Já existe uma conta com este e-mail.",
    sv: "Ett konto med den e-postadressen finns redan.",
    ua: "Акаунт з цим email вже існує.",
  },
  registerFailed: {
    pl: "Rejestracja nie powiodła się. Sprawdź dane i spróbuj ponownie.",
    en: "Registration failed. Check your details and try again.",
    de: "Registrierung fehlgeschlagen. Bitte überprüfen Sie Ihre Daten.",
    fr: "Inscription échouée. Vérifiez vos informations et réessayez.",
    es: "El registro falló. Verifica tus datos e inténtalo de nuevo.",
    it: "Registrazione fallita. Controlla i tuoi dati e riprova.",
    cs: "Registrace se nezdařila. Zkontrolujte údaje a zkuste znovu.",
    nl: "Registratie mislukt. Controleer uw gegevens en probeer opnieuw.",
    pt: "Registo falhou. Verifique os seus dados e tente novamente.",
    sv: "Registreringen misslyckades. Kontrollera dina uppgifter och försök igen.",
    ua: "Реєстрація не вдалася. Перевірте дані та спробуйте ще раз.",
  },
} satisfies Record<string, Record<Lang, string>>;

function msg(key: keyof typeof AUTH_MSGS, lang: string): string {
  return AUTH_MSGS[key][lang as Lang] ?? AUTH_MSGS[key].pl;
}

export async function login(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const lang = (formData.get("lang") as string | null) ?? "pl";
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) return msg("loginFailed", lang);

  redirect("/");
}

export async function register(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const lang = (formData.get("lang") as string | null) ?? "pl";
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    const isEmailInUse = /already registered|already exists/i.test(error.message);
    return msg(isEmailInUse ? "emailInUse" : "registerFailed", lang);
  }

  redirect("/login?message=" + encodeURIComponent("Sprawdź email, aby potwierdzić konto."));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
