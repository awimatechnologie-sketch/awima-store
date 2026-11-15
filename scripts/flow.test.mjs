// اختبار AWIMA FLOW: منطق التوجيه (وحدات) + واجهة /api/orders فوق SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { normalizePhone, parseOrder, departmentFor, itemState, assign } from '../src/lib/flow.ts';
import { postOrder, adminOrders, adminOrderStatus } from '../server/handlers.js';
import REAL from '../server/flow-catalog.generated.js';

const cat = {
  products: {
    A: { name: 'شاحن', category: 'cat-chargers', price: 50, availability: 'in_stock', stock: 3 },
    B: { name: 'سماعة', category: 'cat-audio', price: 80, availability: 'in_stock', stock: null },
    C: { name: 'كابل', category: 'cat-cables', price: 20, availability: 'in_stock', stock: 10 },
    D: { name: 'علبة', category: 'cat-box', price: 100, availability: 'in_stock', stock: null },
    E: { name: 'نافد', category: 'cat-chargers', price: 10, availability: 'out_of_stock', stock: null },
    F: { name: 'حسب الطلب', category: 'cat-chargers', price: null, availability: 'on_request', stock: null },
    G: { name: 'فرعي', category: 'cat-sub', price: 5, availability: 'in_stock', stock: null },
  },
  categories: { 'cat-chargers': { name: 'ش', parent: null }, 'cat-cables': { name: 'ك', parent: null }, 'cat-audio': { name: 'ص', parent: null }, 'cat-box': { name: 'ب', parent: null }, 'cat-sub': { name: 'ف', parent: 'cat-audio' } },
  departments: [
    { id: 'charging', name: 'الشحن', phone: '212771280551', active: true, categories: ['cat-chargers', 'cat-cables'] },
    { id: 'audio', name: 'الصوت', phone: '212782395722', active: true, categories: ['cat-audio'] },
  ],
  coordinator: { name: 'منسق', phone: '212652305405' },
  botPhone: '212652091799',
  cities: [{ name: 'أكادير', name_fr: 'Agadir', open: true }, { name: 'فاس', name_fr: null, open: false }],
};
const REF = 'AW-20261114-ABCD';
const body = (o = {}) => ({ ref: REF, name: 'سعيد', city: 'أكادير', items: [{ id: 'A', qty: 1 }], ...o });

test('normalizePhone: صيغ الأرقام المغربية', () => {
  assert.equal(normalizePhone('0652091799'), '212652091799');
  assert.equal(normalizePhone('+212 652-091799'), '212652091799');
  assert.equal(normalizePhone('00212652091799'), '212652091799');
  assert.equal(normalizePhone('0852091799'), null);
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone(5), null);
});

test('parseOrder: الاسم والموقع والطلب إلزامية، والمدينة المغلقة مرفوضة', () => {
  assert.equal(parseOrder(body(), cat).ok, true);
  assert.deepEqual(parseOrder(body({ name: ' ' }), cat).missing, ['name']);
  assert.deepEqual(parseOrder(body({ city: 'فاس' }), cat).missing, ['city']);
  assert.deepEqual(parseOrder(body({ items: [] }), cat).missing, ['items']);
  assert.deepEqual(parseOrder(body({ items: [{ id: 'ZZ', qty: 1 }] }), cat).missing, ['items']);
  assert.deepEqual(parseOrder(body({ phone: '12' }), cat).missing, ['phone']);
  const all = parseOrder({ ref: REF }, cat);
  assert.deepEqual(all.missing, ['name', 'city', 'items']);
  assert.equal(parseOrder(body({ city: 'Agadir' }), cat).order.city, 'أكادير');
  const merged = parseOrder(body({ items: [{ id: 'A', qty: 1 }, { id: 'A', qty: 2 }, { id: 'B', qty: 500 }] }), cat).order.items;
  assert.deepEqual(merged, [{ id: 'A', qty: 3 }, { id: 'B', qty: 99 }]);
});

test('departmentFor: يصعد لقسم الأب ويتجاهل الأقسام الإدارية غير النشطة', () => {
  assert.equal(departmentFor('cat-sub', cat).id, 'audio');
  assert.equal(departmentFor('cat-box', cat), null);
  const off = { ...cat, departments: cat.departments.map((d) => ({ ...d, active: false })) };
  assert.equal(departmentFor('cat-audio', off), null);
});

test('itemState: «متوفر» = الكمية المطلوبة فقط', () => {
  assert.equal(itemState(cat.products.A, 3), 'available');
  assert.equal(itemState(cat.products.A, 4), 'waiting');
  assert.equal(itemState(cat.products.B, 50), 'available');
  assert.equal(itemState(cat.products.E, 1), 'waiting');
  assert.equal(itemState(cat.products.F, 1), 'waiting');
});

test('assign: متوفر وقسم واحد → مسؤول القسم', () => {
  const a = assign({ items: [{ id: 'A', qty: 2 }, { id: 'C', qty: 1 }] }, cat);
  assert.equal(a.handler.kind, 'department');
  assert.equal(a.handler.phone, '212771280551');
  assert.equal(a.status, 'ASSIGNED');
  assert.equal(a.availability, 'available');
});
test('assign: غير متوفر → المنسق + انتظار', () => {
  const a = assign({ items: [{ id: 'A', qty: 9 }] }, cat);
  assert.equal(a.handler.kind, 'coordinator');
  assert.equal(a.handler.phone, '212652305405');
  assert.equal(a.status, 'WAITING_STOCK');
  assert.equal(a.reason, 'unavailable');
});
test('assign: متعدد الأقسام → المنسق لكن الحالة «متوفر»', () => {
  const a = assign({ items: [{ id: 'A', qty: 1 }, { id: 'B', qty: 1 }] }, cat);
  assert.equal(a.handler.kind, 'coordinator');
  assert.equal(a.reason, 'multi_department');
  assert.equal(a.availability, 'available');
  assert.equal(a.status, 'ASSIGNED');
});
test('assign: قسم بلا مسؤول إداري → المنسق', () => {
  const a = assign({ items: [{ id: 'D', qty: 1 }] }, cat);
  assert.equal(a.reason, 'no_department');
  assert.equal(a.handler.phone, '212652305405');
});

