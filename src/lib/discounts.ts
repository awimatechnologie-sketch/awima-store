// أكواد الخصم: تُحقَّق في المتصفح، والمدير يؤكدها عند استلام طلب واتساب.
// لا نضع الأكواد نفسها في صفحة السلة، بل بصمتها SHA-256 فقط، فلا تظهر عند «عرض المصدر».
// (هذا لا يمنع تخمين كود بسيط؛ الحماية الحقيقية أن المدير يراجع الطلب قبل تأكيده.)

export type DiscountType = 'percent' | 'fixed';

export interface Discount {
  code: string; // مُوحَّد: حروف كبيرة بلا مسافات
  type: DiscountType;
  value: number; // نسبة (1..100) أو مبلغ بالدرهم (> 0)
  minSubtotal: number | null; // أدنى مجموع منتجات لتفعيل الكود
  start: string | null; // YYYY-MM-DD (يشمل هذا اليوم) بتوقيت المغرب
  end: string | null; // YYYY-MM-DD (يشمل هذا اليوم)
}
/** ما يصل المتصفح: بصمة الكود بدل الكود */
export type DiscountEntry = Omit<Discount, 'code'> & { h: string };

export type Evaluation =
  | { ok: true; amount: number }
  | { ok: false; reason: 'invalid' | 'notStarted' | 'expired' | 'min'; date?: string; min?: number };

const CODE_RE = /^[A-Z0-9_-]{3,24}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const normalizeCode = (v: unknown): string => String(v ?? '').replace(/\s+/g, '').toUpperCase();

const dateOrNull = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().slice(0, 10) : '';
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};

/** يحوّل قائمة الإعدادات الخام إلى خصومات صالحة ومفعّلة فقط (الكود المكرر الأول يغلب) */
export function normalizeDiscounts(raw: unknown): Discount[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Discount[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object' || (r as any).enabled === false) continue;
    const code = normalizeCode((r as any).code);
    const type = (r as any).type === 'fixed' ? 'fixed' : (r as any).type === 'percent' ? 'percent' : null;
    const value = Number((r as any).value);
    if (!CODE_RE.test(code) || seen.has(code) || !type || !Number.isFinite(value) || value <= 0) continue;
    if (type === 'percent' && value > 100) continue;
    const min = Number((r as any).minSubtotal);
    const start = dateOrNull((r as any).startDate);
    const end = dateOrNull((r as any).endDate);
    if (start && end && start > end) continue;
    seen.add(code);
    out.push({ code, type, value, minSubtotal: Number.isFinite(min) && min > 0 ? min : null, start, end });
  }
  return out;
}

/** تاريخ اليوم بتوقيت المغرب بصيغة YYYY-MM-DD */
export const moroccoToday = (d = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** الخصم يُطبَّق على مجموع المنتجات فقط (لا على التوصيل) ولا يتجاوزه */
export function evaluateDiscount(d: Omit<Discount, 'code'> | undefined | null, subtotal: number, today: string): Evaluation {
  if (!d) return { ok: false, reason: 'invalid' };
  if (d.start && today < d.start) return { ok: false, reason: 'notStarted', date: d.start };
  if (d.end && today > d.end) return { ok: false, reason: 'expired' };
  if (d.minSubtotal && subtotal < d.minSubtotal) return { ok: false, reason: 'min', min: d.minSubtotal };
  const raw = d.type === 'percent' ? Math.round((subtotal * d.value) / 100) : d.value;
  return { ok: true, amount: Math.max(0, Math.min(raw, subtotal)) };
}

/** SHA-256 للكود المُوحَّد، بصيغة hex (يعمل في المتصفح وNode 22) */
export async function hashCode(code: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeCode(code)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
