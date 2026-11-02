// اختبارات المنطق الصرف (بدون Astro): node --test scripts/
// تعمل مع Node >= 22.18 لأنها تستورد ملفات .ts مباشرة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matches } from '../src/lib/search.ts';
import { orderRef, dateStamp } from '../src/lib/order.ts';
import { isOpenNow } from '../src/lib/hours.ts';
import { pickRelated } from '../src/lib/related.ts';
import { pickSuggestions } from '../src/lib/suggest.ts';
import { buildSitemap, buildRobots, buildStoreLd } from '../src/lib/seo.ts';

test('normalize: التشكيل والألف والتاء المربوطة والأرقام الهندية', () => {
  assert.equal(normalize('كَابِل'), 'كابل');
  assert.equal(normalize('أداة'), normalize('اداه'));
  assert.equal(normalize('بطاقة'), normalize('بطاقه'));
  assert.equal(normalize('ذاكرة ٦٤ جيجا'), 'ذاكره 64 جيجا');
  assert.equal(normalize('Câble  USB-C'), 'cable usb c');
});

test('matches: AND بين الكلمات وبلا ترتيب', () => {
  const h = normalize('كابل USB-C إلى HDMI P-0007 كوابل');
  assert.ok(matches('hdmi كابل', h));
  assert.ok(matches('usb c', h));
  assert.ok(matches('p-0007', h));
  assert.ok(!matches('hdmi فلاش', h));
  assert.ok(matches('', h)); // بحث فارغ = الكل
});

test('orderRef: الصيغة والتاريخ بتوقيت المغرب', () => {
  const ref = orderRef(new Date('2026-11-02T10:00:00Z'));
  assert.match(ref, /^AW-20261102-[A-HJ-NP-Z2-9]{4}$/);
  // 23:30 UTC في الشتاء = نفس اليوم؛ تحقق أن التاريخ لا يتقدم خطأً
  assert.equal(dateStamp(new Date('2026-11-02T23:30:00Z')), '20261102');
});

test('orderRef: يستعمل المولّد الممرَّر ولا يكرر عادةً', () => {
  const fixed = orderRef(new Date('2026-01-05T12:00:00Z'), () => new Uint8Array([0, 1, 2, 3]));
  assert.equal(fixed, 'AW-20260105-ABCD');
  const set = new Set(Array.from({ length: 500 }, () => orderRef()));
  assert.ok(set.size > 490);
});

test('isOpenNow: ساعات عادية، تعبر منتصف الليل، و24:00', () => {
  // إزاحة المغرب تتغير (UTC+1 معظم السنة، UTC+0 في رمضان) فنحسب الدقائق الحالية بالمنطقة نفسها بدل افتراض إزاحة ثابتة
  const at = (h, m) => new Date(`2026-11-02T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const nowMin = (d) => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    return Number(p.find((x) => x.type === 'hour').value) * 60 + Number(p.find((x) => x.type === 'minute').value);
  };
  const d = at(12, 0);
  const cur = nowMin(d);
  const hhmm = (m) => `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
  assert.equal(isOpenNow(hhmm(cur - 60), hhmm(cur + 60), d), true);
  assert.equal(isOpenNow(hhmm(cur + 60), hhmm(cur + 120), d), false);
  assert.equal(isOpenNow('10:00', '10:00', d), true); // نفس الوقت = مفتوح دائماً
  assert.equal(isOpenNow('xx', '24:00', d), null);
  assert.equal(isOpenNow('22:00', '02:00', new Date('2026-11-02T00:30:00Z')) !== null, true);
});

test('cart: pruneCart يحذف المعرّفات غير الموجودة ويسجّل العدد مرة واحدة', async () => {
  const mem = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };
  globalThis.localStorage = mem();
  globalThis.sessionStorage = mem();
  let events = 0;
  globalThis.window = { dispatchEvent: () => { events++; return true; } };
  globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

  const { addToCart, readCart, pruneCart, takePruned, cartCount } = await import('../src/lib/cart.ts');
  addToCart('P-0001', 2);
  addToCart('P-0002');
  addToCart('P-9999', 3); // منتج حُذف لاحقاً
  assert.equal(cartCount(), 6);

  assert.equal(pruneCart(new Set(['P-0001', 'P-0002'])), 1);
  assert.deepEqual(readCart(), [{ id: 'P-0001', qty: 2 }, { id: 'P-0002', qty: 1 }]);
  assert.equal(pruneCart(new Set(['P-0001', 'P-0002'])), 0); // لا تغيير ثانٍ
  const before = events;
  assert.equal(takePruned(), 1);
  assert.equal(takePruned(), 0); // تُقرأ مرة واحدة
  assert.equal(events, before);

  // بيانات تالفة في التخزين لا تكسر شيئاً
  localStorage.setItem('awima_cart_v1', '{oops');
  assert.deepEqual(readCart(), []);
});

