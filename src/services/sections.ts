import deps from '../data/departments.json';
import { getAllProducts, getAllCategories } from './products';
import { sectionOf, type SectionDef } from '../lib/sections';
import type { Lang } from '../i18n';

const defs: SectionDef[] = ((deps as { departments?: any[] }).departments ?? [])
  .filter((d) => d && d.active !== false && typeof d.slug === 'string' && d.slug)
  .map((d) => ({ id: String(d.id), slug: String(d.slug), name: String(d.name), name_fr: typeof d.name_fr === 'string' && d.name_fr.trim() ? d.name_fr : undefined, cover: typeof d.cover === 'string' && d.cover.startsWith('/') ? d.cover : undefined, categories: Array.isArray(d.categories) ? d.categories : [] }));

/** كل الأصناف النشطة (حتى الفارغة: تظهر بغلافها وعبارة «قريباً») مع منتجاتها وأقسامها الفرعية */
export function getSections(lang: Lang = 'ar') {
  const cats = getAllCategories(lang);
  const products = getAllProducts(lang);
  return defs
    .map((s) => {
      const ps = products.filter((p) => sectionOf(p.category, cats, defs)?.id === s.id);
      const catIds = [...new Set(ps.map((p) => p.category))];
      return { id: s.id, slug: s.slug, name: lang === 'fr' && s.name_fr ? s.name_fr : s.name, cover: s.cover, products: ps, categories: cats.filter((c) => catIds.includes(c.id)) };
    })
}
export const getSectionSlugs = () => getSections('ar').map((s) => s.slug);
/** للخريطة: الأصناف التي فيها منتجات فقط */
export const getIndexableSectionSlugs = () => getSections('ar').filter((s) => s.products.length > 0).map((s) => s.slug);
