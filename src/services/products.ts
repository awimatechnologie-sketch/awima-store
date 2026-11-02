import type { Product, Category } from '../types/product';

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
    availability: r.availability,
    featured: Boolean(r.featured),
    specs: normalizeSpecs(r.specs),
    whatsappOrder: r.whatsappOrder !== false,
  };
}

const categories: Category[] = Object.entries(categoryFiles)
  .map(([file, r]) => {
    if (!r?.id || !r?.name || !r?.slug)
      throw new Error(`قسم ناقص البيانات (${file})`);
    return { id: String(r.id), name: String(r.name), slug: String(r.slug), order: Number(r.order ?? 999) };
  })
  .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ar'))
  .map(({ id, name, slug }) => ({ id, name, slug }));

const products: Product[] = Object.entries(productFiles)
  .map(([file, r]) => normalizeProduct(file, r))
  .sort((a, b) => a.id.localeCompare(b.id));

// التحقق من البيانات أثناء البناء
const ids = new Set<string>();
const slugs = new Set<string>();
const catSlugs = new Set<string>();
for (const c of categories) {
  if (catSlugs.has(c.slug)) throw new Error(`slug قسم مكرر: ${c.slug}`);
  catSlugs.add(c.slug);
}
for (const p of products) {
  if (ids.has(p.id)) throw new Error(`معرّف مكرر: ${p.id}`);
  if (slugs.has(p.slug)) throw new Error(`slug مكرر: ${p.slug}`);
  if (!categories.some((c) => c.id === p.category))
    throw new Error(`قسم غير موجود للمنتج ${p.id}: ${p.category}`);
  ids.add(p.id);
  slugs.add(p.slug);
}

export const getAllProducts = (): Product[] => products;
export const getCategories = (): Category[] => categories;
export const getFeaturedProducts = (limit = 4): Product[] =>
  products.filter((p) => p.featured).slice(0, limit);
export const getProductBySlug = (slug: string): Product | undefined =>
  products.find((p) => p.slug === slug);
export const getProductsByCategory = (categoryId: string): Product[] =>
  products.filter((p) => p.category === categoryId);
