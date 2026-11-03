// Cloudflare Web Analytics: بلا كوكيز. التوكن يُدخَل من لوحة الإدارة (إعدادات الموقع).
// التوكن: 32 خانة سداسية عشرية (a-f و0-9) تجده في Cloudflare ← Web Analytics ← موقعك ← Manage site.
export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

export const isValidBeaconToken = (t: unknown): t is string =>
  typeof t === 'string' && /^[a-f0-9]{32}$/i.test(t.trim());

/** قيمة السمة data-cf-beacon، أو null إن لم يكن التوكن صالحاً */
export function beaconAttr(token: unknown): string | null {
  return isValidBeaconToken(token) ? JSON.stringify({ token: token.trim() }) : null;
}
