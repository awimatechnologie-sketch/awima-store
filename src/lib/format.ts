import { site } from '../config/site';

export function formatPrice(price: number | null): string {
  if (price === null) return 'اتصل لمعرفة السعر';
  return `${new Intl.NumberFormat('fr-FR').format(price)} ${site.currencyLabel}`;
}

export const availabilityLabel = {
  in_stock: { text: 'متوفر', cls: 'badge-ok' },
  out_of_stock: { text: 'غير متوفر', cls: 'badge-no' },
  on_request: { text: 'عند الطلب', cls: 'badge-req' },
} as const;
