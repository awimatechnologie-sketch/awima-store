// اختبارات المنطق الصرف (بدون Astro): node --test scripts/
// تعمل مع Node >= 22.18 لأنها تستورد ملفات .ts مباشرة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matches } from '../src/lib/search.ts';
import { orderRef, dateStamp } from '../src/lib/order.ts';
import { isOpenNow } from '../src/lib/hours.ts';
import { pickRelated } from '../src/lib/related.ts';
import { pickSuggestions, pickCartRelated } from '../src/lib/suggest.ts';
import { isValidBeaconToken, beaconAttr, BEACON_SRC } from '../src/lib/analytics.ts';
import { feeFor, orderTotals, normalizeFee, normalizeFreeFrom, effectiveFee, freeRemaining } from '../src/lib/delivery.ts';
import { normalizeStock, effectiveAvailability, maxQty, isLowStock } from '../src/lib/stock.ts';
import { dictionaries, t, plural, pick, localePath, alternatePath, langFromPath, langOf, dirOf } from '../src/i18n/index.ts';
import { formatTime, hoursLabel } from '../src/lib/hours.ts';
import { formatPrice } from '../src/lib/format.ts';
import { normalizeCode, normalizeDiscounts, evaluateDiscount, hashCode, moroccoToday } from '../src/lib/discounts.ts';
import { buildManifest } from '../src/lib/pwa.ts';
import { normalizeOffers, applyOffers, offerActive, offerCovers, badgeOffersFor } from '../src/lib/offers.ts';
import { parseBlocks } from '../src/lib/richtext.ts';
import { normalizeWarranty, warrantyDaysFor, warrantyUnit } from '../src/lib/warranty.ts';
import { normalizeDevices, brandsOf, normalizePorts, productsForPort } from '../src/lib/compat.ts';
import { normalizeCommunity, isTrusted, starsHtml, checkReview } from '../src/lib/community.ts';
import { summaryFrom, DEFAULT_THRESHOLDS } from '../src/lib/reviews.ts';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
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

test('delivery: التوصيل المجاني فوق حد معيّن', () => {
  assert.equal(normalizeFreeFrom(300), 300);
  assert.equal(normalizeFreeFrom(0), null);
  assert.equal(normalizeFreeFrom(null), null);
  assert.equal(normalizeFreeFrom('300'), null);
  assert.equal(effectiveFee(15, 299, 300), 15);
  assert.equal(effectiveFee(15, 300, 300), 0);
  assert.equal(effectiveFee(null, 450, 300), 0); // رسم غير محدد + بلوغ الحد = مجاني
  assert.equal(effectiveFee(15, 500, null), 15); // معطّل
  assert.equal(effectiveFee(15, 0, 300), 15);
  assert.equal(freeRemaining(120, 300), 180);
  assert.equal(freeRemaining(300, 300), null);
  assert.equal(freeRemaining(50, null), null);
  assert.deepEqual(orderTotals(320, 2, effectiveFee(30, 320, 300)), { subtotal: 320, fee: 0, total: 320 });
});

test('stock: متبقّ N فقط', () => {
  assert.equal(isLowStock(5), true);
  assert.equal(isLowStock(1), true);
  assert.equal(isLowStock(6), false);
  assert.equal(isLowStock(0), false);
  assert.equal(isLowStock(null), false);
  assert.equal(isLowStock(undefined), false);
});

test('suggest: قد يعجبك أيضاً في السلة', () => {
  const mk = (id, price, category, related = [], availability = 'in_stock') => ({ id, price, category, related, availability });
  const all = [mk('A', 50, 'c1', ['D', 'X']), mk('B', 20, 'c1'), mk('C', 10, 'c2'), mk('D', 90, 'c3'), mk('E', 5, 'c1', [], 'out_of_stock'), mk('F', null, 'c1')];
  assert.deepEqual(pickCartRelated(all, new Set(['A']), 3).map((p) => p.id), ['D', 'B']); // اليدوي أولاً ثم القسم؛ E نافد وF بلا سعر
  assert.deepEqual(pickCartRelated(all, new Set(['A', 'B', 'D']), 3), []);
  assert.deepEqual(pickCartRelated(all, new Set(), 3), []);
  assert.equal(pickCartRelated(all, new Set(['A']), 1).length, 1);
});

