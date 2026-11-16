// AWIMA Screens: شاشات الهواتف. البيانات في src/data/screens (تُدار من لوحة الإدارة).
// السعر المخزَّن هو سعر البيع النهائي (لا يُحفظ سعر الشراء في المستودع).
import settingsRaw from '../data/screens/settings.json';
import modelsRaw from '../data/screens/models.json';
import { formatPrice } from '../lib/format';
import { t, pick, type Lang } from '../i18n';

export interface ScreenModel { id: string; brand: string; name: string; price: number; type?: string; color?: string; frame?: boolean; original?: boolean }
export interface ScreenBrand { id: string; name: string; image: string; description: string; models: ScreenModel[] }
export interface TrustItem { title: string; text: string }

const s = settingsRaw as any;
const str = (v: unknown, d = '') => (typeof v === 'string' && v.trim() ? v.trim() : d);

export const screensEnabled = () => s.enabled !== false;
export const screensWhatsapp = () => str(s.whatsapp, '212610680508').replace(/\D/g, '');
export const screensPhone = () => str(s.phoneDisplay, '0610680508');

export function getScreensText(lang: Lang) {
  return {
    title: pick(lang, str(s.title, 'AWIMA Screens'), s.title_fr) as string,
    intro: pick(lang, str(s.intro), s.intro_fr) as string,
    note: pick(lang, str(s.note), s.note_fr) as string,
    trust: (Array.isArray(s.trust) ? s.trust : [])
      .filter((x: any) => x && x.title)
      .map((x: any): TrustItem => ({ title: pick(lang, String(x.title), x.title_fr) as string, text: pick(lang, str(x.text), x.text_fr) as string })),
  };
}

const visible = (m: any): m is ScreenModel => m && typeof m.id === 'string' && typeof m.brand === 'string' && typeof m.name === 'string' && m.name.trim() !== '' && m.available !== false && Number(m.price) > 0;

/** العلامات النشطة التي فيها موديل معروض واحد على الأقل، بترتيب الإعدادات */
export function getBrands(lang: Lang = 'ar'): ScreenBrand[] {
  const models = ((modelsRaw as any).models ?? []).filter(visible) as ScreenModel[];
  return (Array.isArray(s.brands) ? s.brands : [])
    .filter((b: any) => b && b.active !== false && typeof b.id === 'string' && b.id)
    .map((b: any): ScreenBrand => {
      const name = str(b.name, b.id);
      return {
        id: b.id,
        name,
        image: typeof b.image === 'string' && b.image.startsWith('/') ? b.image : '/images/screens/generic-1.jpg',
        description: pick(lang, str(b.description), b.description_fr) as string || t(lang, 'screens.brandDesc', { name }),
        models: models.filter((m) => m.brand === b.id),
      };
    })
    .filter((b: ScreenBrand) => b.models.length > 0);
}
export const getBrandIds = () => getBrands('ar').map((b) => b.id);
export const countModels = () => getBrands('ar').reduce((n, b) => n + b.models.length, 0);

/** نصوص شارات الموديل (أصلية/OLED/Incell/TFT/لون/مع إطار) */
export function modelBadges(m: ScreenModel, lang: Lang): string[] {
  const out: string[] = [];
  if (m.original) out.push(t(lang, 'screens.badge.original'));
  if (m.type) out.push(m.type === 'INCELL' ? 'Incell' : m.type);
  if (m.frame) out.push(t(lang, 'screens.badge.frame'));
  if (m.color) { const k = `screens.color.${m.color}`; const v = t(lang, k); out.push(v === k ? m.color : v); }
  return out;
}

export function waLink(text: string): string {
  return `https://wa.me/${screensWhatsapp()}?text=${encodeURIComponent(text)}`;
}
export function modelLink(brandName: string, m: ScreenModel, lang: Lang): string {
  const list = modelBadges(m, lang);
  const extra = list.length ? ` (${list.join(lang === 'fr' ? ', ' : '، ')})` : '';
  return waLink(t(lang, 'screens.wa.model', { brand: brandName, name: m.name, extra, price: formatPrice(m.price, lang) }));
}
export const brandLink = (brandName: string, lang: Lang) => waLink(t(lang, 'screens.wa.brand', { brand: brandName }));
export const generalLink = (lang: Lang) => waLink(t(lang, 'screens.wa.general'));
