// الإعدادات تُقرأ الآن من src/data/settings.json (تُعدَّل من لوحة /admin).
// حافظنا على نفس شكل الكائن `site` حتى لا تتغير بقية الملفات.
import settings from '../data/settings.json';

type Settings = {
  name: string;
  tagline: string;
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
  };
  social?: { facebook?: string; instagram?: string; tiktok?: string };
  customCss?: string;
};
const s = settings as Settings;

// لون HEX صالح فقط، وإلا نستعمل القيمة الافتراضية
const hex = (v: string | undefined, fallback: string) =>
  v && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : fallback;

export const site = {
  name: s.name || 'AWIMA Store',
  tagline: s.tagline || '',
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
  },
  social: {
    facebook: s.social?.facebook ?? '',
    instagram: s.social?.instagram ?? '',
    tiktok: s.social?.tiktok ?? '',
  },
  // CSS مخصص (قسم متقدم): نحذف أي "<" لمنع الخروج من وسم style
  customCss: (s.customCss ?? '').replace(/</g, ''),
};
