// منطق واجهات /api (يُختبر محلياً فوق SQLite، ويعمل في Cloudflare فوق D1).
// كل دالة تأخذ (request, env) وتُرجع Response. env.DB = قاعدة D1.
import { SCHEMA } from './schema.js';
import { makeToken, verifyToken } from '../src/lib/reviewtoken.ts';
import { checkReview, isProductId, isDeviceId, REVIEW_WEIGHT_SQL, LIMITS } from '../src/lib/community.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });

const NO_STORE = { 'Cache-Control': 'no-store' };
const hasDb = (env) => env && env.DB && typeof env.DB.prepare === 'function';
const unavailable = () => json({ error: 'unavailable' }, 503, NO_STORE);

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// IP مجزّأ بملح سري: لا نخزّن العنوان نفسه
const ipHash = async (request, env) =>
  (await sha256(`${request.headers.get('CF-Connecting-IP') || 'local'}|${env.HASH_SALT || ''}`)).slice(0, 32);
const deviceHash = async (device, env) => (await sha256(`${device}|${env.HASH_SALT || ''}`)).slice(0, 40);

async function readBody(request) {
  try {
    const text = await request.text();
    if (text.length > 4000) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function verifyTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET) return true; // غير مفعّل
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return Boolean((await r.json()).success);
  } catch {
    return false;
  }
}

/** GET /api/community → عدّادات الإعجاب + مجاميع التقييمات المعتمدة لكل منتج */
async function getCommunity_(request, env) {
  if (!hasDb(env)) return unavailable();
  const likes = {};
  for (const r of (await env.DB.prepare('SELECT product, COUNT(*) AS n FROM likes GROUP BY product').all()).results ?? []) likes[r.product] = r.n;
  const reviews = {};
  const rows = await env.DB.prepare(
    `SELECT product, COUNT(*) AS count, SUM(rating * (${REVIEW_WEIGHT_SQL})) AS sum, SUM(${REVIEW_WEIGHT_SQL}) AS points
     FROM reviews WHERE status = 'approved' GROUP BY product`
  ).all();
  for (const r of rows.results ?? []) reviews[r.product] = { count: r.count, sum: r.sum, points: r.points };
  return json({ likes, reviews }, 200, { 'Cache-Control': 'public, max-age=30' });
}

/** POST /api/like {product, device, on} */
async function postLike_(request, env) {
  if (!hasDb(env)) return unavailable();
  const b = await readBody(request);
  if (!b || !isProductId(b.product) || !isDeviceId(b.device)) return json({ error: 'bad_request' }, 400, NO_STORE);
  const dev = await deviceHash(b.device, env);
  if (b.on === false) {
    await env.DB.prepare('DELETE FROM likes WHERE product = ? AND device = ?').bind(b.product, dev).run();
  } else {
    const ip = await ipHash(request, env);
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM likes WHERE ip = ? AND ts > ?').bind(ip, Date.now() - 3600_000).first();
    if ((recent?.n ?? 0) >= LIMITS.likesPerHour) return json({ error: 'rate_limited' }, 429, NO_STORE);
    await env.DB.prepare('INSERT OR IGNORE INTO likes (product, device, ip, ts) VALUES (?, ?, ?, ?)').bind(b.product, dev, ip, Date.now()).run();
  }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM likes WHERE product = ?').bind(b.product).first();
  return json({ count: n?.n ?? 0 }, 200, NO_STORE);
}

/** GET /api/reviews?product=ID → التقييمات المعتمدة (الأحدث أولاً) */
async function getReviews_(request, env) {
  if (!hasDb(env)) return unavailable();
  const product = new URL(request.url).searchParams.get('product');
  if (!isProductId(product)) return json({ error: 'bad_request' }, 400, NO_STORE);
  const rows = await env.DB.prepare(
    "SELECT rating, author, comment, buyer, ts FROM reviews WHERE product = ? AND status = 'approved' ORDER BY ts DESC LIMIT 50"
  ).bind(product).all();
  return json({ reviews: rows.results ?? [] }, 200, { 'Cache-Control': 'public, max-age=30' });
}

