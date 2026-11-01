import productsData from '../data/products.json';
import categoriesData from '../data/categories.json';
import type { Product, Category } from '../types/product';

const products = productsData as unknown as Product[];
const categories = categoriesData as Category[];

// التحقق من البيانات أثناء البناء
const ids = new Set<string>();
const slugs = new Set<string>();
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
