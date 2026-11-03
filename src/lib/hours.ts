// أوقات العمل — تعمل على الخادم (البناء) وعلى المتصفح بنفس المنطق.
import { t, type Lang } from '../i18n';

const TZ = 'Africa/Casablanca';

export const isValidTime = (s: unknown): s is string =>
  typeof s === 'string' && /^([01]?\d|2[0-4]):[0-5]\d$/.test(s.trim());

export function toMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** الوقت الحالي في المغرب بالدقائق منذ منتصف الليل */
export function nowMinutes(d = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** هل المتجر مفتوح الآن؟ null إذا كانت الأوقات غير صالحة */
export function isOpenNow(open: string, close: string, d = new Date()): boolean | null {
  const o = toMinutes(open);
  const c = toMinutes(close);
  if (o === null || c === null) return null;
  if (o === c) return true; // نفس الوقت = مفتوح دائماً
  const cur = nowMinutes(d);
  return o < c ? cur >= o && cur < c : cur >= o || cur < c;
}

/** 10:00 → "10:00 صباحاً" ، 24:00 → "12:00 منتصف الليل" (وبالفرنسية: 10h00 ، minuit) */
export function formatTime(s: string, lang: Lang = 'ar'): string {
  const mins = toMinutes(s);
  if (mins === null) return s;
  if (mins % 1440 === 0) return t(lang, 'hours.midnight');
  const h = Math.floor(mins / 60) % 24;
  const mm = String(mins % 60).padStart(2, '0');
  if (lang === 'fr') return `${h}h${mm}`;
  if (h === 12) return t(lang, 'hours.noon', { mm });
  if (h === 0) return t(lang, 'hours.midnightAm', { mm });
  return h < 12 ? t(lang, 'hours.am', { h, mm }) : t(lang, 'hours.pm', { h: h - 12, mm });
}

export const hoursLabel = (open: string, close: string, lang: Lang = 'ar') =>
  t(lang, 'hours.range', { a: formatTime(open, lang), b: formatTime(close, lang) });
