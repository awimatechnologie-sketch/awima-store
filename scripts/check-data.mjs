// فحص بيانات المتجر قبل البناء — بلا أي مكتبة خارجية.
// يشغَّل تلقائياً قبل `npm run build`، ويدوياً عبر `npm run check`.
// الأخطاء (✖) توقف البناء، والتحذيرات (⚠) لا توقفه.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = process.argv[2] ?? '.';
const DATA = join(ROOT, 'src/data');
const PUBLIC = join(ROOT, 'public');

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    err(label, `ملف JSON غير صالح (${e.message})`);
    return null;
  }
}

function listJson(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    err(dir, 'المجلد غير موجود');
    return [];
  }
}

const publicFileExists = (p) =>
  typeof p === 'string' && p.startsWith('/') && existsSync(join(PUBLIC, p.replace(/^\//, '')));

const AVAILABILITY = ['in_stock', 'out_of_stock', 'on_request'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TIME = /^([01]?\d|2[0-4]):[0-5]\d$/;

// ---------- الأقسام ----------
const catIds = new Set();
const catSlugs = new Set();
for (const f of listJson(join(DATA, 'categories'))) {
  const label = `categories/${f}`;
  const c = readJson(join(DATA, 'categories', f), label);
  if (!c) continue;
  for (const k of ['id', 'name', 'slug'])
    if (!c[k] || typeof c[k] !== 'string') err(label, `الحقل "${k}" مفقود`);
  if (c.id && !/^cat-[a-z0-9-]+$/.test(c.id)) warn(label, `المعرّف "${c.id}" لا يطابق الصيغة cat-xxx`);
  if (c.slug && !SLUG.test(c.slug)) err(label, `slug غير صالح: "${c.slug}"`);
  if (c.id && catIds.has(c.id)) err(label, `معرّف قسم مكرر: ${c.id}`);
  if (c.slug && catSlugs.has(c.slug)) err(label, `slug قسم مكرر: ${c.slug}`);
  if (c.order !== undefined && !Number.isFinite(c.order)) err(label, '"order" يجب أن يكون رقماً');
  if (!(typeof c.name_fr === 'string' && c.name_fr.trim())) untranslatedCats.push(c.name ?? c.id);
  if (c.slug && basename(f, '.json') !== c.slug) warn(label, `اسم الملف لا يطابق slug (${c.slug})`);
  c.id && catIds.add(c.id);
  c.slug && catSlugs.add(c.slug);
}

// ---------- المنتجات ----------
const pendingRelated = [];
const untranslated = [];
const untranslatedCats = [];
const ids = new Set();
const slugs = new Set();
let productCount = 0;
let visibleCount = 0;
for (const f of listJson(join(DATA, 'products'))) {
  const label = `products/${f}`;
  const p = readJson(join(DATA, 'products', f), label);
  if (!p) continue;
  productCount++;
  if (!p.hidden) visibleCount++;

  for (const k of ['id', 'name', 'slug', 'category'])
    if (!p[k] || typeof p[k] !== 'string') err(label, `الحقل المطلوب "${k}" مفقود`);

  if (p.id) {
    if (!/^P-\d{4}$/.test(p.id)) warn(label, `المعرّف "${p.id}" لا يطابق الصيغة P-0000`);
    if (ids.has(p.id)) err(label, `معرّف منتج مكرر: ${p.id}`);
    ids.add(p.id);
  }
  if (p.slug) {
    if (!SLUG.test(p.slug)) err(label, `slug غير صالح: "${p.slug}" (حروف لاتينية صغيرة وأرقام وشرطات)`);
    if (slugs.has(p.slug)) err(label, `slug منتج مكرر: ${p.slug}`);
    slugs.add(p.slug);
    if (basename(f, '.json') !== p.slug) warn(label, `اسم الملف لا يطابق slug (${p.slug})`);
  }
  if (p.category && !catIds.has(p.category)) err(label, `القسم غير موجود: ${p.category}`);
  if (!AVAILABILITY.includes(p.availability))
    err(label, `حالة التوفر غير صالحة: ${JSON.stringify(p.availability)}`);

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (p.price !== null && p.price !== undefined && !isNum(p.price)) err(label, `السعر غير صالح: ${p.price}`);
  if (p.oldPrice !== null && p.oldPrice !== undefined) {
    if (!isNum(p.oldPrice)) err(label, `السعر القديم غير صالح: ${p.oldPrice}`);
    else if (isNum(p.price) && p.oldPrice <= p.price) warn(label, 'السعر القديم ليس أكبر من السعر الحالي (لن يظهر تخفيض)');
  }

  if (p.images !== undefined && !Array.isArray(p.images)) err(label, '"images" يجب أن تكون قائمة');
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  if (images.length === 0) warn(label, 'لا توجد صور (ستظهر الصورة البديلة)');
  for (const img of images) {
    if (!publicFileExists(img)) (p.hidden ? warn : err)(label, `صورة غير موجودة في public: ${img}`);
  }

  if (p.specs !== undefined && p.specs !== null) {
    if (Array.isArray(p.specs)) {
      p.specs.forEach((s, i) => {
        if (!s || !s.key) warn(label, `مواصفة رقم ${i + 1} بلا اسم (ستُتجاهل)`);
      });
    } else if (typeof p.specs !== 'object') err(label, '"specs" بصيغة غير مدعومة');
  }
  if (!p.shortDescription) warn(label, 'الوصف القصير فارغ');
  if (p.fr !== undefined && (p.fr === null || typeof p.fr !== 'object' || Array.isArray(p.fr))) err(label, '"fr" يجب أن تكون كائناً');
  else if (!p.hidden && !(p.fr && typeof p.fr.name === 'string' && p.fr.name.trim())) untranslated.push(p.id ?? f);
  if (p.stock !== undefined && p.stock !== null) {
    if (!Number.isInteger(p.stock) || p.stock < 0) err(label, `stock يجب أن يكون عدداً صحيحاً ≥ 0 أو فارغاً: ${JSON.stringify(p.stock)}`);
    else if (p.stock > 0 && p.availability === 'out_of_stock') warn(label, 'المخزون أكبر من 0 لكن الحالة «غير متوفر» يدوياً (تبقى غير متوفر)');
  }
  if (p.related !== undefined && !Array.isArray(p.related)) err(label, '"related" يجب أن تكون قائمة معرّفات');
  else if (Array.isArray(p.related)) pendingRelated.push([label, p.id, p.related]);
}
for (const [label, self, rel] of pendingRelated) {
  for (const r of rel) {
    if (r === self) warn(label, 'المنتج مقترح لنفسه (سيُتجاهل)');
    else if (!ids.has(r)) warn(label, `منتج مقترح غير موجود: ${r} (سيُتجاهل)`);
  }
}
if (visibleCount === 0) warn('products', 'لا يوجد أي منتج ظاهر في الموقع');

// ---------- الإعدادات ----------
const sLabel = 'settings.json';
const s = readJson(join(DATA, 'settings.json'), sLabel);
if (s) {
  for (const k of ['name', 'url']) if (!s[k]) err(sLabel, `الحقل "${k}" مفقود`);
  if (s.url && (!/^https?:\/\//.test(s.url) || s.url.endsWith('/'))) err(sLabel, 'url يجب أن يبدأ بـ http(s) وألا ينتهي بـ /');

  const wa = s.contact?.whatsapp;
  if (!/^\d{8,15}$/.test(wa ?? '')) err(sLabel, 'contact.whatsapp يجب أن يكون أرقاماً فقط بالصيغة الدولية (8–15 رقماً)');
  const wa2 = s.contact?.whatsappSecondary;
  if (wa2 && !/^\d{8,15}$/.test(wa2)) err(sLabel, 'contact.whatsappSecondary غير صالح');

  for (const k of ['primary', 'accent', 'alert'])
    if (!/^#[0-9a-f]{3,8}$/i.test(s.colors?.[k] ?? '')) err(sLabel, `colors.${k} ليس لوناً سداسياً صالحاً`);

  for (const k of ['store', 'icon', 'og'])
    if (!publicFileExists(s.logo?.[k])) err(sLabel, `الشعار logo.${k} غير موجود في public: ${s.logo?.[k]}`);

  if (s.hours) {
    for (const k of ['open', 'close'])
      if (!TIME.test(s.hours[k] ?? '')) err(sLabel, `hours.${k} يجب أن يكون بصيغة HH:MM`);
  } else warn(sLabel, 'hours غير موجود (ستُستعمل القيم الافتراضية 10:00–24:00)');

  if (s.fastDelivery) {
    for (const k of ['minItems', 'hours'])
      if (!Number.isInteger(s.fastDelivery[k]) || s.fastDelivery[k] < 1) err(sLabel, `fastDelivery.${k} يجب أن يكون عدداً صحيحاً ≥ 1`);
  }

  if (s.cities !== undefined) {
    if (!Array.isArray(s.cities)) err(sLabel, '"cities" يجب أن تكون قائمة');
    else {
      const seen = new Set();
      s.cities.forEach((c, i) => {
        if (!c?.name) err(sLabel, `مدينة رقم ${i + 1} بلا اسم`);
        else if (seen.has(c.name)) warn(sLabel, `مدينة مكررة: ${c.name}`);
        seen.add(c?.name);
        if (typeof c?.open !== 'boolean') warn(sLabel, `المدينة "${c?.name}": حقل open ليس true/false (ستُعتبر مقفلة)`);
        const feeOk = typeof c?.fee === 'number' && Number.isFinite(c.fee) && c.fee >= 0;
        // مدينة مفتوحة بلا رسم صالح = توصيل مجاني بالخطأ، لذلك نوقف البناء
        if (!feeOk) (c?.open === true ? err : warn)(sLabel, `المدينة "${c?.name}": رسم التوصيل (fee) مفقود أو غير صالح`);
      });
      if (s.cities.length > 0 && !s.cities.some((c) => c?.open === true))
        warn(sLabel, 'كل المدن مقفلة: لن يستطيع الزبائن إرسال أي طلب من السلة');
    }
  }

  const tok = s.analytics?.cloudflareToken;
  if (tok && !/^[a-f0-9]{32}$/i.test(String(tok).trim()))
    warn(sLabel, 'analytics.cloudflareToken ليس توكناً صالحاً (32 خانة سداسية)، لذا لن تعمل الإحصائيات');

  if (Array.isArray(s.announcements)) {
    s.announcements.forEach((a, i) => {
      if (!a?.text) warn(sLabel, `عرض رقم ${i + 1} بلا نص`);
      const l = (a?.link ?? '').trim();
      if (l && !(l.startsWith('/') && !l.startsWith('//')) && !l.startsWith('https://'))
        warn(sLabel, `رابط العرض رقم ${i + 1} غير آمن وسيُتجاهل: ${l}`);
    });
  }
}

// ---------- الصفحات ----------
for (const f of ['about', 'contact', 'awima-box']) {
  const label = `pages/${f}.json`;
  const path = join(DATA, 'pages', `${f}.json`);
  if (!existsSync(path)) err(label, 'الملف غير موجود');
  else {
    const pg = readJson(path, label);
    if (pg && !pg.title) warn(label, 'العنوان فارغ');
  }
}

// ---------- الترجمة الفرنسية ----------
for (const f of ['about', 'contact', 'awima-box']) {
  const label = `pages/${f}.fr.json`;
  const path = join(DATA, 'pages', `${f}.fr.json`);
  if (!existsSync(path)) err(label, 'الملف غير موجود (تحتاجه صفحات /fr)');
  else {
    const pg = readJson(path, label);
    if (pg && !pg.title) warn(label, 'العنوان فارغ');
  }
}
if (untranslated.length)
  warn('fr', `${untranslated.length} منتج بلا اسم فرنسي (يظهر بالعربية في /fr): ${untranslated.slice(0, 5).join('، ')}${untranslated.length > 5 ? '…' : ''}`);
if (untranslatedCats.length)
  warn('fr', `أقسام بلا اسم فرنسي: ${untranslatedCats.join('، ')}`);
if (s && !s.tagline_fr) warn('settings.json', 'tagline_fr فارغ (يظهر الشعار بالعربية في /fr)');

// ---------- التقييمات (مجلد اختياري) ----------
const REV_DIR = join(DATA, 'reviews');
if (existsSync(REV_DIR)) {
  for (const f of listJson(REV_DIR)) {
    const label = `reviews/${f}`;
    const r = readJson(join(REV_DIR, f), label);
    if (!r) continue;
    if (!r.product || !ids.has(r.product)) err(label, `منتج غير موجود: ${r.product}`);
    if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) err(label, `rating يجب أن يكون عدداً صحيحاً 1..5 (الحالي: ${r.rating})`);
    if (!['verified', 'new'].includes(r.buyer)) err(label, `buyer يجب أن يكون verified أو new (الحالي: ${r.buyer})`);
    if (r.comment && String(r.comment).length > 600) warn(label, 'التعليق أطول من 600 حرف');
    if (r.date && Number.isNaN(Date.parse(r.date))) warn(label, `تاريخ غير صالح: ${r.date}`);
  }
}

// ---------- النتيجة ----------
console.log(`[check] ${productCount} منتج (${visibleCount} ظاهر) · ${catIds.size} قسم`);
for (const w of warnings) console.warn(`  ⚠ ${w}`);
for (const e of errors) console.error(`  ✖ ${e}`);
if (errors.length) {
  console.error(`[check] فشل الفحص: ${errors.length} خطأ، ${warnings.length} تحذير. أصلح الأخطاء ثم أعد المحاولة.`);
  process.exit(1);
}
console.log(`[check] البيانات سليمة${warnings.length ? ` (${warnings.length} تحذير)` : ''}.`);
