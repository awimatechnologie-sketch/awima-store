import type { Product } from '../types/product';

/**
 * منتجات «يُشترى معه»:
 * 1) المنتجات التي اختارها المدير يدوياً (حقل related) بنفس ترتيبه، بشرط أن تكون ظاهرة وليست المنتج نفسه
 * 2) ثم تُكمَل تلقائياً من نفس القسم، ثم من بقية الأقسام، حتى الحد المطلوب
 * `all` = المنتجات الظاهرة فقط (المخفية غير موجودة فيها فلا تظهر أبداً).
 */
export function pickRelated(product: Product, all: Product[], limit = 4): Product[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const picked: Product[] = [];
  const seen = new Set<string>([product.id]);
  const add = (p: Product | undefined) => {
    if (p && !seen.has(p.id) && picked.length < limit) {
      seen.add(p.id);
      picked.push(p);
    }
  };
  for (const id of product.related ?? []) add(byId.get(id));
  const others = all.filter((p) => p.id !== product.id);
  others.filter((p) => p.category === product.category).forEach(add);
  others.filter((p) => p.category !== product.category).forEach(add);
  return picked;
}
