// الضمان: إعداد عام من settings.json + تخصيص اختياري لكل منتج (warranty بالأيام، 0 = بدون ضمان).
export interface WarrantyConfig {
  enabled: boolean;
  days: number; // المدة الافتراضية بالأيام
  note: string; // عبارة قصيرة تحت الشارة (اختيارية)
  noteFr: string;
}

const dayCount = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3650 ? v : null;

export function normalizeWarranty(raw: any): WarrantyConfig {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    enabled: raw?.enabled === true,
    days: dayCount(raw?.days) ?? 0,
    note: str(raw?.note),
    noteFr: str(raw?.note_fr),
  };
}

/** عدد أيام ضمان المنتج، أو null إن لم يكن هناك ضمان يُعرض */
export function warrantyDaysFor(cfg: WarrantyConfig, productDays: unknown): number | null {
  if (!cfg.enabled) return null;
  const own = dayCount(productDays);
  const days = own ?? cfg.days;
  return days > 0 ? days : null;
}

/** يحوّل الأيام لعبارة مقروءة: 30 → شهر، 365 → سنة، وإلا عدد الأيام */
export function warrantyUnit(days: number): { n: number; unit: 'day' | 'month' | 'year' } {
  if (days % 365 === 0) return { n: days / 365, unit: 'year' };
  if (days % 30 === 0) return { n: days / 30, unit: 'month' };
  return { n: days, unit: 'day' };
}
