// يولّد server/flow-catalog.generated.js من src/data (المنتجات، الأقسام، الأقسام الإدارية، المدن).
// الخادم (Pages Functions) لا يقرأ الملفات وقت التشغيل، فنُضمّن لقطة البيانات وقت البناء.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath (وليس .pathname) كي يعمل على Windows مع المسافات في اسم المجلد
const DATA = fileURLToPath(new URL('../src/data/', import.meta.url));
const OUT = fileURLToPath(new URL('../server/flow-catalog.generated.js', import.meta.url));
const readDir = (d) => readdirSync(join(DATA, d)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(DATA, d, f), 'utf8')));
const settings = JSON.parse(readFileSync(join(DATA, 'settings.json'), 'utf8'));
const dep = JSON.parse(readFileSync(join(DATA, 'departments.json'), 'utf8'));

const products = {};
for (const p of readDir('products'))
  products[p.id] = { variants: (Array.isArray(p.variants) ? p.variants : []).filter((v) => v && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.id ?? '') && typeof v.name === 'string' && v.name.trim() && v.available !== false).map((v) => ({ id: v.id, name: v.name.trim() })), name: p.name, category: p.category, price: typeof p.price === 'number' ? p.price : null, availability: p.availability, stock: Number.isInteger(p.stock) && p.stock >= 0 ? p.stock : null };
const categories = {};
for (const c of readDir('categories')) categories[c.id] = { name: c.name, parent: c.parent ?? null };

const catalog = {
  products,
  categories,
  departments: dep.departments ?? [],
  coordinator: dep.coordinator ?? null,
  botPhone: settings.contact?.whatsapp ?? '',
  cities: (settings.cities ?? []).filter((c) => c?.name).map((c) => ({ name: c.name, name_fr: c.name_fr ?? null, open: c.open === true })),
};
writeFileSync(OUT, `// ملف مولَّد — لا تعدّله يدوياً (node scripts/gen-flow-catalog.mjs)\nexport default ${JSON.stringify(catalog)};\n`);
console.log(`flow-catalog: ${Object.keys(products).length} منتج، ${Object.keys(categories).length} قسم، ${catalog.departments.length} أقسام إدارية`);
