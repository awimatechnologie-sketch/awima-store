// طبقة المجتمع: إعجابات وتقييمات الزوار. دوال صرفة تُستعمل في البناء وفي المتصفح وفي دوال Cloudflare.
import { BUYER_WEIGHT, DEFAULT_THRESHOLDS, type Thresholds, type ReviewSummary } from './reviews';

export interface CommunityConfig {
  likesEnabled: boolean;
  reviewsEnabled: boolean;
  minLikesToShow: number; // لا يظهر عدّاد الإعجابات قبل بلوغ هذا العدد (0 = دائماً)
  thresholds: Thresholds;
  crown: { enabled: boolean; minAvg: number; minPoints: number };
  turnstileSiteKey: string;
  likedSection: { enabled: boolean; count: number; minLikes: number }; // «الأكثر إعجاباً» في الرئيسية
}

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;

export function normalizeCommunity(raw: any): CommunityConfig {
  const th = raw?.thresholds ?? {};
  const cr = raw?.crown ?? {};
  const key = typeof raw?.turnstileSiteKey === 'string' ? raw.turnstileSiteKey.trim() : '';
  return {
    likesEnabled: raw?.likesEnabled !== false,
    reviewsEnabled: raw?.reviewsEnabled !== false,
    minLikesToShow: Math.floor(num(raw?.minLikesToShow, 0, 1000, 0)),
    thresholds: {
      minPoints: num(th.minPoints, 1, 1000, DEFAULT_THRESHOLDS.minPoints),
      strongPoints: num(th.strongPoints, 1, 1000, DEFAULT_THRESHOLDS.strongPoints),
      greenDarkAvg: num(th.greenDarkAvg, 1, 5, DEFAULT_THRESHOLDS.greenDarkAvg),
      greenLightAvg: num(th.greenLightAvg, 1, 5, DEFAULT_THRESHOLDS.greenLightAvg),
    },
    crown: {
      enabled: cr.enabled !== false,
      minAvg: num(cr.minAvg, 1, 5, 4.5),
      minPoints: num(cr.minPoints, 1, 1000, 10),
    },
    likedSection: { enabled: raw?.likedSection?.enabled !== false, count: Math.floor(num(raw?.likedSection?.count, 1, 12, 4)), minLikes: Math.floor(num(raw?.likedSection?.minLikes, 1, 1000, 3)) },
    turnstileSiteKey: /^[0-9A-Za-z_-]{8,80}$/.test(key) ? key : '',
  };
}

/** التاج: اختيار يدوي من الإدارة (trusted)، أو تلقائياً عند بلوغ متوسط ونقاط الحد المحدَّدين */
export function isTrusted(s: Pick<ReviewSummary, 'average' | 'points'>, manual: boolean, cfg: CommunityConfig['crown']): boolean {
  if (!cfg.enabled) return false;
  return manual || (s.points >= cfg.minPoints && s.average >= cfg.minAvg);
}

/** نجوم بملء جزئي: 4.3 → أربع نجوم وثلاثة أعشار. تُستعمل من Astro ومن المتصفح */
export function starsHtml(avg: number): string {
  const pct = Math.max(0, Math.min(100, Math.round((avg / 5) * 100)));
  return `<span class="stars5" style="--fill:${pct}%" aria-hidden="true">★★★★★</span>`;
}

// ---------- التحقق من مدخلات الزوار (يُستعمل في الخادم) ----------
export interface ReviewInput { product: string; rating: number; author: string; comment: string; device: string }
export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const DEVICE = /^[A-Za-z0-9_-]{8,80}$/;
export const isProductId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
export const isDeviceId = (v: unknown): v is string => typeof v === 'string' && DEVICE.test(v);

const clean = (v: unknown, max: number) =>
  (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function checkReview(body: any): Checked<ReviewInput> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
  if (typeof body.website === 'string' && body.website.trim() !== '') return { ok: false, error: 'spam' }; // حقل فخ للروبوتات
  if (!isProductId(body.product)) return { ok: false, error: 'bad_product' };
  if (!isDeviceId(body.device)) return { ok: false, error: 'bad_device' };
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: 'bad_rating' };
  const comment = clean(body.comment, 500);
  const author = clean(body.author, 40);
  // تعليق بروابط يُرفض: أكثر ما يستعمله المزعجون
  if (/https?:\/\/|www\./i.test(comment) || /https?:\/\/|www\./i.test(author)) return { ok: false, error: 'links_not_allowed' };
  return { ok: true, value: { product: body.product, rating, author, comment, device: body.device } };
}

export const REVIEW_WEIGHT_SQL = `CASE buyer WHEN 'verified' THEN ${BUYER_WEIGHT.verified} ELSE ${BUYER_WEIGHT.new} END`;

/** حدود إساءة الاستعمال لكل IP (مجزّأ) */
export const LIMITS = { likesPerHour: 120, reviewsPerDay: 5 } as const;
