import type { Product, Category, ProductFr } from '../types/product';
import type { Lang } from '../i18n';
import { localizeProduct, localizeCategory } from '../lib/localize';
import { normalizeStock, effectiveAvailability } from '../lib/stock';
import { normalizePorts } from '../lib/compat';

// المنتجات والأقسام: ملف JSON لكل عنصر (تُدار من لوحة /admin)
const productFiles = import.meta.glob('../data/products/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, any>;
const categoryFiles = import.meta.glob('../data/categories/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, any>;

const AVAILABILITY = ['in_stock', 'out_of_stock', 'on_request'] as const;

const toNumberOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

// المواصفات تُخزَّن كقائمة [{key, value}] من اللوحة، وتُحوَّل لكائن للواجهة
function normalizeSpecs(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw
        .filter((r) => r && r.key)
        .map((r) => [String(r.key), String(r.value ?? '')])
    );
  }
  if (raw && typeof raw === 'object') return raw as Record<string, string>;
  return {};
}

function normalizeFr(raw: any): ProductFr | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const specs = normalizeSpecs(raw.specs);
  return {
    name: str(raw.name),
    shortDescription: str(raw.shortDescription),
    description: str(raw.description),
    specs: Object.keys(specs).length ? specs : undefined,
  };
}

function normalizeProduct(file: string, r: any): Product {
  const where = `(${file})`;
  for (const f of ['id', 'name', 'slug', 'category'])
    if (!r?.[f]) throw new Error(`حقل مطلوب مفقود "${f}" ${where}`);
  if (!AVAILABILITY.includes(r.availability))
    throw new Error(`حالة التوفر غير صالحة ${where}: ${r.availability}`);
  return {
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    shortDescription: String(r.shortDescription ?? ''),
    description: String(r.description ?? ''),
    price: toNumberOrNull(r.price),
    oldPrice: toNumberOrNull(r.oldPrice),
    currency: String(r.currency ?? 'MAD'),
    category: String(r.category),
    images: Array.isArray(r.images) ? r.images.filter(Boolean) : [],
    availability: effectiveAvailability(r.availability, normalizeStock(r.stock)),
    stock: normalizeStock(r.stock),
    featured: Boolean(r.featured),
    specs: normalizeSpecs(r.specs),
    whatsappOrder: r.whatsappOrder !== false,
    fr: normalizeFr(r.fr),
    related: Array.isArray(r.related) ? r.related.map(String).filter(Boolean) : [],
    hidden: Boolean(r.hidden),
    warranty: typeof r.warranty === 'number' && Number.isInteger(r.warranty) && r.warranty >= 0 ? r.warranty : null,
    keywords: typeof r.keywords === 'string' ? r.keywords.trim() : '',
    trusted: r.trusted === true,
    leadDays: typeof r.leadDays === 'number' && Number.isInteger(r.leadDays) && r.leadDays > 0 ? r.leadDays : null,
    ports: normalizePorts(r.ports),
  };
}

const categories: Category[] = Object.entries(categoryFiles)
  .map(([file, r]) => {
    if (!r?.id || !r?.name || !r?.slug)
      throw new Error(`قسم ناقص البيانات (${file})`);
    return { id: String(r.id), name: String(r.name), slug: String(r.slug), nameFr: typeof r.name_fr === 'string' && r.name_fr.trim() ? r.name_fr : undefined, order: Number(r.order ?? 999), icon: typeof r.icon === 'string' && r.icon.trim() ? r.icon.trim().slice(0, 4) : undefined, parent: typeof r.parent === 'string' && r.parent.trim() ? r.parent.trim() : undefined };
  })
  .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ar'))
  .map(({ id, name, slug, nameFr, parent, icon }) => ({ id, name, slug, nameFr, parent, icon }));

const allProducts: Product[] = Object.entries(productFiles)
  .map(([file, r]) => normalizeProduct(file, r))
  .sort((a, b) => a.id.localeCompare(b.id));

// التحقق من البيانات أثناء البناء
const ids = new Set<string>();
const slugs = new Set<string>();
const catSlugs = new Set<string>();
const catIdSet = new Set(categories.map((c) => c.id));
for (const c of categories) {
  if (c.parent && (!catIdSet.has(c.parent) || c.parent === c.id)) throw new Error(`القسم الأب غير صالح للقسم ${c.id}: ${c.parent}`);
  if (c.parent && categories.find((x) => x.id === c.parent)?.parent) throw new Error(`الأقسام تدعم مستوىً واحداً من الفروع فقط (${c.id})`);
  if (catSlugs.has(c.slug)) throw new Error(`slug قسم مكرر: ${c.slug}`);
  catSlugs.add(c.slug);
}
for (const p of allProducts) {
  if (ids.has(p.id)) throw new Error(`معرّف مكرر: ${p.id}`);
  if (slugs.has(p.slug)) throw new Error(`slug مكرر: ${p.slug}`);
  if (!categories.some((c) => c.id === p.category))
    throw new Error(`قسم غير موجود للمنتج ${p.id}: ${p.category}`);
  ids.add(p.id);
  slugs.add(p.slug);
}

// المنتجات المخفية (مسودات) لا تظهر في الموقع
const products: Product[] = allProducts.filter((p) => !p.hidden);

// الأقسام الفارغة لا تظهر في التنقل (الرئيسية وصفحة المنتجات)
// القسم الرئيسي يظهر إن كان له منتجات أو كان لأحد فروعه منتجات
const hasProducts = (id: string) => products.some((p) => p.category === id);
const usedCategories = categories.filter((c) => hasProducts(c.id) || categories.some((k) => k.parent === c.id && hasProducts(k.id)));

// ---- اللغة: المحتوى الفرنسي اختياري، وما ليس له ترجمة يظهر بالعربية (الدوال في lib/localize.ts) ----
const productsFr: Product[] = products.map((p) => localizeProduct(p, 'fr'));
const productsBy = (lang: Lang): Product[] => (lang === 'fr' ? productsFr : products);

export const getAllProducts = (lang: Lang = 'ar'): Product[] => productsBy(lang);
export const getCategories = (lang: Lang = 'ar'): Category[] => usedCategories.map((c) => localizeCategory(c, lang));
export const getAllCategories = (lang: Lang = 'ar'): Category[] => categories.map((c) => localizeCategory(c, lang));
export const getFeaturedProducts = (limit = 4, lang: Lang = 'ar'): Product[] =>
  productsBy(lang).filter((p) => p.featured).slice(0, limit);
export const getProductBySlug = (slug: string, lang: Lang = 'ar'): Product | undefined =>
  productsBy(lang).find((p) => p.slug === slug);
export const getProductsByCategory = (categoryId: string, lang: Lang = 'ar'): Product[] =>
  productsBy(lang).filter((p) => p.category === categoryId);
