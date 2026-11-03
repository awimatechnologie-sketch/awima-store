// اختبارات المنطق الصرف (بدون Astro): node --test scripts/
// تعمل مع Node >= 22.18 لأنها تستورد ملفات .ts مباشرة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matches } from '../src/lib/search.ts';
import { orderRef, dateStamp } from '../src/lib/order.ts';
import { isOpenNow } from '../src/lib/hours.ts';
import { pickRelated } from '../src/lib/related.ts';
import { pickSuggestions } from '../src/lib/suggest.ts';
import { isValidBeaconToken, beaconAttr, BEACON_SRC } from '../src/lib/analytics.ts';
import { feeFor, orderTotals, normalizeFee } from '../src/lib/delivery.ts';
import { normalizeStock, effectiveAvailability, maxQty } from '../src/lib/stock.ts';
import { dictionaries, t, plural, pick, localePath, alternatePath, langFromPath, langOf, dirOf } from '../src/i18n/index.ts';
import { formatTime, hoursLabel } from '../src/lib/hours.ts';
import { formatPrice } from '../src/lib/format.ts';
import { summarize, tierFor, normalizeReview, MIN_POINTS } from '../src/lib/reviews.ts';
import { localizeProduct, localizeCategory } from '../src/lib/localize.ts';
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

test('analytics: التوكن الصالح فقط يُنتج سمة data-cf-beacon', () => {
  const ok = '0123456789abcdef0123456789ABCDEF';
  assert.ok(isValidBeaconToken(ok));
  assert.equal(beaconAttr(` ${ok} `), JSON.stringify({ token: ok }));
  for (const bad of ['', 'abc', 'g'.repeat(32), ok + '0', null, undefined, 42, '"><script>alert(1)</script>'])
    assert.equal(beaconAttr(bad), null);
  assert.equal(BEACON_SRC, 'https://static.cloudflareinsights.com/beacon.min.js');
});

test('delivery: رسم المدينة يُضاف إلى المجموع، وسلة فارغة بلا رسوم', () => {
  const cities = [{ name: 'أكادير', fee: 15 }, { name: 'فاس', fee: 30 }, { name: 'بلا رسم', fee: null }];
  assert.equal(feeFor(cities, 'أكادير'), 15);
  assert.equal(feeFor(cities, 'فاس'), 30);
  assert.equal(feeFor(cities, 'بلا رسم'), null);
  assert.equal(feeFor(cities, 'غير موجودة'), null);
  assert.deepEqual(orderTotals(120, 3, 15), { subtotal: 120, fee: 15, total: 135 });
  assert.deepEqual(orderTotals(120, 3, null), { subtotal: 120, fee: 0, total: 120 });
  assert.deepEqual(orderTotals(0, 0, 15), { subtotal: 0, fee: 0, total: 0 });
  assert.deepEqual(orderTotals(50, 1, 0), { subtotal: 50, fee: 0, total: 50 });
  assert.equal(normalizeFee(-1), null);
  assert.equal(normalizeFee('15'), null);
  assert.equal(normalizeFee(0), 0);
  assert.equal(normalizeFee(12.5), 12.5);
});

test('stock: 0 = غير متوفر تلقائياً، وفارغ = غير محدود، وحد الكمية', () => {
  assert.equal(normalizeStock(5), 5);
  assert.equal(normalizeStock(0), 0);
  for (const bad of [-1, 1.5, '3', null, undefined, NaN]) assert.equal(normalizeStock(bad), null);
  assert.equal(effectiveAvailability('in_stock', 0), 'out_of_stock');
  assert.equal(effectiveAvailability('on_request', 0), 'out_of_stock');
  assert.equal(effectiveAvailability('in_stock', 3), 'in_stock');
  assert.equal(effectiveAvailability('in_stock', null), 'in_stock');
  assert.equal(effectiveAvailability('out_of_stock', 9), 'out_of_stock'); // الإخفاء اليدوي يغلب
  assert.equal(maxQty(null), 99);
  assert.equal(maxQty(undefined), 99);
  assert.equal(maxQty(4), 4);
  assert.equal(maxQty(500), 99);
  assert.equal(maxQty(0), 0);
});