// ---------- API ----------
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const o = {
        bind(...a) { args = a; return o; },
        async run() { stmt.run(...args); return { success: true }; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
      };
      return o;
    },
  };
}
const ADMIN = { Authorization: 'Bearer secret-token-123456' };
const post = (url, b, h = {}) => new Request('https://x.test' + url, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
const mkEnv = () => ({ DB: fakeD1(), ADMIN_TOKEN: 'secret-token-123456', HASH_SALT: 's' });
const refN = (n) => `AW-20261114-${'ABCDEFGH'[n]}${'ABCDEFGH'[n]}${'ABCDEFGH'[n]}${'ABCDEFGH'[n]}`;

test('API: منتج متوفر من قسم التخزين → مسؤول التخزين، ويُحفظ الطلب', async () => {
  const env = mkEnv();
  const r = await postOrder(post('/api/orders', { ref: refN(0), name: 'سعيد', city: 'أكادير', phone: '0600000000', items: [{ id: 'P-0001', qty: 2 }] }), env);
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.availability, 'available');
  assert.equal(j.handler.kind, 'department');
  assert.equal(j.handler.phone, REAL.departments.find((d) => d.id === 'storage').phone);
  const list = await (await adminOrders(new Request('https://x.test/api/admin/orders', { headers: ADMIN }), env)).json();
  assert.equal(list.orders.length, 1);
  assert.equal(list.orders[0].phone, '212600000000');
  assert.equal(list.orders[0].subtotal, 110);
  assert.equal(list.orders[0].items[0].qty, 2);
  assert.equal(list.orders[0].ip, undefined);
});

test('API: منتج «عند الطلب» → المنسق وحالة انتظار', async () => {
  const env = mkEnv();
  const j = await (await postOrder(post('/api/orders', { ref: refN(1), name: 'سعيد', city: 'أكادير', items: [{ id: 'P-0005', qty: 1 }] }), env)).json();
  assert.equal(j.availability, 'waiting');
  assert.equal(j.status, 'WAITING_STOCK');
  assert.equal(j.handler.kind, 'coordinator');
  assert.equal(j.handler.phone, '212652305405');
});

test('API: بيانات ناقصة → 400 مع الحقول الناقصة، وتكرار الرمز لا يُنشئ طلباً ثانياً', async () => {
  const env = mkEnv();
  const bad = await postOrder(post('/api/orders', { ref: refN(2), name: '', city: '', items: [] }), env);
  assert.equal(bad.status, 400);
  assert.deepEqual((await bad.json()).missing, ['name', 'city', 'items']);
  const b = { ref: refN(3), name: 'سعيد', city: 'أكادير', items: [{ id: 'P-0001', qty: 1 }] };
  assert.equal((await postOrder(post('/api/orders', b), env)).status, 201);
  const again = await postOrder(post('/api/orders', b), env);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  const list = await (await adminOrders(new Request('https://x.test/api/admin/orders', { headers: ADMIN }), env)).json();
  assert.equal(list.orders.length, 1);
});

test('API: حد الطلبات في الساعة لكل IP', async () => {
  const env = mkEnv();
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const r = await postOrder(post('/api/orders', { ref: refN(i), name: 'سعيد', city: 'أكادير', items: [{ id: 'P-0001', qty: 1 }] }), env);
    codes.push(r.status);
  }
  assert.ok(codes.every((c) => c === 201));
  const r = await postOrder(post('/api/orders', { ref: 'AW-20261114-ZZZZ', name: 'سعيد', city: 'أكادير', items: [{ id: 'P-0001', qty: 1 }] }), env);
  assert.equal(r.status, 429);
});

test('API الإدارة: بلا توكن 401، وتغيير الحالة يُسجَّل', async () => {
  const env = mkEnv();
  await postOrder(post('/api/orders', { ref: refN(4), name: 'سعيد', city: 'أكادير', items: [{ id: 'P-0001', qty: 1 }] }), env);
  assert.equal((await adminOrders(new Request('https://x.test/api/admin/orders'), env)).status, 401);
  assert.equal((await adminOrderStatus(post('/api/admin/orders', { ref: refN(4), status: 'CONFIRMED' }), env)).status, 401);
  assert.equal((await adminOrderStatus(post('/api/admin/orders', { ref: refN(4), status: 'NOPE' }, ADMIN), env)).status, 400);
  assert.equal((await adminOrderStatus(post('/api/admin/orders', { ref: 'AW-20261114-QQQQ', status: 'CONFIRMED' }, ADMIN), env)).status, 404);
  assert.equal((await adminOrderStatus(post('/api/admin/orders', { ref: refN(4), status: 'CONFIRMED' }, ADMIN), env)).status, 200);
  const list = await (await adminOrders(new Request('https://x.test/api/admin/orders?status=CONFIRMED', { headers: ADMIN }), env)).json();
  assert.equal(list.orders.length, 1);
});
