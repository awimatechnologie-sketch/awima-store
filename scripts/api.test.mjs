// اختبار واجهات /api فوق SQLite حقيقي (D1 مبنية على SQLite، فالاستعلامات نفسها).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getCommunity, postLike, getReviews, postReview, adminList, adminAct, adminLink } from '../server/handlers.js';
import { makeToken, verifyToken } from '../src/lib/reviewtoken.ts';

function fakeD1({ withSchema = true } = {}) {
  const db = new DatabaseSync(':memory:');
  if (withSchema) db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
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

test('قاعدة فارغة بلا جداول: تُنشأ تلقائياً ولا يحدث انهيار (خطأ 1101)', async () => {
  const env = { DB: fakeD1({ withSchema: false }), ADMIN_TOKEN: 'secret-token-123456' };
  const r = await getCommunity(req('/api/community'), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { likes: {}, reviews: {} });
  const like = await postLike(req('/api/like', { product: 'P-0001', device: DEV(1) }), env);
  assert.equal((await like.json()).count, 1);
});

test('خطأ غير متوقع في القاعدة يعطي 500 JSON وليس استثناءً', async () => {
  const env = { DB: { prepare() { throw new Error('boom'); } } };
  const r = await getCommunity(req('/api/community'), env);
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: 'server_error' });
});

test('رمز التقييم الموثّق: توقيع، انتهاء، تلاعب', async () => {
  const sec = 'a-long-secret-key-123';
  const t = await makeToken(sec, 'P-0001', 30, 1000);
  assert.deepEqual(await verifyToken(sec, t, 2000), { ok: true, product: 'P-0001', nonce: t.split('.')[1] });
  assert.equal((await verifyToken(sec, t, 1000 + 31 * 86400_000)).error, 'expired_token');
  assert.equal((await verifyToken('other-secret-key-999', t, 2000)).error, 'bad_token');
  const forged = t.replace('P-0001', 'P-0002');
  assert.equal((await verifyToken(sec, forged, 2000)).error, 'bad_token');
  assert.equal((await verifyToken(sec, 'x.y', 2000)).error, 'bad_token');
  assert.equal((await verifyToken(sec, undefined, 2000)).error, 'bad_token');
});

test('التقييم الموثّق: يصدر المدير الرابط، يُستعمل مرة، يُنشر موثّقاً بوزن 5', async () => {
  const env = mkEnv();
  assert.equal((await adminLink(req('/api/admin/review-link', { product: 'P-0003' }), env)).status, 401);
  const { token } = await (await adminLink(req('/api/admin/review-link', { product: 'P-0003', days: 7 }, ADMIN), env)).json();
  const send = (n, extra = {}) => postReview(req('/api/reviews', { product: 'P-0003', rating: 5, comment: 'ممتاز', device: DEV(n), token, ...extra }), env);
  // منتج مختلف عن الرمز مرفوض
  assert.equal((await postReview(req('/api/reviews', { product: 'P-0004', rating: 5, device: DEV(9), token }), env)).status, 400);
  const ok = await send(1);
  assert.equal(ok.status, 201);
  assert.deepEqual(await ok.json(), { ok: true, status: 'approved', verified: true });
  assert.deepEqual((await (await getCommunity(req('/api/community'), env)).json()).reviews['P-0003'], { count: 1, sum: 25, points: 5 });
  assert.equal((await send(2)).status, 409); // الرمز استُعمل
  assert.equal((await send(3, { token: 'bad.token.here.zzz' })).status, 400);
  const list = (await (await getReviews(req('/api/reviews?product=P-0003'), env)).json()).reviews;
  assert.equal(list[0].buyer, 'verified');
});

test('التقييم الموثّق يرقّي تقييم الزائر السابق من الجهاز نفسه، ويحترم VERIFIED_AUTO_APPROVE=false', async () => {
  const env = { ...mkEnv(), VERIFIED_AUTO_APPROVE: 'false' };
  await postReview(req('/api/reviews', { product: 'P-0005', rating: 3, device: DEV(1) }), env);
  const { token } = await (await adminLink(req('/api/admin/review-link', { product: 'P-0005' }, ADMIN), env)).json();
  const r = await postReview(req('/api/reviews', { product: 'P-0005', rating: 5, device: DEV(1), token }), env);
  assert.deepEqual(await r.json(), { ok: true, status: 'pending', verified: true });
  const pending = (await (await adminList(req('/api/admin/reviews?status=pending', undefined, ADMIN), env)).json()).reviews;
  assert.equal(pending.length, 1); // صف واحد مُرقّى لا اثنان
  assert.equal(pending[0].buyer, 'verified');
  assert.equal(pending[0].rating, 5);
});