test('discounts: التطبيع والتحقق', () => {
  assert.equal(normalizeCode(' ab c-1 '), 'ABC-1');
  const list = normalizeDiscounts([
    { code: 'welcome10', type: 'percent', value: 10 },
    { code: 'WELCOME10', type: 'fixed', value: 5 }, // مكرر
    { code: 'bad', type: 'percent', value: 150 }, // نسبة > 100
    { code: 'ab', type: 'fixed', value: 5 }, // قصير
    { code: 'OFF', type: 'fixed', value: 0 },
    { code: 'GONE', type: 'fixed', value: 5, enabled: false },
    { code: 'RANGE', type: 'fixed', value: 5, startDate: '2026-12-31', endDate: '2026-01-01' },
    { code: 'SAVE20', type: 'fixed', value: 20, minSubtotal: 100, startDate: '2026-11-01T00:00:00', endDate: '2026-11-30' },
    null,
  ]);
  assert.deepEqual(list.map((d) => d.code), ['WELCOME10', 'SAVE20']);
  assert.equal(list[1].start, '2026-11-01');
  assert.equal(list[1].minSubtotal, 100);
  assert.deepEqual(normalizeDiscounts(undefined), []);
});

test('discounts: التقييم والتواريخ', () => {
  const pct = { type: 'percent', value: 10, minSubtotal: null, start: null, end: null };
  assert.deepEqual(evaluateDiscount(pct, 250, '2026-11-03'), { ok: true, amount: 25 });
  assert.deepEqual(evaluateDiscount({ ...pct, type: 'fixed', value: 500 }, 120, '2026-11-03'), { ok: true, amount: 120 }); // لا يتجاوز المجموع
  const win = { ...pct, start: '2026-11-10', end: '2026-11-20', minSubtotal: 100 };
  assert.deepEqual(evaluateDiscount(win, 200, '2026-11-09'), { ok: false, reason: 'notStarted', date: '2026-11-10' });
  assert.equal(evaluateDiscount(win, 200, '2026-11-10').ok, true); // يوم البداية يشمل
  assert.equal(evaluateDiscount(win, 200, '2026-11-20').ok, true); // يوم النهاية يشمل
  assert.deepEqual(evaluateDiscount(win, 200, '2026-11-21'), { ok: false, reason: 'expired' });
  assert.deepEqual(evaluateDiscount(win, 99, '2026-11-15'), { ok: false, reason: 'min', min: 100 });
  assert.deepEqual(evaluateDiscount(null, 99, '2026-11-15'), { ok: false, reason: 'invalid' });
  assert.match(moroccoToday(new Date('2026-11-03T23:30:00Z')), /^2026-11-0[34]$/);
});

test('discounts: البصمة لا تكشف الكود', async () => {
  const a = await hashCode('welcome10');
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, await hashCode(' WELCOME10 ')); // التوحيد قبل الحساب
  assert.notEqual(a, await hashCode('WELCOME11'));
});

test('pwa: manifest من إعدادات الموقع', () => {
  const m = buildManifest({ name: 'AWIMA Store', tagline: 'x', colors: { primary: '#0B2A6F' } });
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#0B2A6F');
  assert.equal(m.scope, '/');
  assert.equal(m.short_name, 'AWIMA Store'); // 11 حرفاً
  assert.equal(buildManifest({ name: 'اسم طويل جداً للمتجر', colors: { primary: '#000' } }).short_name, 'اسم');
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(readFileSync(`public${i.src}`).length > 1000, i.src); // الأيقونات موجودة فعلاً
});

