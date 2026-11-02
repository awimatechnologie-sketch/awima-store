// أوقات العمل — تعمل على الخادم (البناء) وعلى المتصفح بنفس المنطق.
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

/** 10:00 → "10:00 صباحاً" ، 24:00 → "12:00 منتصف الليل" */
export function formatTime(s: string): string {
  const mins = toMinutes(s);
  if (mins === null) return s;
  if (mins % 1440 === 0) return '12:00 منتصف الليل';
  const h = Math.floor(mins / 60) % 24;
  const mm = String(mins % 60).padStart(2, '0');
  if (h === 12) return `12:${mm} ظهراً`;
  if (h === 0) return `12:${mm} صباحاً`;
  return h < 12 ? `${h}:${mm} صباحاً` : `${h - 12}:${mm} مساءً`;
}

export const hoursLabel = (open: string, close: string) =>
  `من ${formatTime(open)} إلى ${formatTime(close)}`;
