import Link from "next/link";

export const metadata = {
  title: "Polityka prywatności | Mapa pogody dla rowerzystów",
  description: "Informacje o przetwarzaniu danych w aplikacji Mapa pogody dla rowerzystów.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
        <Link href="/" className="text-sm font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
          ← Wróć do aplikacji
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight">Polityka prywatności</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Ostatnia aktualizacja: 10 lipca 2026 r.</p>

        <div className="mt-8 space-y-8 text-sm leading-6 text-slate-700 dark:text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">1. Administrator danych</h2>
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
              Przed publicznym udostępnieniem aplikacji uzupełnij tę sekcję swoimi danymi: pełną nazwą administratora, adresem oraz adresem e-mail do spraw prywatności.
            </p>
            <p className="mt-2">Administratorem danych jest: <strong>[TWOJA NAZWA / IMIĘ I NAZWISKO]</strong>, kontakt: <strong>[TWÓJ ADRES E-MAIL]</strong>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">2. Jakie dane przetwarzamy</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>lokalizację urządzenia podczas dobrowolnie uruchomionego trybu jazdy,</li>
              <li>plik lub link trasy przekazany przez użytkownika,</li>
              <li>ustawienia aplikacji zapisane lokalnie w przeglądarce,</li>
              <li>dane konta, jeżeli użytkownik korzysta z rejestracji i logowania,</li>
              <li>podstawowe dane techniczne wymagane do obsługi i zabezpieczenia aplikacji.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">3. Lokalizacja i tryb jazdy</h2>
            <p className="mt-2">Lokalizacja jest pobierana dopiero po kliknięciu „Rozpocznij” i udzieleniu zgody w przeglądarce. W obecnej wersji pozycja służy do pokazania użytkownika na mapie, wyliczenia postępu oraz wyświetlenia alertu pogodowego.</p>
            <p className="mt-2"><strong>Pozycja GPS nie jest wysyłana do naszego API ani zapisywana na naszym serwerze.</strong> Zatrzymanie trybu jazdy kończy dalsze odczyty lokalizacji. Zgodę można cofnąć w ustawieniach przeglądarki lub urządzenia.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">4. Trasy i pamięć przeglądarki</h2>
            <p className="mt-2">Ostatnio wczytana trasa oraz ustawienia mogą być zapisane w pamięci lokalnej przeglądarki, aby aplikacja mogła je odtworzyć przy następnym wejściu. Te dane nie są przez nas przechowywane na serwerze. Użytkownik może usunąć je przez wyczyszczenie danych witryny w przeglądarce.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">5. Usługi zewnętrzne</h2>
            <p className="mt-2">Aplikacja korzysta z usług zewnętrznych do realizacji funkcji pogodowych, mapowych, punktów POI, hostingu i uwierzytelniania. Mogą to być: Open-Meteo, OpenStreetMap/Overpass, Google Maps/BRouter, Supabase, Vercel oraz Upstash Redis, jeżeli jest skonfigurowany. Każdy dostawca może przetwarzać dane techniczne zgodnie z własną polityką prywatności.</p>
            <p className="mt-2">Link Google Maps oraz dane trasy są przetwarzane wyłącznie w celu zaimportowania trasy. Pozycja GPS nie jest przekazywana tym usługom w obecnej wersji.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">6. Cel i podstawa prawna</h2>
            <p className="mt-2">Dane są wykorzystywane do udostępnienia planowania trasy, prognozy pogody, alertów oraz obsługi konta. Podstawę prawną należy dobrać do sposobu prowadzenia usługi; dla dobrowolnej lokalizacji najprostszym rozwiązaniem jest zgoda użytkownika, a dla obsługi dobrowolnie założonego konta może mieć zastosowanie wykonanie umowy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">7. Prawa użytkownika</h2>
            <p className="mt-2">Użytkownik może żądać dostępu do danych, ich sprostowania, usunięcia lub ograniczenia przetwarzania, a także wnieść sprzeciw, jeżeli ma do tego podstawę. W sprawach prywatności skontaktuj się z administratorem pod adresem wskazanym w sekcji 1. Użytkownik może również złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">8. Zmiany polityki</h2>
            <p className="mt-2">Polityka może być aktualizowana, gdy zmieni się zakres aplikacji, sposób przetwarzania danych lub wykorzystywane usługi. Aktualna wersja jest publikowana na tej stronie wraz z datą aktualizacji.</p>
          </section>

          <p className="border-t border-slate-200 pt-5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Ten dokument jest roboczym wzorem informacji o prywatności dla obecnej wersji aplikacji. Przed komercyjnym lub publicznym uruchomieniem uzupełnij dane administratora i skonsultuj treść z prawnikiem.
          </p>
        </div>
      </article>
    </main>
  );
}
