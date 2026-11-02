// اقتراحات إكمال الطلب في السلة: أرخص المنتجات المتوفرة ذات السعر المحدد وغير الموجودة في السلة.
export type Suggestable = { id: string; price: number | null; availability: string };

export function pickSuggestions<T extends Suggestable>(products: T[], inCart: Set<string>, limit = 3): T[] {
  return products
    .filter((p) => !inCart.has(p.id) && p.availability !== 'out_of_stock' && p.price !== null)
    .sort((a, b) => (a.price as number) - (b.price as number) || a.id.localeCompare(b.id))
    .slice(0, limit);
}
