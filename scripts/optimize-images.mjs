// تحسين صور المنتجات تلقائياً قبل كل بناء (Cloudflare أو محلياً).
// - يصغّر أي صورة أعرض من MAX_WIDTH ويصحّح اتجاهها حسب EXIF
// - يعيد ضغطها بنفس الصيغة (jpg/png/webp) فلا تتغير مسارات الصور في JSON
// - لا يستبدل الملف إلا إذا صار أصغر حجماً، فيمكن تشغيله مراراً بأمان
// - إن لم تتوفر مكتبة sharp أو فشلت صورة ما، يتخطى دون إيقاف البناء
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const DIR = 'public/images/products';
const MAX_WIDTH = 1200;
const SKIP_UNDER = 40 * 1024; // ملفات أصغر من 40KB وبعرض مناسب تُترك
const VARIANTS = [480, 800]; // نسخ أصغر للهواتف: name-w480.jpg وname-w800.jpg (تُنشأ عند البناء ولا تُرفع إلى git)
const isVariant = (f) => /-w\d+\.[a-z]+$/i.test(basename(f));

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('[images] مكتبة sharp غير مثبتة — تم تخطي تحسين الصور.');
  process.exit(0);
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // المجلد غير موجود بعد
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// نسخ أصغر لتحميل أخف على الهاتف (تُستعمل في srcset عند وجودها). لا تُنشأ لصورة أصغر من النسخة نفسها.
async function makeVariants(file, ext, width) {
  for (const w of VARIANTS) {
    if (width <= w * 1.15) continue;
    const target = file.slice(0, -ext.length) + `-w${w}${ext}`;
    try {
      const [a, b] = await Promise.all([stat(file), stat(target).catch(() => null)]);
      if (b && b.mtimeMs >= a.mtimeMs) continue;
      let p = sharp(file, { failOn: 'none' }).rotate().resize({ width: w, withoutEnlargement: true });
      if (ext === '.png') p = p.png({ compressionLevel: 9, palette: true, quality: 85 });
      else if (ext === '.webp') p = p.webp({ quality: 78 });
      else p = p.jpeg({ quality: 76, mozjpeg: true });
      await writeFile(target, await p.toBuffer());
    } catch (err) {
      console.warn(`[images] تعذّر إنشاء نسخة ${w}px لـ ${file}: ${err.message}`);
    }
  }
}

let saved = 0;
let count = 0;
for await (const file of walk(DIR)) {
  const ext = extname(file).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue; // SVG وغيره يُترك
  if (isVariant(file)) continue;
  try {
    const original = await readFile(file);
    const img = sharp(original, { failOn: 'none' }).rotate();
    const meta = await sharp(original).metadata();
    if (original.length < SKIP_UNDER && (meta.width ?? 0) <= MAX_WIDTH) { await makeVariants(file, ext, meta.width ?? 0); continue; }

    let pipeline = img.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    if (ext === '.png') pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 85 });
    else if (ext === '.webp') pipeline = pipeline.webp({ quality: 80 });
    else pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });

    const out = await pipeline.toBuffer();
    if (out.length < original.length) {
      await writeFile(file, out);
      saved += original.length - out.length;
      count++;
      console.log(`[images] ${file}: ${(original.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB`);
    }
    await makeVariants(file, ext, Math.min(meta.width ?? 0, MAX_WIDTH));
  } catch (err) {
    console.warn(`[images] تعذّر تحسين ${file}: ${err.message}`);
  }
}
console.log(`[images] تم تحسين ${count} صورة، وفُرّغ ${(saved / 1024).toFixed(0)}KB.`);
