import { t, type Lang } from '../i18n';

const nf = new Intl.NumberFormat('fr-FR');

export function formatPrice(price: number | null | undefined, lang: Lang = 'ar'): string {
  if (price === null || price === undefined) return t(lang, 'price.call');
  return `${nf.format(price)} ${t(lang, 'currency')}`;
}

/** قيمة التوفير إن وُجد تخفيض، وإلا null */
export function getSaving(price: number | null, oldPrice?: number | null): number | null {
  if (price === null || oldPrice === null || oldPrice === undefined) return null;
  const diff = oldPrice - price;
  return diff > 0 ? diff : null;
}

export const availabilityLabel = {
  in_stock: { text: 'متوفر', cls: 'badge-ok' },
  out_of_stock: { text: 'غير متوفر', cls: 'badge-no' },
  on_request: { text: 'عند الطلب', cls: 'badge-req' },
} as const;

/** نص حالة التوفر وصنف الشارة بلغة الصفحة */
export function availabilityFor(lang: Lang, availability: keyof typeof availabilityLabel) {
  return { text: t(lang, `av.${availability}`), cls: availabilityLabel[availability].cls };
}