// بيئة وهمية لتجربة public/sw.js دون متصفح
function loadSw({ online = true, cached = {} } = {}) {
  const handlers = {};
  const stores = new Map(); // اسم الكاش -> Map(url -> Response)
  const open = (n) => { if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
  for (const [n, entries] of Object.entries(cached)) for (const [u, body] of Object.entries(entries)) open(n).set('https://x.ma' + u, { body, ok: true, clone() { return this; } });
  const cacheApi = (n) => { const m = open(n); return { put: async (r, res) => m.set(r.url ?? r, res), match: async (r) => m.get(r.url ?? r), add: async (u) => m.set('https://x.ma' + u, { body: 'precached:' + u, ok: true, clone() { return this; } }), keys: async () => [...m.keys()].map((url) => ({ url })), delete: async (r) => m.delete(r.url ?? r) }; };
  const caches = {
    open: async (n) => cacheApi(n),
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
    match: async (r) => { const u = typeof r === 'string' ? 'https://x.ma' + r : r.url; for (const m of stores.values()) if (m.has(u)) return m.get(u); },
  };
  const calls = { skip: 0, claim: 0 };
  const self = { addEventListener: (t, h) => (handlers[t] = h), location: { origin: 'https://x.ma' }, skipWaiting: () => { calls.skip++; return Promise.resolve(); }, clients: { claim: () => { calls.claim++; return Promise.resolve(); } } };
  const fetchFn = async () => { if (!online) throw new Error('offline'); return { ok: true, body: 'network', clone() { return this; } }; };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch: fetchFn, URL, Promise, Response: { error: () => ({ error: true }) } });
  const run = async (type, extra = {}) => { let p; const event = { waitUntil: (x) => (p = x), respondWith: (x) => (p = x), ...extra }; const before = p; handlers[type](event); return { responded: p !== before, value: p ? await p : undefined }; };
  return { run, stores, calls };
}

test('sw: التثبيت يخزّن صفحة offline ويفعّل فوراً', async () => {
  const sw = loadSw();
  await sw.run('install');
  assert.ok(sw.stores.get('awima-pages-v1').has('https://x.ma/offline.html'));
  assert.equal(sw.calls.skip, 1);
});

test('sw: التفعيل يحذف الكاش القديم فقط', async () => {
  const sw = loadSw({ cached: { 'awima-pages-v0': { '/a': 'old' }, 'awima-pages-v1': { '/b': 'cur' }, 'other-app': { '/c': 'x' } } });
  await sw.run('activate');
  assert.deepEqual([...sw.stores.keys()].sort(), ['awima-pages-v1', 'other-app']);
  assert.equal(sw.calls.claim, 1);
});

test('sw: لا يعترض الإدارة ولا POST ولا المواقع الأخرى', async () => {
  const sw = loadSw();
  const req = (url, method = 'GET', mode = 'navigate') => ({ request: { url, method, mode } });
  assert.equal((await sw.run('fetch', req('https://x.ma/admin/'))).responded, false);
  assert.equal((await sw.run('fetch', req('https://x.ma/products', 'POST'))).responded, false);
  assert.equal((await sw.run('fetch', req('https://wa.me/212600000000'))).responded, false);
  assert.equal((await sw.run('fetch', req('https://x.ma/sw.js', 'GET', 'no-cors'))).responded, false);
  assert.equal((await sw.run('fetch', req('https://x.ma/api/x', 'GET', 'cors'))).responded, false); // ليس صفحة ولا ملفاً ثابتاً
});

test('sw: الصفحات — الشبكة أولاً ثم آخر نسخة ثم offline', async () => {
  const online = loadSw();
  const r = await online.run('fetch', { request: { url: 'https://x.ma/products', method: 'GET', mode: 'navigate' } });
  assert.equal(r.value.body, 'network');
  const off = loadSw({ online: false, cached: { 'awima-pages-v1': { '/products': 'last-seen', '/offline.html': 'offline-page' } } });
  assert.equal((await off.run('fetch', { request: { url: 'https://x.ma/products', method: 'GET', mode: 'navigate' } })).value.body, 'last-seen');
  assert.equal((await off.run('fetch', { request: { url: 'https://x.ma/never-visited', method: 'GET', mode: 'navigate' } })).value.body, 'offline-page');
});