test('cart: addToCart يحترم حد المخزون ويعيد false عند الوصول إليه', async () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  globalThis.localStorage = mem();
  globalThis.sessionStorage = mem();
  globalThis.window = { dispatchEvent: () => true };
  globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
  const { addToCart, readCart } = await import('../src/lib/cart.ts');
  assert.equal(addToCart('P-1', 1, 2), true);
  assert.equal(addToCart('P-1', 1, 2), true);
  assert.equal(addToCart('P-1', 1, 2), false); // الحد 2
  assert.equal(readCart().find((l) => l.id === 'P-1').qty, 2);
  assert.equal(addToCart('P-2', 1, 0), false); // مخزون 0
  assert.equal(readCart().some((l) => l.id === 'P-2'), false);
  assert.equal(addToCart('P-3', 5), true); // بلا حد = حتى 99
  assert.equal(readCart().find((l) => l.id === 'P-3').qty, 5);
});

test('i18n: كل مفتاح عربي له مقابل فرنسي بنفس المتغيرات {x}', () => {
  const ar = dictionaries.ar, fr = dictionaries.fr;
  const vars = (str) => [...str.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(ar).sort());
  for (const k of Object.keys(ar)) assert.equal(vars(fr[k]), vars(ar[k]), `المتغيرات تختلف في المفتاح ${k}`);
  for (const [lang, d] of Object.entries(dictionaries))
    for (const [k, v] of Object.entries(d)) assert.ok(v.trim() !== '' || k.endsWith('Extra'), `${lang}:${k} فارغ`);
});

test('i18n: t وplural وpick والمسارات', () => {
  assert.equal(t('fr', 'cart.msg.grand', { amount: '100 DH' }), 'Total : 100 DH');
  assert.equal(t('ar', 'toast.added', { name: 'X' }), 'أُضيف «X» إلى السلة');
  assert.equal(t('fr', 'no.such.key'), 'no.such.key');
  assert.equal(plural('ar', 1), 'منتج واحد'); assert.equal(plural('ar', 2), 'منتجان'); assert.equal(plural('ar', 5), '5 منتجات');
  assert.equal(plural('fr', 1), '1 produit'); assert.equal(plural('fr', 3), '3 produits');
  assert.equal(pick('fr', 'عربي', 'Français'), 'Français');
  assert.equal(pick('fr', 'عربي', '  '), 'عربي');
  assert.equal(pick('fr', 'عربي', undefined), 'عربي');
  assert.equal(pick('ar', 'عربي', 'Français'), 'عربي');
  assert.equal(localePath('ar', '/products'), '/products');
  assert.equal(localePath('fr', '/products?category=cables'), '/fr/products?category=cables');
  assert.equal(localePath('fr', '/'), '/fr/');
  assert.equal(localePath('fr', '/fr/cart'), '/fr/cart');
  assert.equal(localePath('fr', 'https://x.ma/a'), 'https://x.ma/a');
  assert.equal(localePath('fr', '//evil.com'), '//evil.com');
  assert.equal(langFromPath('/fr/products'), 'fr'); assert.equal(langFromPath('/fr'), 'fr');
  assert.equal(langFromPath('/frozen'), 'ar'); assert.equal(langFromPath('/products/fr'), 'ar');
  assert.equal(alternatePath('/products/sd-card', 'fr'), '/fr/products/sd-card');
  assert.equal(alternatePath('/fr/products/sd-card', 'ar'), '/products/sd-card');
  assert.equal(alternatePath('/fr/', 'ar'), '/'); assert.equal(alternatePath('/fr', 'ar'), '/');
  assert.equal(alternatePath('/', 'fr'), '/fr/');
  assert.equal(langOf('de'), 'ar'); assert.equal(langOf('fr'), 'fr');
  assert.equal(dirOf('ar'), 'rtl'); assert.equal(dirOf('fr'), 'ltr');
});

test('i18n: الأوقات والأسعار بالفرنسية', () => {
  assert.equal(formatTime('10:00', 'fr'), '10h00');
  assert.equal(formatTime('13:30', 'fr'), '13h30');
  assert.equal(formatTime('24:00', 'fr'), 'minuit');
  assert.equal(hoursLabel('10:00', '24:00', 'fr'), 'de 10h00 à minuit');
  assert.equal(hoursLabel('10:00', '24:00'), 'من 10:00 صباحاً إلى 12:00 منتصف الليل'); // العربية كما كانت
  assert.equal(formatTime('0:15', 'ar'), '12:15 صباحاً');
  assert.equal(formatPrice(null, 'fr'), 'Appelez pour connaître le prix');
  assert.match(formatPrice(1234, 'fr'), /^1\s234\sDH$/u);
  assert.match(formatPrice(55, 'ar'), /^55 د\.م\.$/u);
});

