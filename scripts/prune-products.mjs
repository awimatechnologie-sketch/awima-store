// تنظيف لمرة واحدة: يحذف كل منتج ليس في scripts/keep-products.json (أي المنتجات القديمة ذات الصور الرمزية)
// وكل صورة في public/images/products لا يستعملها منتج باقٍ.
// الاستعمال:  node scripts/prune-products.mjs        (معاينة فقط)
//             node scripts/prune-products.mjs --apply (حذف فعلي)
import { readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const apply = process.argv.includes('--apply');
const keep = new Set(JSON.parse(readFileSync('scripts/keep-products.json', 'utf8')));
const pdir = 'src/data/products', idir = 'public/images/products';
const used = new Set();
let delP = 0, delI = 0;
for (const f of readdirSync(pdir).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(pdir, f), 'utf8'));
  if (keep.has(d.slug)) { for (const im of d.images ?? []) used.add(im.split('/').pop()); continue; }
  console.log('منتج قديم:', f); delP++;
  if (apply) rmSync(join(pdir, f));
}
if (existsSync(idir)) for (const f of readdirSync(idir)) {
  if (used.has(f) || /^(avif|webp)$/.test(f)) continue;
  const base = f.replace(/-(\d+)w\.(webp|avif|jpg)$/, '.jpg');
  if (used.has(base) || [...used].some((u) => f.startsWith(u.replace(/\.jpg$/, '')))) continue;
  console.log('صورة غير مستعملة:', f); delI++;
  if (apply) rmSync(join(idir, f), { recursive: true, force: true });
}
console.log(`${apply ? 'حُذف' : 'سيُحذف'}: ${delP} منتج، ${delI} صورة`);