test('sw: الملفات الثابتة من الكاش أولاً', async () => {
  const sw = loadSw({ online: false, cached: { 'awima-assets-v1': { '/images/a.jpg': 'img' } } });
  const r = await sw.run('fetch', { request: { url: 'https://x.ma/images/a.jpg', method: 'GET', mode: 'no-cors' } });
  assert.equal(r.value.body, 'img');
});

test('offers: التطبيع يتجاهل غير الصالح ويضبط القيم', () => {
  const raw = [
    { name: 'باقة', scope: 'category', category: 'cat-x', type: 'percent', value: 10, minQty: 3 },
    { name: 'معطّل', enabled: false, scope: 'all', type: 'percent', value: 5 },
    { name: 'بلا قسم', scope: 'category', type: 'percent', value: 5 },
    { name: 'نسبة كبيرة', scope: 'all', type: 'percent', value: 120 },
    { name: 'بلا منتجات', scope: 'products', products: [], type: 'fixed', value: 10 },
    { name: 'تواريخ معكوسة', scope: 'all', type: 'fixed', value: 10, startDate: '2026-12-02', endDate: '2026-12-01' },
    { name: 'كمية رديئة', scope: 'all', type: 'fixed', value: 10, minQty: 0 },
    { scope: 'all', type: 'fixed', value: 10 },
  ];
  const out = normalizeOffers(raw);
  assert.deepEqual(out.map((o) => o.name), ['باقة', 'كمية رديئة']);
  assert.equal(out[0].minQty, 3);
  assert.equal(out[1].minQty, 1);
  assert.equal(out[0].badge, true);
  assert.deepEqual(normalizeOffers(undefined), []);
});

test('offers: التواريخ والنطاق', () => {
  const o = normalizeOffers([{ name: 'a', scope: 'products', products: ['P-1'], type: 'fixed', value: 5, startDate: '2026-11-10', endDate: '2026-11-20' }])[0];
  assert.equal(offerActive(o, '2026-11-09'), false);
  assert.equal(offerActive(o, '2026-11-10'), true);
  assert.equal(offerActive(o, '2026-11-20'), true);
  assert.equal(offerActive(o, '2026-11-21'), false);
  assert.equal(offerCovers(o, { id: 'P-1', category: 'c' }), true);
  assert.equal(offerCovers(o, { id: 'P-2', category: 'c' }), false);
  // الشارة تُخفى بعد النهاية وتبقى قبل البداية (يخفيها المتصفح حتى تبدأ)
  assert.equal(badgeOffersFor([o], { id: 'P-1', category: 'c' }, '2026-11-01').length, 1);
  assert.equal(badgeOffersFor([o], { id: 'P-1', category: 'c' }, '2026-11-25').length, 0);
});

test('offers: خصم الباقة على مجموع كميات القسم', () => {
  const offers = normalizeOffers([{ name: 'باقة', scope: 'category', category: 'box', type: 'percent', value: 10, minQty: 3 }]);
  const lines = [
    { id: 'A', category: 'box', price: 100, qty: 2 },
    { id: 'B', category: 'box', price: 150, qty: 1 },
    { id: 'C', category: 'other', price: 1000, qty: 5 },
  ];
  const r = applyOffers(lines, offers, '2026-11-05');
  assert.equal(r.amount, 35); // 10% من 350 فقط، لا من منتج القسم الآخر
  assert.equal(r.applied.length, 1);
  assert.equal(r.nudges.length, 0);
  // قطعتان فقط: لا خصم وتنبيه بنقص قطعة
  const r2 = applyOffers(lines.slice(0, 1), offers, '2026-11-05');
  assert.equal(r2.amount, 0);
  assert.equal(r2.nudges[0].missing, 1);
  // لا تنبيه إن لم يوجد في السلة شيء من القسم
  assert.equal(applyOffers(lines.slice(2), offers, '2026-11-05').nudges.length, 0);
});

