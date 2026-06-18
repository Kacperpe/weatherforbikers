// Zapis ostatniej wczytanej trasy w localStorage, aby po powrocie na stronę
// można było ją wczytać jednym kliknięciem bez ponownego wgrywania pliku.
// Plik trzymamy jako data URL (base64) — działa też dla binarnego KMZ.

const KEY = "last-route";

type StoredRoute = {
  name: string;
  type: string;
  dataUrl: string;
  savedAt: number;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export async function saveLastRoute(file: File): Promise<void> {
  try {
    const dataUrl = await fileToDataUrl(file);
    const payload: StoredRoute = {
      name: file.name,
      type: file.type,
      dataUrl,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Brak miejsca w localStorage lub błąd odczytu — pomijamy cicho.
  }
}

function read(): StoredRoute | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRoute;
    if (!parsed?.name || !parsed?.dataUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Zwraca samą nazwę zapisanej trasy (do pokazania na przycisku) albo null. */
export function getLastRouteName(): string | null {
  return read()?.name ?? null;
}

/** Odtwarza zapisaną trasę jako File gotowy do sparsowania, albo null. */
export async function restoreLastRouteFile(): Promise<File | null> {
  const stored = read();
  if (!stored) return null;
  try {
    const blob = await (await fetch(stored.dataUrl)).blob();
    return new File([blob], stored.name, { type: stored.type || blob.type });
  } catch {
    return null;
  }
}

export function clearLastRoute(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
