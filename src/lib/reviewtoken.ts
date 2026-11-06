// رابط تقييم «مشترٍ موثّق»: رمز موقَّع (HMAC) يصدره المدير لمنتج واحد، صالح مدة محدودة ويُستعمل مرة واحدة.
// الشكل: PRODUCT.NONCE.EXPIRY.SIG  (لا نقاط داخل المعرّف). المفتاح السري في بيئة الخادم فقط.
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data))).slice(0, 40);
}

export const TOKEN_DEFAULT_DAYS = 30;
export const TOKEN_MAX_DAYS = 90;

export async function makeToken(secret: string, product: string, days = TOKEN_DEFAULT_DAYS, now = Date.now()): Promise<string> {
  const d = Math.min(TOKEN_MAX_DAYS, Math.max(1, Math.floor(days) || TOKEN_DEFAULT_DAYS));
  const nonce = hex(crypto.getRandomValues(new Uint8Array(8)).buffer);
  const body = `${product}.${nonce}.${now + d * 86400_000}`;
  return `${body}.${await hmac(secret, body)}`;
}

export type TokenCheck = { ok: true; product: string; nonce: string } | { ok: false; error: 'bad_token' | 'expired_token' };

export async function verifyToken(secret: string, token: unknown, now = Date.now()): Promise<TokenCheck> {
  if (typeof token !== 'string' || token.length > 200) return { ok: false, error: 'bad_token' };
  const parts = token.split('.');
  if (parts.length !== 4 || !secret) return { ok: false, error: 'bad_token' };
  const [product, nonce, exp, sig] = parts;
  const want = await hmac(secret, `${product}.${nonce}.${exp}`);
  let diff = want.length ^ sig.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (sig.charCodeAt(i) || 0);
  if (diff !== 0) return { ok: false, error: 'bad_token' };
  if (!(Number(exp) > now)) return { ok: false, error: 'expired_token' };
  return { ok: true, product, nonce };
}
