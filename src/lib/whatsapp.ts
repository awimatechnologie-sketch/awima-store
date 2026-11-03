import { site } from '../config/site';
import { formatPrice } from './format';
import type { Product } from '../types/product';
import { t, type Lang } from '../i18n';

const base = (number: string, text: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

/** رابط واتساب لمنتج معيّن برسالة جاهزة */
export function buildProductLink(product: Product, pageUrl: string, lang: Lang = 'ar'): string {
  const text = [
    t(lang, 'wa.product.intro'),
    t(lang, 'wa.product.name', { v: product.name }),
    t(lang, 'wa.product.ref', { v: product.id }),
    t(lang, 'wa.product.price', { v: formatPrice(product.price, lang) }),
    t(lang, 'wa.product.link', { v: pageUrl }),
  ].join('\n');
  return base(site.contact.whatsapp, text);
}

/** رابط تواصل عام بدون منتج */
export function buildContactLink(text?: string, lang: Lang = 'ar'): string {
  return base(site.contact.whatsapp, text || t(lang, 'wa.contact'));
}
