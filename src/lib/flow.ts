// AWIMA FLOW — منطق التوجيه البرمجي (بلا ذكاء اصطناعي): تحقق، توفّر، إسناد لمسؤول القسم أو المنسق.
export const MAX_QTY = 99;
export const REF_RE = /^AW-\d{8}-[A-Z2-9]{4}$/;

export type Availability = 'in_stock' | 'out_of_stock' | 'on_request';
export interface CatProduct { variants?: { id: string; name: string }[]; name: string; category: string; price: number | null; availability: Availability; stock: number | null }
export interface Department { id: string; name: string; name_en?: string; phone: string; active: boolean; categories: string[] }
export interface Catalog {
  products: Record<string, CatProduct>;
  categories: Record<string, { name: string; parent: string | null }>;
  departments: Department[];
  coordinator: { name: string; phone: string } | null;
  botPhone: string;
  cities: { name: string; name_fr: string | null; open: boolean }[];
}

/** رقم مغربي → 212XXXXXXXXX (أو null). يقبل 06/07 و+212 و00212 مع مسافات وشرطات. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let d = raw.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (/^0[5-7]\d{8}$/.test(d)) d = '212' + d.slice(1);
  return /^212[5-7]\d{8}$/.test(d) ? d : null;
}

export interface OrderInput { ref: string; name: string; phone: string | null; city: string; address: string; note: string; items: { id: string; qty: number; variant?: string }[] }
export type Missing = 'name' | 'city' | 'items' | 'phone';

/** ينظّف المدخلات ويُرجع الحقول الناقصة. الاسم والموقع (المدينة) والطلب إلزامية؛ الهاتف اختياري لكن إن وُجد يجب أن يصحّ. */
export function parseOrder(body: any, cat: Catalog): { ok: true; order: OrderInput } | { ok: false; missing: Missing[] } {
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const missing: Missing[] = [];
  const name = clean(body?.name, 60);
  if (name.length < 2) missing.push('name');
  const city = clean(body?.city, 40);
  if (!cat.cities.some((c) => c.open && (c.name === city || c.name_fr === city))) missing.push('city');
  // المفتاح = المنتج + النوع المختار (نوعان لنفس المنتج = بندان). نوع غير معروف/غير متوفر → يُهمَل البند.
  const merged = new Map<string, { id: string; variant?: string; qty: number }>();
  for (const it of Array.isArray(body?.items) ? body.items.slice(0, 50) : []) {
    const qty = Number(it?.qty);
    const p = typeof it?.id === 'string' ? cat.products[it.id] : undefined;
    if (!p || !Number.isInteger(qty) || qty < 1) continue;
    const variant = typeof it.variant === 'string' && it.variant ? it.variant : undefined;
    if (variant && !(p.variants ?? []).some((v) => v.id === variant)) continue;
    const key = `${it.id}|${variant ?? ''}`;
    const cur = merged.get(key);
    merged.set(key, { id: it.id, variant, qty: Math.min(MAX_QTY, (cur?.qty ?? 0) + qty) });
  }
  if (merged.size === 0) missing.push('items');
  const rawPhone = clean(body?.phone, 24);
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) missing.push('phone');
  const ref = typeof body?.ref === 'string' && REF_RE.test(body.ref) ? body.ref : '';
  if (missing.length || !ref) return { ok: false, missing: missing.length ? missing : [] };
  const cityName = cat.cities.find((c) => c.name === city || c.name_fr === city)!.name;
  return { ok: true, order: { ref, name, phone, city: cityName, address: clean(body?.address, 160), note: clean(body?.note, 300), items: [...merged.values()].map((m) => (m.variant ? { id: m.id, qty: m.qty, variant: m.variant } : { id: m.id, qty: m.qty })) } };
}

/** القسم الإداري لقسم المنتجات: يصعد في شجرة الأقسام حتى يجد قسماً إدارياً نشطاً يضمّه. */
export function departmentFor(categoryId: string, cat: Catalog): Department | null {
  const seen = new Set<string>();
  for (let c: string | null = categoryId; c && !seen.has(c); c = cat.categories[c]?.parent ?? null) {
    seen.add(c);
    const d = cat.departments.find((x) => x.active && x.categories.includes(c!));
    if (d) return d;
  }
  return null;
}

export type ItemState = 'available' | 'waiting';
/** «متوفر» = الكمية المطلوبة فقط (قرار المالك). «عند الطلب» أو نفاد/نقص المخزون = انتظار. */
export function itemState(p: CatProduct, qty: number): ItemState {
  if (p.availability !== 'in_stock') return 'waiting';
  return p.stock === null || p.stock >= qty ? 'available' : 'waiting';
}

export type Reason = 'ok' | 'unavailable' | 'multi_department' | 'no_department';
export interface Assignment {
  availability: 'available' | 'waiting';
  status: 'ASSIGNED' | 'WAITING_STOCK';
  handler: { kind: 'department' | 'coordinator'; name: string; phone: string; departmentId: string | null };
  reason: Reason;
  lines: { id: string; variant: string | null; variantName: string | null; name: string; qty: number; state: ItemState; departmentId: string | null }[];
}

/** القرار الكامل: كل المنتجات متوفرة وقسم إداري واحد → مسؤول القسم. غير ذلك → منسق العمليات. */
export function assign(order: Pick<OrderInput, 'items'>, cat: Catalog): Assignment {
  const coord = cat.coordinator ?? { name: 'منسق العمليات', phone: cat.botPhone };
  const lines = order.items.map((it) => {
    const p = cat.products[it.id];
    const vn = it.variant ? (p.variants ?? []).find((v) => v.id === it.variant)?.name ?? null : null;
    return { id: it.id, variant: it.variant ?? null, variantName: vn, name: p.name, qty: it.qty, state: itemState(p, it.qty), departmentId: departmentFor(p.category, cat)?.id ?? null };
  });
  const allAvailable = lines.every((l) => l.state === 'available');
  const depIds = new Set(lines.map((l) => l.departmentId));
  const toCoordinator = (reason: Reason): Assignment => ({
    availability: allAvailable ? 'available' : 'waiting',
    status: allAvailable ? 'ASSIGNED' : 'WAITING_STOCK',
    handler: { kind: 'coordinator', name: coord.name, phone: coord.phone, departmentId: null },
    reason,
    lines,
  });
  if (!allAvailable) return toCoordinator('unavailable');
  if (depIds.size > 1) return toCoordinator('multi_department');
  const only = [...depIds][0];
  const dept = cat.departments.find((d) => d.id === only);
  if (!dept) return toCoordinator('no_department');
  return { availability: 'available', status: 'ASSIGNED', handler: { kind: 'department', name: dept.name, phone: dept.phone, departmentId: dept.id }, reason: 'ok', lines };
}

export const STATUSES = ['NEW', 'ASSIGNED', 'WAITING_STOCK', 'CONTACTED', 'CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const;
export type Status = (typeof STATUSES)[number];
