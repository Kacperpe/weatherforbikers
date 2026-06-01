export const MAX_ROUTE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_KMZ_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_KMZ_ENTRIES = 16;
export const MAX_KMZ_TOTAL_UNZIPPED_BYTES = 12 * 1024 * 1024;
export const MAX_KMZ_SINGLE_KML_BYTES = 8 * 1024 * 1024;
export const MAX_ROUTE_INPUT_POINTS = 100_000;
export const MAX_ROUTE_RENDER_POINTS = 5_000;

export function assertUploadSize(file: File, ext: string) {
  const limit = ext === "kmz" ? MAX_KMZ_FILE_BYTES : MAX_ROUTE_FILE_BYTES;
  if (file.size > limit) {
    const mb = Math.round((limit / (1024 * 1024)) * 10) / 10;
    throw new Error(`Plik .${ext} jest zbyt duzy. Maksymalny rozmiar: ${mb} MB.`);
  }
}