test('offers: الأول يغلب، والمبلغ الثابت لا يتجاوز المشمول، والمنتج بلا سعر يُتجاهل', () => {
  const offers = normalizeOffers([
    { name: 'خاص', scope: 'products', products: ['A'], type: 'percent', value: 50 },
    { name: 'عام', scope: 'all', type: 'percent', value: 10 },
    { name: 'ثابت', scope: 'products', products: ['Z'], type: 'fixed', value: 500 },
  ]);
  const lines = [
    { id: 'A', category: 'c', price: 100, qty: 1 },
    { id: 'B', category: 'c', price: 200, qty: 1 },
    { id: 'Z', category: 'c', price: 80, qty: 1 },
    { id: 'N', category: 'c', price: null, qty: 3 },
  ];
  const r = applyOffers(lines, offers, '2026-11-05');
  // A: 50 (الخاص). B وZ: عام 10% من 280 = 28 (العام أخذ B وZ قبل الثابت). N بلا سعر.
  assert.equal(r.applied.find((x) => x.offer.name === 'خاص').amount, 50);
  assert.equal(r.applied.find((x) => x.offer.name === 'عام').amount, 28);
  assert.equal(r.applied.some((x) => x.offer.name === 'ثابت'), false);
  assert.equal(r.amount, 78);
  // الثابت وحده يُقيَّد بسعر المشمول
  const only = normalizeOffers([{ name: 'ثابت', scope: 'products', products: ['Z'], type: 'fixed', value: 500 }]);
  assert.equal(applyOffers(lines, only, '2026-11-05').amount, 80);
  // عرض خارج تواريخه لا يُطبَّق
  const old = normalizeOffers([{ name: 'قديم', scope: 'all', type: 'percent', value: 10, endDate: '2026-11-01' }]);
  assert.equal(applyOffers(lines, old, '2026-11-05').amount, 0);
});

test('richtext: فقرات وقوائم نقطية', () => {
  const b = parseBlocks('فقرة أولى\nمتصلة\n\n- أ\n- ب\n\nفقرة');
  assert.deepEqual(b, [
    { type: 'p', text: 'فقرة أولى متصلة' },
    { type: 'ul', items: ['أ', 'ب'] },
    { type: 'p', text: 'فقرة' },
  ]);
  assert.deepEqual(parseBlocks(''), []);
  assert.deepEqual(parseBlocks(undefined), []);
});

test('warranty: معطّل افتراضياً، وتخصيص المنتج يغلب العام، و0 = بلا ضمان', () => {
  assert.equal(warrantyDaysFor(normalizeWarranty(undefined), 30), null);
  const on = normalizeWarranty({ enabled: true, days: 30 });
  assert.equal(warrantyDaysFor(on, null), 30);
  assert.equal(warrantyDaysFor(on, 365), 365);
  assert.equal(warrantyDaysFor(on, 0), null);
  assert.equal(warrantyDaysFor(normalizeWarranty({ enabled: true, days: 0 }), null), null);
  assert.equal(warrantyDaysFor(normalizeWarranty({ enabled: true, days: -5 }), null), null);
  assert.deepEqual(warrantyUnit(365), { n: 1, unit: 'year' });
  assert.deepEqual(warrantyUnit(60), { n: 2, unit: 'month' });
  assert.deepEqual(warrantyUnit(7), { n: 7, unit: 'day' });
});

test('compat: تنظيف الموديلات وإسقاط المكرر وغير الصالح', () => {
  const d = normalizeDevices([
    { brand: 'Apple', name: 'iPhone 11', port: 'lightning' },
    { brand: 'apple', name: 'iphone 11', port: 'lightning' },
    { brand: 'X', name: 'Y', port: 'firewire' },
    { brand: '', name: 'Z', port: 'usb-c' },
    { brand: 'Samsung', name: 'S24', port: 'usb-c', note: ' ملاحظة ' },
  ]);
  assert.equal(d.length, 2);
  assert.equal(d[1].note, 'ملاحظة');
  assert.deepEqual(brandsOf(d), ['Apple', 'Samsung']);
  assert.deepEqual(normalizePorts(['usb-c', 'usb-c', 'zz']), ['usb-c']);
  assert.deepEqual(normalizeDevices(null), []);
  const ps = [{ id: 1, ports: ['usb-c'] }, { id: 2, ports: ['lightning'] }, { id: 3 }];
  assert.deepEqual(productsForPort(ps, 'usb-c').map((p) => p.id), [1]);
});

