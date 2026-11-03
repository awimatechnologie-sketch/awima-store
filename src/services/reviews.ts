import { normalizeReview, groupByProduct, summarize, EMPTY_SUMMARY, type Review, type ReviewSummary } from '../lib/reviews';

// تقييمات الزبائن: ملف JSON لكل تقييم (تُدخل من لوحة /admin). المجلد قد يكون فارغاً.
const files = import.meta.glob('../data/reviews/*.json', { eager: true, import: 'default' }) as Record<string, any>;

const reviews: Review[] = Object.values(files)
  .map(normalizeReview)
  .filter((r): r is Review => r !== null);

const byProduct = groupByProduct(reviews);
const summaries = new Map<string, ReviewSummary>([...byProduct].map(([id, list]) => [id, summarize(list)]));

export const getReviewSummary = (productId: string): ReviewSummary => summaries.get(productId) ?? EMPTY_SUMMARY;
// الأحدث أولاً
export const getReviews = (productId: string): Review[] =>
  [...(byProduct.get(productId) ?? [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
