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
const catParents = [];
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
  catParents.push([label, c.id, c.parent]);
}
for (const [label, id, parent] of catParents) {
  if (!parent) continue;
  if (parent === id) err(label, 'القسم أب لنفسه');
  else if (!catIds.has(parent)) err(label, `القسم الأب غير موجود: ${parent}`);
  else if (catParents.find((x) => x[1] === parent)?.[2]) err(label, 'يُسمح بمستوى واحد من الأقسام الفرعية فقط');
}

// ---------- المنتجات ----------
let anyProductWarranty = false;
const draftsNoImage = [];
const svgOnly = [];
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
  if (images.length === 0 && !p.hidden) warn(label, 'لا توجد صور (ستظهر الصورة البديلة)');
  if (images.length === 0 && p.hidden) draftsNoImage.push(p.slug ?? f);
  if (!p.hidden && images.length && images.every((x) => /\.svg$/i.test(x))) svgOnly.push(p.slug ?? f);
  for (const img of images) {
    if (!publicFileExists(img)) (p.hidden ? warn : err)(label, `صورة غير موجودة في public: ${img}`);
  }

  if (p.variants !== undefined && p.variants !== null) {
    if (!Array.isArray(p.variants)) err(label, '"variants" يجب أن تكون قائمة');
    else {
      const vids = new Set();
      p.variants.forEach((v, i) => {
        const w = `${label} (نوع ${i + 1})`;
        if (!v?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.id)) err(w, `معرّف النوع مفقود أو غير صالح: ${JSON.stringify(v?.id)}`);
        else if (vids.has(v.id)) err(w, `معرّف نوع مكرر: ${v.id}`);
        else vids.add(v.id);
        if (!v?.name || !String(v.name).trim()) err(w, 'اسم النوع مطلوب');
        if (v?.image && !publicFileExists(v.image)) err(w, `صورة النوع غير موجودة: ${v.image}`);
      });
      if (p.variants.length > 0 && !p.variants.some((v) => v?.available !== false)) warn(label, 'كل الأنواع موقوفة: يظهر المنتج بلا خيارات');
    }
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
  if (p.warranty > 0) anyProductWarranty = true;
  for (const k of ['warranty', 'leadDays']) {
    const v = p[k];
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0)) err(label, `${k} يجب أن يكون عدداً صحيحاً ≥ 0 أو فارغاً: ${JSON.stringify(v)}`);
  }
  if (p.ports !== undefined) {
    if (!Array.isArray(p.ports)) err(label, '"ports" يجب أن تكون قائمة');
    else for (const x of p.ports) if (!['usb-c', 'lightning', 'micro-usb'].includes(x)) err(label, `منفذ غير معروف في ports: ${JSON.stringify(x)}`);
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
if (svgOnly.length) warn('images', `${svgOnly.length} منتج ظاهر بصور رسومية (SVG) بدل صور حقيقية: ${svgOnly.slice(0, 6).join('، ')}${svgOnly.length > 6 ? '…' : ''}`);
if (draftsNoImage.length) console.log(`[check] ${draftsNoImage.length} مسودة مخفية تنتظر صوراً وأسعاراً (انشرها بإلغاء «إخفاء المنتج»).`);

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

  if (s.freeDeliveryFrom != null && !(typeof s.freeDeliveryFrom === 'number' && Number.isFinite(s.freeDeliveryFrom) && s.freeDeliveryFrom >= 0))
    err(sLabel, 'freeDeliveryFrom يجب أن يكون رقماً ≥ 0');

  if (s.discounts !== undefined && s.discounts !== null) {
    if (!Array.isArray(s.discounts)) err(sLabel, '"discounts" يجب أن تكون قائمة');
    else {
      const seenCodes = new Set();
      const today = new Date().toISOString().slice(0, 10);
      s.discounts.forEach((d, i) => {
        const at = `discounts[${i + 1}]`;
        const code = String(d?.code ?? '').replace(/\s+/g, '').toUpperCase();
        if (!/^[A-Z0-9_-]{3,24}$/.test(code)) err(sLabel, `${at}: الكود غير صالح (حروف لاتينية وأرقام وشرطات، 3–24)`);
        else if (seenCodes.has(code)) err(sLabel, `${at}: الكود "${code}" مكرر`);
        else seenCodes.add(code);
        if (!['percent', 'fixed'].includes(d?.type)) err(sLabel, `${at}: type يجب أن يكون percent أو fixed`);
        if (!(typeof d?.value === 'number' && d.value > 0) || (d?.type === 'percent' && d.value > 100)) err(sLabel, `${at}: القيمة غير صالحة (نسبة 1–100 أو مبلغ > 0)`);
        const dv = (v) => (v ? String(v).slice(0, 10) : '');
        const [st, en] = [dv(d?.startDate), dv(d?.endDate)];
        for (const [k, v] of [['startDate', st], ['endDate', en]]) if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) err(sLabel, `${at}: ${k} غير صالح (YYYY-MM-DD)`);
        if (st && en && st > en) err(sLabel, `${at}: تاريخ البداية بعد النهاية`);
        if (en && en < today && d?.enabled !== false) warn(sLabel, `${at}: الكود "${code}" منتهي (${en}) وما زال مفعّلاً`);
      });
    }
  }

  if (s.autoOffersEnabled !== undefined && typeof s.autoOffersEnabled !== 'boolean') err(sLabel, 'autoOffersEnabled يجب أن يكون true/false');
  if (s.autoOffers !== undefined && s.autoOffers !== null) {
    if (!Array.isArray(s.autoOffers)) err(sLabel, '"autoOffers" يجب أن تكون قائمة');
    else {
      const today = new Date().toISOString().slice(0, 10);
      s.autoOffers.forEach((o, i) => {
        const at = `autoOffers[${i + 1}]`;
        if (!String(o?.name ?? '').trim()) err(sLabel, `${at}: اسم العرض مفقود`);
        if (!['percent', 'fixed'].includes(o?.type)) err(sLabel, `${at}: type يجب أن يكون percent أو fixed`);
        if (!(typeof o?.value === 'number' && o.value > 0) || (o?.type === 'percent' && o.value > 100)) err(sLabel, `${at}: القيمة غير صالحة (نسبة 1–100 أو مبلغ > 0)`);
        if (o?.minQty !== undefined && o.minQty !== null && !(Number.isInteger(o.minQty) && o.minQty >= 1)) err(sLabel, `${at}: minQty يجب أن يكون عدداً صحيحاً ≥ 1`);
        if (!['category', 'products', 'all'].includes(o?.scope)) err(sLabel, `${at}: scope يجب أن يكون category أو products أو all`);
        if (o?.scope === 'category') {
          if (!o.category) err(sLabel, `${at}: اختر القسم`);
          else if (!catIds.has(o.category)) err(sLabel, `${at}: القسم غير موجود: ${o.category}`);
        }
        if (o?.scope === 'products') {
          const list = Array.isArray(o.products) ? o.products : [];
          if (list.length === 0) err(sLabel, `${at}: اختر منتجاً واحداً على الأقل`);
          for (const pid of list) if (!ids.has(pid)) err(sLabel, `${at}: منتج غير موجود: ${pid}`);
        }
        const dv = (v) => (v ? String(v).slice(0, 10) : '');
        const [st, en] = [dv(o?.startDate), dv(o?.endDate)];
        for (const [k, v] of [['startDate', st], ['endDate', en]]) if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) err(sLabel, `${at}: ${k} غير صالح (YYYY-MM-DD)`);
        if (st && en && st > en) err(sLabel, `${at}: تاريخ البداية بعد النهاية`);
        if (en && en < today && o?.enabled !== false) warn(sLabel, `${at}: العرض "${o?.name}" منتهي (${en}) وما زال مفعّلاً`);
        if (!String(o?.name_fr ?? '').trim()) warn(sLabel, `${at}: لا اسم فرنسي للعرض (يظهر بالعربية في /fr)`);
      });
    }
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
for (const f of ['about', 'contact', 'awima-box', 'policy', 'compat']) {
  const label = `pages/${f}.json`;
  const path = join(DATA, 'pages', `${f}.json`);
  if (!existsSync(path)) err(label, 'الملف غير موجود');
  else {
    const pg = readJson(path, label);
    if (pg && !pg.title) warn(label, 'العنوان فارغ');
  }
}

