// نسخ الصور المصغّرة للهواتف: name.jpg ← name-w480.jpg وname-w800.jpg (يولّدها scripts/optimize-images.mjs عند البناء).
export const VARIANT_WIDTHS = [480, 800] as const;

const isRaster = (p: string) => /\.(jpe?g|png|webp)$/i.test(p) && !/-w\d+\.[a-z]+$/i.test(p);

export function variantPath(path: string, w: number): string {
  return path.replace(/(\.[a-z]+)$/i, `-w${w}$1`);
}

/** يبني srcset من النسخ الموجودة فعلاً (exists تفحص الملف). يعيد undefined إن لم توجد نسخ */
export function buildSrcset(path: string, exists: (p: string) => boolean, fullWidth = 1200): string | undefined {
  if (!path.startsWith('/') || !isRaster(path)) return undefined;
  const parts = VARIANT_WIDTHS.filter((w) => exists(variantPath(path, w))).map((w) => `${variantPath(path, w)} ${w}w`);
  if (!parts.length) return undefined;
  return [...parts, `${path} ${fullWidth}w`].join(', ');
}
