// الأصناف السبعة (تُعرض بغلاف كبير): كل قسم من أقسام المتجر ينتمي لصنف واحد، والفروع ترث صنف أبيها.
export interface SectionDef { id: string; slug: string; name: string; name_fr?: string; cover?: string; categories: string[] }
export interface CatNode { id: string; parent?: string | null }

/** الصنف الذي ينتمي إليه قسم المنتجات (يصعد في شجرة الأقسام) أو null */
export function sectionOf(categoryId: string, cats: CatNode[], sections: SectionDef[]): SectionDef | null {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (let c: string | undefined | null = categoryId; c && !seen.has(c); c = byId.get(c)?.parent) {
    seen.add(c);
    const s = sections.find((x) => x.categories.includes(c as string));
    if (s) return s;
  }
  return null;
}

/** معرّفات كل الأقسام (بما فيها الفروع) التابعة للصنف */
export function categoriesOfSection(section: SectionDef, cats: CatNode[], sections: SectionDef[]): string[] {
  return cats.filter((c) => sectionOf(c.id, cats, sections)?.id === section.id).map((c) => c.id);
}