// ---------- مجتمع الموقع ----------
if (s?.community !== undefined) {
  const cm = s.community;
  if (cm === null || typeof cm !== 'object') err(sLabel, '"community" يجب أن يكون كائناً');
  else {
    const th = cm.thresholds ?? {};
    for (const k of ['greenDarkAvg', 'greenLightAvg']) if (th[k] !== undefined && !(th[k] >= 1 && th[k] <= 5)) err(sLabel, `community.thresholds.${k} يجب أن يكون بين 1 و5`);
    if (th.greenLightAvg > th.greenDarkAvg) warn(sLabel, 'حدّ الأخضر الفاتح أعلى من الغامق (سيتعطّل الغامق)');
    if (th.strongPoints < th.minPoints) warn(sLabel, 'نقاط الأخضر الغامق أقل من أقل نقاط للون');
    if (cm.turnstileSiteKey && !/^[0-9A-Za-z_-]{8,80}$/.test(cm.turnstileSiteKey)) err(sLabel, 'turnstileSiteKey غير صالح');
  }
}
if (existsSync(join(ROOT, 'functions/api')) && !existsSync(join(ROOT, 'db/schema.sql'))) err('db', 'db/schema.sql مفقود');

// ---------- الضمان وباحث التوافق ----------
if (s?.warranty !== undefined) {
  const w = s.warranty;
  if (w === null || typeof w !== 'object') err(sLabel, '"warranty" يجب أن يكون كائناً');
  else {
    if (w.days !== undefined && (!Number.isInteger(w.days) || w.days < 0)) err(sLabel, `warranty.days يجب أن يكون عدداً صحيحاً ≥ 0: ${JSON.stringify(w.days)}`);
    if (w.enabled === true && !(w.days > 0) && !anyProductWarranty) warn(sLabel, 'الضمان مفعّل لكن مدته 0 ولا منتج له ضمان خاص (لن تظهر أي شارة)');
  }
}
{
  const cpath = join(DATA, 'pages', 'compat.json');
  if (existsSync(cpath)) {
    const c = readJson(cpath, 'pages/compat.json');
    const seenDev = new Set();
    (c?.devices ?? []).forEach((d, i) => {
      const where = `pages/compat.json (جهاز ${i + 1})`;
      if (!d?.brand || !d?.name) err(where, 'الماركة والموديل مطلوبان');
      else {
        const key = `${d.brand}|${d.name}`.toLowerCase();
        if (seenDev.has(key)) warn(where, `جهاز مكرر: ${d.brand} ${d.name} (يُتجاهل)`);
        seenDev.add(key);
      }
      if (!['usb-c', 'lightning', 'micro-usb'].includes(d?.port)) err(where, `منفذ غير صالح: ${JSON.stringify(d?.port)}`);
    });
  }
}

