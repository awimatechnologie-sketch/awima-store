// رقم الطلب المرجعي: AW-YYYYMMDD-XXXX (التاريخ بتوقيت المغرب + 4 رموز عشوائية).
// لا يحتاج خادماً. تجنّبنا الرموز المتشابهة (0/O و1/I) لتسهيل قراءته عبر الهاتف.
const TZ = 'Africa/Casablanca';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 رمزاً

export function dateStamp(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}`;
}

export function orderRef(d = new Date(), rand: (n: number) => Uint8Array = randomBytes): string {
  const bytes = rand(4);
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `AW-${dateStamp(d)}-${suffix}`;
}

function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