test('localize: المحتوى الفرنسي الناقص يرجع للعربية', () => {
  const p = { id: 'P-1', name: 'كابل', shortDescription: 'ق', description: 'و', specs: { 'الطول': '1 م' }, category: 'c', fr: { name: 'Câble', shortDescription: '', specs: { Longueur: '1 m' } } };
  const f = localizeProduct(p, 'fr');
  assert.equal(f.name, 'Câble');
  assert.equal(f.shortDescription, 'ق'); // فارغ → العربية
  assert.equal(f.description, 'و');
  assert.deepEqual(f.specs, { Longueur: '1 m' });
  assert.equal(localizeProduct(p, 'ar'), p);
  assert.equal(localizeProduct({ ...p, fr: undefined }, 'fr').name, 'كابل');
  assert.equal(localizeCategory({ id: 'a', name: 'كوابل', slug: 'cables', nameFr: 'Câbles' }, 'fr').name, 'Câbles');
  assert.equal(localizeCategory({ id: 'a', name: 'كوابل', slug: 'cables' }, 'fr').name, 'كوابل');
});

test('seo: sitemap مع hreflang', () => {
  const xml = buildSitemap('https://x.ma', ['/a', '/fr/a'], (p) => [{ lang: 'ar', path: '/a' }, { lang: 'fr', path: '/fr/a' }]);
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(xml, /<xhtml:link rel="alternate" hreflang="fr" href="https:\/\/x\.ma\/fr\/a"\/>/);
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
  assert.doesNotMatch(buildSitemap('https://x.ma', ['/a']), /xhtml/);
});

test('reviews: الأوزان والإطار اللوني', () => {
  const rv = (rating, buyer) => ({ product: 'P-1', rating, buyer });
  assert.equal(summarize([]).tier, 'none');
  assert.equal(summarize([rv(5, 'new')]).tier, 'none'); // نقطة واحدة لا تكفي
  assert.equal(summarize([rv(5, 'new'), rv(5, 'new'), rv(5, 'new'), rv(5, 'new'), rv(5, 'new')]).tier, 'green-light'); // 5 نقاط
  assert.equal(summarize([rv(5, 'verified')]).tier, 'green-light'); // 5 نقاط لكن دون حد القوة
  assert.equal(summarize([rv(5, 'verified'), rv(5, 'verified')]).tier, 'green-dark');
  // المشتري الموثَّق يرجّح: 4 نجوم موثَّقة مقابل 1 نجمة من زبون جديد
  const mixed = summarize([rv(4, 'verified'), rv(1, 'new')]);
  assert.equal(mixed.points, 6);
  assert.equal(mixed.average, 3.5);
  assert.equal(mixed.tier, 'yellow');
  assert.equal(summarize([rv(1, 'verified')]).tier, 'yellow'); // الأحمر معطّل الآن
  assert.equal(tierFor(5, MIN_POINTS - 1), 'none');
  assert.equal(summarize([rv(4, 'verified'), rv(5, 'verified')]).average, 4.5);
});

test('reviews: التحقق من السجل الخام', () => {
  assert.equal(normalizeReview(null), null);
  assert.equal(normalizeReview({ product: 'P-1', rating: 6, buyer: 'new' }), null);
  assert.equal(normalizeReview({ product: 'P-1', rating: 4.5, buyer: 'new' }), null);
  assert.equal(normalizeReview({ product: 'P-1', rating: 4, buyer: 'new', published: false }), null);
  assert.equal(normalizeReview({ rating: 4, buyer: 'new' }), null);
  assert.equal(normalizeReview({ product: 'P-1', rating: 4, buyer: 'غريب' }).buyer, 'new'); // غير المعروف = زبون جديد
  assert.equal(normalizeReview({ product: 'P-1', rating: 5, buyer: 'verified', comment: '  ممتاز ' }).comment, 'ممتاز');
});