// ---------- AWIMA FLOW: الأقسام الإدارية والمسؤولون ----------
{
  const dPath = join(DATA, 'departments.json');
  if (existsSync(dPath)) {
    const dl = 'departments.json';
    const d = readJson(dPath, dl);
    const PHONE = /^212[5-7]\d{8}$/;
    if (d) {
      if (!d.coordinator || !PHONE.test(d.coordinator.phone ?? '')) err(dl, 'رقم منسق العمليات مفقود أو بصيغة غير صحيحة (212XXXXXXXXX)');
      const ids = new Set();
      const slugsSeen = new Set();
      const owner = new Map();
      (d.departments ?? []).forEach((dep, i) => {
        const w = `${dl} (قسم ${i + 1}: ${dep?.name ?? '؟'})`;
        if (!dep?.id || !/^[a-z0-9-]+$/.test(dep.id)) err(w, 'المعرّف مفقود أو غير صالح');
        else if (ids.has(dep.id)) err(w, `معرّف مكرر: ${dep.id}`);
        else ids.add(dep.id);
        if (!dep?.name) err(w, 'الاسم مطلوب');
        if (!dep?.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(dep.slug)) err(w, 'الرابط (slug) مفقود أو غير صالح');
        else if (slugsSeen.has(dep.slug)) err(w, `slug مكرر: ${dep.slug}`);
        else slugsSeen.add(dep.slug);
        if (dep?.cover && !publicFileExists(dep.cover)) err(w, `صورة الغلاف غير موجودة: ${dep.cover}`);
        if (!PHONE.test(dep?.phone ?? '')) err(w, `رقم المسؤول غير صحيح: ${JSON.stringify(dep?.phone)}`);
        for (const c of dep?.categories ?? []) {
          if (!catIds.has(c)) err(w, `قسم متجر غير موجود: ${c}`);
          else if (owner.has(c)) err(w, `القسم ${c} تابع لقسمين إداريين (${owner.get(c)} و${dep.id}) — يجب أن يكون لواحد فقط`);
          else owner.set(c, dep.id);
        }
      });
    }
  }
}

