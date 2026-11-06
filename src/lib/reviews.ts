// تقييمات الزبائن: متوسط مرجّح بنوع المقيِّم، ومنه يُحسب الإطار اللوني للمنتج.
// دالات صرفة (بلا Astro) لتُختبر وتُستعمل في البناء.

export type BuyerKind = 'verified' | 'new';
// الإطار: none = لا يكفي الدليل بعد. red محجوز لمرحلة السوق (تجّار غير موثّقين) ولا يُنتَج الآن.
export type Tier = 'none' | 'green-dark' | 'green-light' | 'yellow' | 'red';

/** وزن كل نمط مقيِّم: مشترٍ سابق موثَّق = 5 نقاط، زبون جديد = نقطة. أضف أنماطاً لاحقاً هنا. */
export const BUYER_WEIGHT: Record<BuyerKind, number> = { verified: 5, new: 1 };
/** أقل مجموع نقاط ليظهر لون (مشترٍ موثَّق واحد يكفي، أو 5 زبائن جدد) */
export const MIN_POINTS = 5;
/** نقاط تلزم للأخضر الغامق (مشتريان موثَّقان مثلاً) */
export const STRONG_POINTS = 10;
export const GREEN_DARK_AVG = 4.5;
export const GREEN_LIGHT_AVG = 4.0;
/** الأحمر معطّل الآن: ما دون الأخضر الفاتح يبقى أصفر. فعّله مع دخول التجّار. */
export const RED_ENABLED = false;
export const RED_BELOW_AVG = 2.5;

export interface Review {
  product: string;
  rating: number; // 1..5 صحيح
  buyer: BuyerKind;
  author?: string;
  comment?: string;
  date?: string;
}

/** عتبات الإطار اللوني (قابلة للتعديل من الإعدادات ← مجتمع الموقع) */
export interface Thresholds { minPoints: number; strongPoints: number; greenDarkAvg: number; greenLightAvg: number }
export const DEFAULT_THRESHOLDS: Thresholds = { minPoints: MIN_POINTS, strongPoints: STRONG_POINTS, greenDarkAvg: GREEN_DARK_AVG, greenLightAvg: GREEN_LIGHT_AVG };

export interface ReviewSummary {
  count: number;
  points: number; // مجموع الأوزان
  sum: number; // مجموع (التقييم × الوزن)
  average: number; // متوسط مرجّح بخانة عشرية واحدة (0 إن لا تقييمات)
  tier: Tier;
}

export const EMPTY_SUMMARY: ReviewSummary = { count: 0, points: 0, sum: 0, average: 0, tier: 'none' };

/** يحوّل سجلاً خاماً من JSON إلى تقييم صالح، أو null إن كان غير صالح أو غير منشور */
export function normalizeReview(raw: any): Review | null {
  if (!raw || typeof raw !== 'object' || raw.published === false) return null;
  const rating = Number(raw.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  if (!raw.product) return null;
  const buyer: BuyerKind = raw.buyer === 'verified' ? 'verified' : 'new';
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return { product: String(raw.product), rating, buyer, author: s(raw.author), comment: s(raw.comment), date: s(raw.date) };
}

export function tierFor(average: number, points: number, th: Thresholds = DEFAULT_THRESHOLDS): Tier {
  if (points < th.minPoints) return 'none';
  if (RED_ENABLED && average < RED_BELOW_AVG) return 'red';
  if (average >= th.greenDarkAvg && points >= th.strongPoints) return 'green-dark';
  if (average >= th.greenLightAvg) return 'green-light';
  return 'yellow';
}

/** يبني الملخص من العدد ومجموع الأوزان والمجموع المرجّح (يُستعمل للدمج مع تقييمات الزوار) */
export function summaryFrom(count: number, points: number, sum: number, th: Thresholds = DEFAULT_THRESHOLDS): ReviewSummary {
  if (!count || !points) return EMPTY_SUMMARY;
  return { count, points, sum, average: Math.round((sum / points) * 10) / 10, tier: tierFor(sum / points, points, th) };
}

export function summarize(reviews: Review[], th: Thresholds = DEFAULT_THRESHOLDS): ReviewSummary {
  let points = 0;
  let sum = 0;
  for (const r of reviews) {
    const w = BUYER_WEIGHT[r.buyer] ?? 1;
    points += w;
    sum += r.rating * w;
  }
  return summaryFrom(reviews.length, points, sum, th);
}

export function groupByProduct(reviews: Review[]): Map<string, Review[]> {
  const m = new Map<string, Review[]>();
  for (const r of reviews) m.set(r.product, [...(m.get(r.product) ?? []), r]);
  return m;
}