/** POST /api/reviews → تقييم جديد بحالة «قيد المراجعة» */
async function postReview_(request, env) {
  if (!hasDb(env)) return unavailable();
  const b = await readBody(request);
  const checked = checkReview(b);
  if (!checked.ok) return json({ error: checked.error }, 400, NO_STORE);
  const v = checked.value;
  const dev = await deviceHash(v.device, env);
  const ip = await ipHash(request, env);
  const secret = env.REVIEW_SECRET || env.ADMIN_TOKEN || '';

  // رابط موثّق: رمز صحيح لهذا المنتج ولم يُستعمل → تقييم «مشترٍ موثّق» (ينشر مباشرة ما لم يكن VERIFIED_AUTO_APPROVE=false)
  if (b.token) {
    const tk = await verifyToken(secret, b.token);
    if (!tk.ok) return json({ error: tk.error }, 400, NO_STORE);
    if (tk.product !== v.product) return json({ error: 'bad_token' }, 400, NO_STORE);
    const used = await env.DB.prepare('SELECT nonce FROM review_tokens WHERE nonce = ?').bind(tk.nonce).first();
    if (used) return json({ error: 'token_used' }, 409, NO_STORE);
    const status = String(env.VERIFIED_AUTO_APPROVE) === 'false' ? 'pending' : 'approved';
    await env.DB.prepare('INSERT INTO review_tokens (nonce, product, ts) VALUES (?, ?, ?)').bind(tk.nonce, v.product, Date.now()).run();
    const dup = await env.DB.prepare('SELECT id FROM reviews WHERE product = ? AND device = ?').bind(v.product, dev).first();
    if (dup) {
      // سبق أن قيّم من الجهاز نفسه كزائر: نرقّي تقييمه إلى موثّق ونحدّث محتواه
      await env.DB.prepare("UPDATE reviews SET rating = ?, author = ?, comment = ?, buyer = 'verified', status = ?, ts = ? WHERE id = ?")
        .bind(v.rating, v.author || null, v.comment || null, status, Date.now(), dup.id).run();
    } else {
      await env.DB.prepare("INSERT INTO reviews (product, rating, author, comment, buyer, status, device, ip, ts) VALUES (?, ?, ?, ?, 'verified', ?, ?, ?, ?)")
        .bind(v.product, v.rating, v.author || null, v.comment || null, status, dev, ip, Date.now()).run();
    }
    return json({ ok: true, status, verified: true }, 201, NO_STORE);
  }

  if (!(await verifyTurnstile(b.turnstile, request, env))) return json({ error: 'captcha' }, 400, NO_STORE);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM reviews WHERE ip = ? AND ts > ?').bind(ip, Date.now() - 86400_000).first();
  if ((recent?.n ?? 0) >= LIMITS.reviewsPerDay) return json({ error: 'rate_limited' }, 429, NO_STORE);
  const dup = await env.DB.prepare('SELECT id FROM reviews WHERE product = ? AND device = ?').bind(v.product, dev).first();
  if (dup) return json({ error: 'already_reviewed' }, 409, NO_STORE);
  await env.DB.prepare(
    "INSERT INTO reviews (product, rating, author, comment, buyer, status, device, ip, ts) VALUES (?, ?, ?, ?, 'new', 'pending', ?, ?, ?)"
  ).bind(v.product, v.rating, v.author || null, v.comment || null, dev, ip, Date.now()).run();
  return json({ ok: true, status: 'pending' }, 201, NO_STORE);
}

// ---------- الإدارة (توكن سري في متغير ADMIN_TOKEN) ----------
function isAdmin(request, env) {
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const want = env.ADMIN_TOKEN || '';
  if (want.length < 12 || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

/** GET /api/admin/reviews?status=pending|approved|rejected */
async function adminList_(request, env) {
  if (!hasDb(env)) return unavailable();
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401, NO_STORE);
  const status = new URL(request.url).searchParams.get('status');
  const st = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
  const rows = await env.DB.prepare(
    'SELECT id, product, rating, author, comment, buyer, status, ts FROM reviews WHERE status = ? ORDER BY ts DESC LIMIT 200'
  ).bind(st).all();
  return json({ reviews: rows.results ?? [] }, 200, NO_STORE);
}

/** POST /api/admin/reviews {id, action: approve|reject|delete|verify|unverify} */
async function adminAct_(request, env) {
  if (!hasDb(env)) return unavailable();
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401, NO_STORE);
  const b = await readBody(request);
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: 'bad_request' }, 400, NO_STORE);
  const sql = {
    approve: "UPDATE reviews SET status = 'approved' WHERE id = ?",
    reject: "UPDATE reviews SET status = 'rejected' WHERE id = ?",
    verify: "UPDATE reviews SET buyer = 'verified' WHERE id = ?",
    unverify: "UPDATE reviews SET buyer = 'new' WHERE id = ?",
    delete: 'DELETE FROM reviews WHERE id = ?',
  }[b?.action];
  if (!sql) return json({ error: 'bad_action' }, 400, NO_STORE);
  await env.DB.prepare(sql).bind(id).run();
  return json({ ok: true }, 200, NO_STORE);
}

/** POST /api/admin/review-link {product, days?} → رمز رابط تقييم موثّق */
async function adminLink_(request, env) {
  if (!hasDb(env)) return unavailable();
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401, NO_STORE);
  const b = await readBody(request);
  if (!isProductId(b?.product)) return json({ error: 'bad_request' }, 400, NO_STORE);
  const secret = env.REVIEW_SECRET || env.ADMIN_TOKEN || '';
  if (secret.length < 12) return json({ error: 'no_secret' }, 503, NO_STORE);
  return json({ token: await makeToken(secret, b.product, Number(b.days) || undefined) }, 200, NO_STORE);
}

// ---------- الغلاف: ينشئ الجداول عند الحاجة ولا يترك أي استثناء يصل للزائر (خطأ 1101) ----------
const ready = new WeakMap(); // لكل قاعدة مرة واحدة في عمر الـisolate
function ensureSchema(env) {
  let p = ready.get(env.DB);
  if (!p) {
    p = (async () => { for (const sql of SCHEMA) await env.DB.prepare(sql).run(); })();
    p.catch(() => ready.delete(env.DB));
    ready.set(env.DB, p);
  }
  return p;
}
const guard = (fn) => async (request, env) => {
  if (!hasDb(env)) return unavailable();
  try {
    await ensureSchema(env);
    return await fn(request, env);
  } catch (e) {
    console.error('api error', e && e.message);
    return json({ error: 'server_error' }, 500, NO_STORE);
  }
};
export const getCommunity = guard(getCommunity_);
export const postLike = guard(postLike_);
export const getReviews = guard(getReviews_);
export const postReview = guard(postReview_);
export const adminList = guard(adminList_);
export const adminAct = guard(adminAct_);
export const adminLink = guard(adminLink_);
