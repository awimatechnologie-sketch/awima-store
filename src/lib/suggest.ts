// اقتراحات إكمال الطلب في السلة: أرخص المنتجات المتوفرة ذات السعر المحدد وغير الموجودة في السلة.
export type Suggestable = { id: string; price: number | null; availability: string };

export function pickSuggestions<T extends Suggestable>(products: T[], inCart: Set<string>, limit = 3): T[] {
  return products
    .filter((p) => !inCart.has(p.id) && p.availability !== 'out_of_stock' && p.price !== null)
    .sort((a, b) => (a.price as number) - (b.price as number) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export type CartRelatable = Suggestable & { category?: string; related?: string[] };

/**
 * «قد يعجبك أيضاً» في السلة: أولاً المقترحات اليدوية (related) لمنتجات السلة بترتيبها،
 * ثم أرخص المتوفر من أقسام منتجات السلة. لا يتكرر منتج ولا يظهر ما في السلة.
 */
export function pickCartRelated<T extends CartRelatable>(all: T[], inCart: Set<string>, limit = 3): T[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const out: T[] = [];
  const seen = new Set<string>();
  const push = (p: T | undefined) => {
    if (!p || out.length >= limit || seen.has(p.id) || inCart.has(p.id)) return;
    if (p.availability === 'out_of_stock' || p.price === null) return;
    seen.add(p.id);
    out.push(p);
  };
  const cartItems = [...inCart].map((id) => byId.get(id)).filter((p): p is T => !!p);
  for (const c of cartItems) for (const rid of c.related ?? []) push(byId.get(rid));
  const cats = new Set(cartItems.map((c) => c.category).filter(Boolean));
  const sameCat = all
    .filter((p) => p.category && cats.has(p.category))
    .sort((a, b) => (a.price as number) - (b.price as number) || a.id.localeCompare(b.id));
  for (const p of sameCat) push(p);
  return out;
}
