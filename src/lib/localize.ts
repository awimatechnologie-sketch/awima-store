import type { Product, Category } from '../types/product';
import { pick, type Lang } from '../i18n';

/** نسخة المنتج بلغة الصفحة: الحقول الفرنسية الفارغة أو الناقصة تبقى بالعربية */
export function localizeProduct(p: Product, lang: Lang): Product {
  if (lang !== 'fr') return p;
  if (!p.fr) return p.variants?.length ? { ...p, variants: p.variants.map((v) => ({ ...v, name: v.nameFr ?? v.name })) } : p;
  return {
    ...p,
    name: pick(lang, p.name, p.fr.name) as string,
    shortDescription: pick(lang, p.shortDescription, p.fr.shortDescription) as string,
    description: pick(lang, p.description, p.fr.description) as string,
    specs: p.fr.specs && Object.keys(p.fr.specs).length ? p.fr.specs : p.specs,
    variants: p.variants?.map((v) => ({ ...v, name: v.nameFr ?? v.name })),
  };
}

export const localizeCategory = (c: Category, lang: Lang): Category =>
  lang === 'fr' && c.nameFr ? { ...c, name: c.nameFr } : c;
