// العروض التلقائية: خصم يُطبَّق في السلة دون كود، على منتجات محددة أو قسم كامل أو كل المتجر،
// بحد أدنى للكمية (باقة) أو بدونه (خصم مؤقت)، وبتواريخ بداية ونهاية اختيارية.
// القواعد:
//  - تُقيَّم العروض بترتيبها في الإعدادات، والسطر الذي أخذ عرضاً لا يأخذ عرضاً آخر (الأول يغلب).
//  - الحد الأدنى للكمية يُحسب على مجموع كميات المنتجات المشمولة، لا على سطر واحد.
//  - الخصم النسبي على مجموع المشمول فقط، والمبلغ الثابت يُطبَّق مرة واحدة لكل طلب ولا يتجاوز المشمول.
//  - يُحسب كود الخصم بعد العروض التلقائية على الباقي.
import { moroccoToday } from './discounts';

export type OfferScope = 'category' | 'products' | 'all';
export type OfferType = 'percent' | 'fixed';

export interface AutoOffer {
  name: string;
  nameFr: string;
  scope: OfferScope;
  category: string | null; // معرّف القسم عند scope=category
  products: string[]; // معرّفات المنتجات عند scope=products
  type: OfferType;
  value: number; // نسبة (1..100) أو مبلغ بالدرهم (> 0)
  minQty: number; // أدنى عدد قطع مشمولة لتفعيل العرض (1 = خصم مباشر)
  start: string | null; // YYYY-MM-DD يشمل هذا اليوم (بتوقيت المغرب)
  end: string | null; // YYYY-MM-DD يشمل هذا اليوم
  badge: boolean; // شارة على بطاقة المنتج وصفحته
}

export interface OfferLine {
  id: string;
  category: string;
  price: number | null;
  qty: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().slice(0, 10) : '';
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};

/** يحوّل قائمة الإعدادات الخام إلى عروض صالحة ومفعّلة فقط (غير الصالح يُتجاهل بصمت، والفاحص يُنبّه) */
export function normalizeOffers(raw: unknown): AutoOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: AutoOffer[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object' || (r as any).enabled === false) continue;
    const name = String((r as any).name ?? '').trim();
    const type = (r as any).type === 'fixed' ? 'fixed' : (r as any).type === 'percent' ? 'percent' : null;
    const value = Number((r as any).value);
    const scope: OfferScope | null =
      (r as any).scope === 'category' || (r as any).scope === 'products' || (r as any).scope === 'all' ? (r as any).scope : null;
    if (!name || !type || !scope || !Number.isFinite(value) || value <= 0) continue;
    if (type === 'percent' && value > 100) continue;
    const category = String((r as any).category ?? '').trim() || null;
    const products = Array.isArray((r as any).products)
      ? (r as any).products.map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
      : [];
    if (scope === 'category' && !category) continue;
    if (scope === 'products' && products.length === 0) continue;
    const mq = Math.floor(Number((r as any).minQty));
    const start = dateOrNull((r as any).startDate);
    const end = dateOrNull((r as any).endDate);
    if (start && end && start > end) continue;
    out.push({
      name,
      nameFr: String((r as any).name_fr ?? '').trim(),
      scope,
      category: scope === 'category' ? category : null,
      products: scope === 'products' ? products : [],
      type,
      value,
      minQty: Number.isFinite(mq) && mq >= 1 ? mq : 1,
      start,
      end,
      badge: (r as any).badge !== false,
    });
  }
  return out;
}

export const offerActive = (o: Pick<AutoOffer, 'start' | 'end'>, today: string): boolean =>
  !(o.start && today < o.start) && !(o.end && today > o.end);

export const offerCovers = (o: AutoOffer, p: { id: string; category: string }): boolean =>
  o.scope === 'all' || (o.scope === 'category' ? p.category === o.category : o.products.includes(p.id));

/** العروض التي تظهر شارتها لمنتج: مشمولة وغير منتهية (الجدولة المستقبلية تُخفى بالمتصفح حتى تبدأ) */
export const badgeOffersFor = (offers: AutoOffer[], p: { id: string; category: string }, today: string): AutoOffer[] =>
  offers.filter((o) => o.badge && offerCovers(o, p) && !(o.end && today > o.end));

export interface AppliedOffer {
  offer: AutoOffer;
  amount: number;
  qty: number;
}
export interface OfferNudge {
  offer: AutoOffer;
  missing: number; // عدد القطع الناقصة لتفعيل العرض
}

/** يحسب خصم العروض التلقائية على سطور السلة المتوفرة والمسعّرة */
export function applyOffers(lines: OfferLine[], offers: AutoOffer[], today: string) {
  const claimed = new Set<number>();
  const applied: AppliedOffer[] = [];
  const nudges: OfferNudge[] = [];
  let amount = 0;
  for (const o of offers) {
    if (!offerActive(o, today)) continue;
    const idx = lines.flatMap((l, i) => (!claimed.has(i) && l.price !== null && l.qty > 0 && offerCovers(o, l) ? [i] : []));
    if (idx.length === 0) continue;
    const qty = idx.reduce((n, i) => n + lines[i].qty, 0);
    if (qty < o.minQty) {
      nudges.push({ offer: o, missing: o.minQty - qty });
      continue;
    }
    const sub = idx.reduce((n, i) => n + (lines[i].price as number) * lines[i].qty, 0);
    const raw = o.type === 'percent' ? Math.round((sub * o.value) / 100) : o.value;
    const a = Math.max(0, Math.min(raw, sub));
    idx.forEach((i) => claimed.add(i));
    if (a > 0) {
      applied.push({ offer: o, amount: a, qty });
      amount += a;
    }
  }
  return { amount, applied, nudges };
}

export { moroccoToday };
