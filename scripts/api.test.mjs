// اختبار واجهات /api فوق SQLite حقيقي (D1 مبنية على SQLite، فالاستعلامات نفسها).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getCommunity, postLike, getReviews, postReview, adminList, adminAct } from '../server/handlers.js';

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
const req = (url, body, headers = {}) =>
  new Request('https://x.test' + url, body === undefined ? { headers } : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const DEV = (n) => `device-${String(n).padStart(8, '0')}`;
const ADMIN = { Authorization: 'Bearer secret-token-123456' };
const mkEnv = () => ({ DB: fakeD1(), ADMIN_TOKEN: 'secret-token-123456', HASH_SALT: 's' });

test('بلا قاعدة: 503 وليس انهياراً', async () => {
  const r = await getCommunity(req('/api/community'), {});
  assert.equal(r.status, 503);
});

test('الإعجاب: مرة واحدة لكل جهاز، وإلغاؤه ينقص العدّاد', async () => {
  const env = mkEnv();
  const like = (n, on = true) => postLike(req('/api/like', { product: 'P-0001', device: DEV(n), on }), env).then((r) => r.json());
  assert.equal((await like(1)).count, 1);
  assert.equal((await like(1)).count, 1); // تكرار من الجهاز نفسه لا يزيد
  assert.equal((await like(2)).count, 2);
  assert.equal((await like(1, false)).count, 1);
  const c = await (await getCommunity(req('/api/community'), env)).json();
  assert.equal(c.likes['P-0001'], 1);
  const bad = await postLike(req('/api/like', { product: '../x', device: DEV(1) }), env);
  assert.equal(bad.status, 400);
});

test('التقييم: يبقى قيد المراجعة حتى يعتمده المدير ثم يدخل المجاميع بوزنه', async () => {
  const env = mkEnv();
  const send = (n, rating, extra = {}) => postReview(req('/api/reviews', { product: 'P-0002', rating, author: 'سعيد', comment: 'جيد', device: DEV(n), ...extra }), env);
  assert.equal((await send(1, 5)).status, 201);
  assert.equal((await send(1, 4)).status, 409); // نفس الجهاز
  assert.equal((await send(2, 9)).status, 400); // تقييم غير صالح
  assert.equal((await send(3, 5, { comment: 'زوروا http://spam.com' })).status, 400);
  assert.equal((await send(4, 5, { website: 'bot' })).status, 400); // الفخ
  // قبل الاعتماد لا يظهر شيء
  assert.deepEqual((await (await getReviews(req('/api/reviews?product=P-0002'), env)).json()).reviews, []);
  assert.deepEqual((await (await getCommunity(req('/api/community'), env)).json()).reviews, {});
  // الإدارة تتطلب التوكن
  assert.equal((await adminList(req('/api/admin/reviews'), env)).status, 401);
  assert.equal((await adminList(req('/api/admin/reviews', undefined, { Authorization: 'Bearer wrong-token-000000' }), env)).status, 401);
  const pending = (await (await adminList(req('/api/admin/reviews?status=pending', undefined, ADMIN), env)).json()).reviews;
  assert.equal(pending.length, 1);
  assert.equal((await adminAct(req('/api/admin/reviews', { id: pending[0].id, action: 'approve' }, ADMIN), env)).status, 200);
  let c = await (await getCommunity(req('/api/community'), env)).json();
  assert.deepEqual(c.reviews['P-0002'], { count: 1, sum: 5, points: 1 });
  // التوثيق يرفع الوزن إلى 5
  await adminAct(req('/api/admin/reviews', { id: pending[0].id, action: 'verify' }, ADMIN), env);
  c = await (await getCommunity(req('/api/community'), env)).json();
  assert.deepEqual(c.reviews['P-0002'], { count: 1, sum: 25, points: 5 });
  const list = (await (await getReviews(req('/api/reviews?product=P-0002'), env)).json()).reviews;
  assert.equal(list.length, 1);
  assert.equal(list[0].buyer, 'verified');
  assert.equal('device' in list[0], false); // لا تُكشف بيانات الجهاز
  assert.equal('ip' in list[0], false);
  await adminAct(req('/api/admin/reviews', { id: pending[0].id, action: 'reject' }, ADMIN), env);
  assert.deepEqual((await (await getCommunity(req('/api/community'), env)).json()).reviews, {});
});

test('حدود الإساءة: 5 تقييمات يومياً لكل IP', async () => {
  const env = mkEnv();
  const codes = [];
  for (let i = 1; i <= 7; i++) codes.push((await postReview(req('/api/reviews', { product: `P-000${i}`, rating: 5, device: DEV(i) }), env)).status);
  assert.deepEqual(codes, [201, 201, 201, 201, 201, 429, 429]);
});

test('الإدارة بلا ADMIN_TOKEN مضبوط ترفض كل شيء', async () => {
  const env = { DB: fakeD1() };
  assert.equal((await adminList(req('/api/admin/reviews', undefined, { Authorization: 'Bearer ' }), env)).status, 401);
});