const P = (id, category, extra = {}) => ({ id, category, price: 10, availability: 'in_stock', ...extra });

test('pickRelated: اليدوي أولاً بترتيبه، ثم نفس القسم، ثم البقية، بلا تكرار ولا المنتج نفسه', () => {
  const all = [P('P-1', 'a'), P('P-2', 'a'), P('P-3', 'b'), P('P-4', 'a'), P('P-5', 'b'), P('P-6', 'c')];
  const cur = P('P-1', 'a', { related: ['P-5', 'P-1', 'P-404', 'P-5', 'P-3'] });
  const ids = pickRelated(cur, all, 4).map((p) => p.id);
  assert.deepEqual(ids, ['P-5', 'P-3', 'P-2', 'P-4']);
  assert.deepEqual(pickRelated(P('P-1', 'a'), all, 3).map((p) => p.id), ['P-2', 'P-4', 'P-3']);
  assert.deepEqual(pickRelated(P('P-9', 'z'), [P('P-9', 'z')], 4), []);
});

test('pickSuggestions: الأرخص المتوفر ذو السعر، دون ما في السلة', () => {
  const ps = [
    P('P-1', 'a', { price: 50 }), P('P-2', 'a', { price: 20 }), P('P-3', 'a', { price: null }),
    P('P-4', 'a', { price: 5, availability: 'out_of_stock' }), P('P-5', 'a', { price: 20 }), P('P-6', 'a', { price: 8, availability: 'on_request' }),
  ];
  assert.deepEqual(pickSuggestions(ps, new Set(['P-6'])).map((p) => p.id), ['P-2', 'P-5', 'P-1']);
  assert.deepEqual(pickSuggestions(ps, new Set(), 1).map((p) => p.id), ['P-6']);
});

test('seo: sitemap يهرّب الرموز ويحذف التكرار، وrobots يحجب الإدارة والسلة', () => {
  const xml = buildSitemap('https://x.ma/', ['/', '/a&b', '/', 'c']);
  assert.match(xml, /<loc>https:\/\/x\.ma\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/x\.ma\/a&amp;b<\/loc>/);
  assert.match(xml, /<loc>https:\/\/x\.ma\/c<\/loc>/);
  assert.equal((xml.match(/<url>/g) ?? []).length, 3);
  const r = buildRobots('https://x.ma/');
  assert.match(r, /Disallow: \/admin\//);
  assert.match(r, /Sitemap: https:\/\/x\.ma\/sitemap\.xml/);
});

test('seo: Store JSON-LD (24:00 → 00:00، المدن المفتوحة فقط، روابط https فقط)', () => {
  const ld = buildStoreLd({
    name: 'N', tagline: 'T', url: 'https://x.ma',
    logo: { store: '/images/l.png', og: '/images/o.png' },
    contact: { whatsapp: '212652091799', email: '', address: '' },
    social: { facebook: 'https://fb.com/x', instagram: '', tiktok: 'javascript:alert(1)' },
    hours: { open: '9:00', close: '24:00' },
    cities: [{ name: 'أكادير', open: true }, { name: 'فاس', open: false }],
  });
  assert.equal(ld.telephone, '+212652091799');
  assert.equal(ld.logo, 'https://x.ma/images/l.png');
  assert.equal(ld.openingHoursSpecification[0].opens, '09:00');
  assert.equal(ld.openingHoursSpecification[0].closes, '00:00');
  assert.deepEqual(ld.sameAs, ['https://fb.com/x']);
  assert.deepEqual(ld.areaServed, [{ '@type': 'City', name: 'أكادير' }]);
  assert.equal('email' in ld, false);
});
