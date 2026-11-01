import { site } from '../config/site';
import { formatPrice } from './format';
import type { Product } from '../types/product';

const base = (number: string, text: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

/** رابط واتساب لمنتج معيّن برسالة جاهزة */
export function buildProductLink(product: Product, pageUrl: string): string {
  const text = [
    'مرحبا، أرغب في طلب هذا المنتج:',
    `الاسم: ${product.name}`,
    `المرجع: ${product.id}`,
    `السعر: ${formatPrice(product.price)}`,
    `الرابط: ${pageUrl}`,
  ].join('\n');
  return base(site.contact.whatsapp, text);
}

/** رابط تواصل عام بدون منتج */
export function buildContactLink(
  text = 'مرحبا، أريد الاستفسار عن منتجاتكم.'
): string {
  return base(site.contact.whatsapp, text);
}