test('community: الإعدادات الافتراضية والتنظيف', () => {
  const d = normalizeCommunity(undefined);
  assert.equal(d.likesEnabled, true);
  assert.deepEqual(d.thresholds, DEFAULT_THRESHOLDS);
  assert.equal(d.crown.minAvg, 4.5);
  const c = normalizeCommunity({ likesEnabled: false, thresholds: { minPoints: 2, greenDarkAvg: 9 }, turnstileSiteKey: 'bad key!' });
  assert.equal(c.likesEnabled, false);
  assert.equal(c.thresholds.minPoints, 2);
  assert.equal(c.thresholds.greenDarkAvg, DEFAULT_THRESHOLDS.greenDarkAvg); // 9 خارج المدى
  assert.equal(c.turnstileSiteKey, '');
});

test('community: التاج يدوي أو تلقائي بحسب العتبات، ويُعطَّل بالمفتاح', () => {
  const cr = { enabled: true, minAvg: 4.5, minPoints: 10 };
  assert.equal(isTrusted({ average: 4.8, points: 10 }, false, cr), true);
  assert.equal(isTrusted({ average: 4.8, points: 9 }, false, cr), false);
  assert.equal(isTrusted({ average: 3, points: 0 }, true, cr), true); // يدوي
  assert.equal(isTrusted({ average: 4.8, points: 50 }, true, { ...cr, enabled: false }), false);
});

test('community: دمج مجاميع البناء مع تقييمات الزوار', () => {
  // موثَّق واحد (5★ ×5 نقاط) + 5 زوار جدد بـ4★ → 10 نقاط، مجموع 25+20
  const s = summaryFrom(6, 10, 45);
  assert.equal(s.average, 4.5);
  assert.equal(s.tier, 'green-dark');
  assert.equal(summaryFrom(0, 0, 0).tier, 'none');
  assert.equal(summaryFrom(1, 1, 5, { ...DEFAULT_THRESHOLDS, minPoints: 1 }).tier, 'green-light'); // عتبة مخفَّضة من الإعدادات
});

test('community: النجوم الجزئية والتحقق من التقييم', () => {
  assert.match(starsHtml(4.3), /--fill:86%/);
  assert.match(starsHtml(9), /--fill:100%/);
  assert.match(starsHtml(-1), /--fill:0%/);
  const ok = checkReview({ product: 'P-0001', rating: 4, device: 'abcdefgh12', comment: ' جيد   جداً ', author: '<b>س</b>' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.comment, 'جيد جداً');
  assert.ok(!ok.value.author.includes('<'));
  assert.equal(checkReview({ product: 'P-0001', rating: 6, device: 'abcdefgh12' }).ok, false);
  assert.equal(checkReview({ product: 'P-0001', rating: 5, device: 'x' }).ok, false);
  assert.equal(checkReview({ product: 'P-0001', rating: 5, device: 'abcdefgh12', website: 'x' }).error, 'spam');
  assert.equal(checkReview({ product: 'P-0001', rating: 5, device: 'abcdefgh12', comment: 'www.spam.com' }).error, 'links_not_allowed');
  assert.equal(checkReview({ product: 'P-0001', rating: 5, device: 'abcdefgh12', comment: 'x'.repeat(900) }).value.comment.length, 500);
});

test('search: كلمات البحث الإضافية والدارجة تجد المنتج', () => {
  const hay = normalize(['زجاج حماية للشاشة', 'إكسسوارات الهواتف واقيات الشاشة', 'كوك واقي سكرين بروتكتور verre trempé protège écran'].join(' '));
  assert.equal(matches('كوك', hay), true);
  assert.equal(matches('verre trempe', hay), true);
  assert.equal(matches('protege ecran', hay), true);
  assert.equal(matches('اكسسوارات هواتف', hay), true);
  assert.equal(matches('حامل سيارة', hay), false);
});