// ---------- الترجمة الفرنسية ----------
for (const f of ['about', 'contact', 'awima-box', 'policy', 'compat']) {
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


// ---------- AWIMA Screens ----------
{
  const SD = join(DATA, 'screens');
  const st = readJson(join(SD, 'settings.json'), 'screens/settings.json');
  const md = readJson(join(SD, 'models.json'), 'screens/models.json');
  if (st && md) {
    if (!/^\d{8,15}$/.test(String(st.whatsapp ?? ''))) err('screens/settings.json', `رقم واتساب غير صالح: ${st.whatsapp}`);
    const bids = new Set();
    for (const [i, b] of (st.brands ?? []).entries()) {
      const w = `screens/settings.json (علامة ${i + 1})`;
      if (!b?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.id)) err(w, `معرّف العلامة غير صالح: ${JSON.stringify(b?.id)}`);
      else if (bids.has(b.id)) err(w, `معرّف علامة مكرر: ${b.id}`);
      else bids.add(b.id);
      if (!b?.name) err(w, 'اسم العلامة مطلوب');
      if (b?.image && !publicFileExists(b.image)) err(w, `صورة العلامة غير موجودة: ${b.image}`);
    }
    const mids = new Set();
    let shown = 0;
    for (const [i, m] of (md.models ?? []).entries()) {
      const w = `screens/models.json (${m?.id ?? i + 1})`;
      if (!m?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)) { err(w, 'معرّف الموديل غير صالح'); continue; }
      if (mids.has(m.id)) err(w, 'معرّف موديل مكرر');
      mids.add(m.id);
      if (!bids.has(m.brand)) err(w, `علامة غير موجودة: ${m.brand}`);
      if (!m.name || !String(m.name).trim()) err(w, 'اسم الموديل مطلوب');
      if (m.available !== false) {
        if (!Number.isFinite(m.price) || m.price <= 0) warn(w, 'موديل ظاهر بلا سعر: لن يُعرض');
        else shown++;
      }
    }
    console.log(`[check] AWIMA Screens: ${shown} موديل ظاهر في ${bids.size} علامة`);
  }
}

// ---------- AWIMA Parts ----------
{
  const PD = join(DATA, 'parts');
  const st = readJson(join(PD, 'settings.json'), 'parts/settings.json');
  const it = readJson(join(PD, 'items.json'), 'parts/items.json');
  if (st && it) {
    if (!/^\d{8,15}$/.test(String(st.whatsapp ?? ''))) err('parts/settings.json', `رقم واتساب غير صالح: ${st.whatsapp}`);
    const cids = new Set();
    for (const [i, c] of (st.categories ?? []).entries()) {
      const w = `parts/settings.json (تصنيف ${i + 1})`;
      if (!c?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) err(w, `معرّف التصنيف غير صالح: ${JSON.stringify(c?.id)}`);
      else if (cids.has(c.id)) err(w, `معرّف مكرر: ${c.id}`);
      else cids.add(c.id);
      if (!c?.name) err(w, 'اسم التصنيف مطلوب');
    }
    const pids = new Set();
    let shown = 0;
    for (const [i, p] of (it.items ?? []).entries()) {
      const w = `parts/items.json (${p?.id ?? i + 1})`;
      if (!p?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) { err(w, 'معرّف القطعة غير صالح'); continue; }
      if (pids.has(p.id)) err(w, 'معرّف مكرر');
      pids.add(p.id);
      if (!cids.has(p.cat)) err(w, `تصنيف غير موجود: ${p.cat}`);
      if (!p.model || !p.part) err(w, 'الموديل واسم القطعة مطلوبان');
      if (p.available !== false) {
        if (!Number.isFinite(p.retail) || p.retail <= 0) warn(w, 'قطعة ظاهرة بلا سعر تقسيط: لن تُعرض');
        else shown++;
        if (Number.isFinite(p.wholesale) && p.wholesale > p.retail) warn(w, 'سعر الجملة أعلى من التقسيط');
      }
    }
    console.log(`[check] AWIMA Parts: ${shown} قطعة ظاهرة في ${cids.size} تصنيف`);
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
