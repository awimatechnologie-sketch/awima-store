// AWIMA Parts: قطع الغيار (هواتف + حواسيب + طابعات). البيانات في src/data/parts وتُدار من لوحة الإدارة.
import settingsRaw from '../data/parts/settings.json';
import itemsRaw from '../data/parts/items.json';
import { pick, type Lang } from '../i18n';

export interface Part { id: string; cat: string; model: string; part: string; code: string; compat: string; quality: string; form: string; wholesale: number; retail: number; popular: boolean }
export interface PartCat { id: string; name: string; icon: string; count: number }

const s = settingsRaw as any;
const str = (v: unknown, d = '') => (typeof v === 'string' && v.trim() ? v.trim() : d);

export const partsEnabled = () => s.enabled !== false;
export const partsWhatsapp = () => str(s.whatsapp, '212610680508').replace(/\D/g, '');
export const partsPhone = () => str(s.phoneDisplay, '0610680508');
export const wholesaleToggle = () => s.showWholesaleToggle !== false;

const visible = (p: any): p is Part => p && typeof p.id === 'string' && typeof p.model === 'string' && p.model.trim() !== '' && typeof p.part === 'string' && p.available !== false && Number(p.retail) > 0;
export const getParts = (): Part[] => ((itemsRaw as any).items ?? []).filter(visible);

export function getPartsText(lang: Lang) {
  const l = (a: string, b?: string) => pick(lang, a, b) as string;
  const list = (v: any, f: (x: any) => any) => (Array.isArray(v) ? v : []).filter((x: any) => x && (x.title || x.name)).map(f);
  return {
    title: l(str(s.title, 'AWIMA Parts'), s.title_fr),
    intro: l(str(s.intro), s.intro_fr),
    tips: l(str(s.tips), s.tips_fr),
    note: l(str(s.note), s.note_fr),
    steps: list(s.steps, (x) => ({ title: l(String(x.title), x.title_fr), text: l(str(x.text), x.text_fr) })),
    quality: list(s.quality, (x) => ({ title: String(x.name), text: l(str(x.text), x.text_fr) })),
  };
}

/** التصنيفات التي فيها قطعة معروضة واحدة على الأقل */
export function getPartCats(lang: Lang): PartCat[] {
  const parts = getParts();
  return (Array.isArray(s.categories) ? s.categories : [])
    .filter((c: any) => c && typeof c.id === 'string' && c.id)
    .map((c: any): PartCat => ({ id: c.id, name: l2(lang, c), icon: str(c.icon, '🔧'), count: parts.filter((p) => p.cat === c.id).length }))
    .filter((c: PartCat) => c.count > 0);
}
const l2 = (lang: Lang, c: any) => pick(lang, str(c.name, c.id), c.name_fr) as string;

export const waBase = () => `https://wa.me/${partsWhatsapp()}?text=`;
