// الإعدادات تُقرأ الآن من src/data/settings.json (تُعدَّل من لوحة /admin).
// حافظنا على نفس شكل الكائن `site` حتى لا تتغير بقية الملفات.
import settings from '../data/settings.json';
import { isValidTime } from '../lib/hours';
import { isValidBeaconToken } from '../lib/analytics';
import { normalizeFee, normalizeFreeFrom } from '../lib/delivery';
import { normalizeDiscounts } from '../lib/discounts';
import { normalizeOffers } from '../lib/offers';
import { normalizeWarranty } from '../lib/warranty';
import { pick, type Lang } from '../i18n';

type Settings = {
  name: string;
  tagline: string;
  tagline_fr?: string;
  url: string;
  logo?: { store?: string; icon?: string; og?: string };
  colors?: { primary?: string; accent?: string; alert?: string };
  contact?: {
    whatsapp?: string;
    whatsappSecondary?: string;
    phoneDisplay?: string;
    phoneSecondaryDisplay?: string;
    email?: string;
    address?: string;
    mapUrl?: string;
  };
  social?: { facebook?: string; instagram?: string; tiktok?: string };
  announcements?: { text?: string; text_fr?: string; link?: string; enabled?: boolean }[];
  hours?: { open?: string; close?: string };
  fastDelivery?: { minItems?: number; hours?: number };
  freeDeliveryFrom?: number | null;
  discounts?: unknown;
  warranty?: unknown;
  autoOffersEnabled?: boolean;
  autoOffers?: unknown;
  cities?: { name?: string; name_fr?: string; open?: boolean; fee?: number }[];
  analytics?: { cloudflareToken?: string };
  customCss?: string;
};
const s = settings as Settings;

// لون HEX صالح فقط، وإلا نستعمل القيمة الافتراضية
const hex = (v: string | undefined, fallback: string) =>
  v && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : fallback;

// رابط آمن فقط: مسار داخلي أو https
const safeLink = (v?: string) => {
  const x = (v ?? '').trim();
  return x.startsWith('/') && !x.startsWith('//') ? x : /^https:\/\//.test(x) ? x : '';
};
const posInt = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : fallback;

export const site = {
  name: s.name || 'AWIMA Store',
  tagline: s.tagline || '',
  taglineFr: (s.tagline_fr ?? '').trim(),
  url: (s.url || 'https://awima-store.pages.dev').replace(/\/$/, ''),
  // ثوابت لا تُعدَّل من اللوحة
  lang: 'ar',
  dir: 'rtl',
  currency: 'MAD',
  currencyLabel: 'د.م.',
  logo: {
    store: s.logo?.store || '/images/logo-store.png',
    icon: s.logo?.icon || '/images/logo-icon.png',
    og: s.logo?.og || '/images/og-image.png',
  },
  colors: {
    primary: hex(s.colors?.primary, '#0B2A6F'),
    accent: hex(s.colors?.accent, '#0A6CFF'),
    alert: hex(s.colors?.alert, '#E4161B'),
  },
  contact: {
    // الصيغة الدولية بدون + ولا صفر البداية
    whatsapp: (s.contact?.whatsapp ?? '').replace(/\D/g, ''),
    whatsappSecondary: (s.contact?.whatsappSecondary ?? '').replace(/\D/g, ''),
    phoneDisplay: s.contact?.phoneDisplay ?? '',
    phoneSecondaryDisplay: s.contact?.phoneSecondaryDisplay ?? '',
    email: s.contact?.email ?? '',
    address: s.contact?.address ?? '',
    // رابط خريطة (https فقط) يظهر في صفحة من نحن
    mapUrl: safeLink(s.contact?.mapUrl).startsWith('https://') ? safeLink(s.contact?.mapUrl) : '',
  },
  social: {
    facebook: s.social?.facebook ?? '',
    instagram: s.social?.instagram ?? '',
    tiktok: s.social?.tiktok ?? '',
  },
  // شريط العروض: تُعرض العروض المفعّلة فقط
  announcements: (s.announcements ?? [])
    .filter((a) => a?.text && a.enabled !== false)
    .map((a) => ({ text: String(a.text), textFr: (a.text_fr ?? '').trim(), link: safeLink(a.link) })),
  // أوقات العمل (توقيت المغرب). 24:00 = منتصف الليل
  hours: {
    open: isValidTime(s.hours?.open) ? s.hours!.open!.trim() : '10:00',
    close: isValidTime(s.hours?.close) ? s.hours!.close!.trim() : '24:00',
  },
  // عرض التوصيل السريع: عدد المنتجات الأدنى والمدة بالساعات
  fastDelivery: {
    minItems: posInt(s.fastDelivery?.minItems, 4),
    hours: posInt(s.fastDelivery?.hours, 5),
  },
  // التوصيل مجاني ابتداءً من هذا المجموع (درهم). null = معطّل
  freeDeliveryFrom: normalizeFreeFrom(s.freeDeliveryFrom),
  // أكواد الخصم المفعّلة والصالحة فقط
  discounts: normalizeDiscounts(s.discounts),
  // العروض التلقائية (خصم الباقات والخصم المؤقت): المفتاح الرئيسي يوقفها كلها دفعة واحدة
  autoOffers: s.autoOffersEnabled === false ? [] : normalizeOffers(s.autoOffers),
  // الضمان: يظهر على المنتجات وفي صفحة السياسة فقط عند تفعيله
  warranty: normalizeWarranty(s.warranty),
  // المدن: المفتوحة فقط يمكن الطلب منها، والبقية تظهر مقفلة
  cities: (s.cities ?? [])
    .filter((c) => c?.name)
    .map((c) => ({ name: String(c.name), nameFr: (c.name_fr ?? '').trim(), open: c.open === true, fee: normalizeFee(c.fee) })),
  // إحصائيات Cloudflare (اختيارية): لا يُحمَّل شيء إن كان التوكن فارغاً أو غير صالح
  analytics: {
    cloudflareToken: isValidBeaconToken(s.analytics?.cloudflareToken) ? s.analytics!.cloudflareToken!.trim() : '',
  },
  // CSS مخصص (قسم متقدم): نحذف أي "<" لمنع الخروج من وسم style
  customCss: (s.customCss ?? '').replace(/</g, ''),
};

/** الحقول القابلة للترجمة بلغة الصفحة (ما ليس له ترجمة فرنسية يبقى بالعربية) */
export function localizedSite(lang: Lang) {
  return {
    tagline: pick(lang, site.tagline, site.taglineFr) as string,
    announcements: site.announcements.map((a) => ({ ...a, text: pick(lang, a.text, a.textFr) as string })),
    cities: site.cities.map((c) => ({ ...c, name: pick(lang, c.name, c.nameFr) as string })),
  };
}
