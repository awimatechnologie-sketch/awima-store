// سلة المشتريات — تُحفظ في متصفح الزبون فقط (localStorage)، بلا خادم ولا قاعدة بيانات.
// نخزّن المعرّف والكمية فقط؛ الأسعار والأسماء تُقرأ دائماً من بيانات الموقع الحالية.
const KEY = 'awima_cart_v1';
const MAX_QTY = 99;

// v = معرّف النوع المختار (اختياري). السطر مفتاحه id + v: منتج واحد بنوعين = سطران.
export type CartLine = { id: string; qty: number; v?: string };
const same = (l: CartLine, id: string, v?: string) => l.id === id && (l.v ?? '') === (v ?? '');

export function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((l) => l && typeof l.id === 'string' && Number.isInteger(l.qty) && l.qty > 0)
      .map((l) => (typeof l.v === 'string' && l.v ? { id: l.id, qty: Math.min(l.qty, MAX_QTY), v: l.v } : { id: l.id, qty: Math.min(l.qty, MAX_QTY) }));
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* التخزين غير متاح (وضع خاص مثلاً) */
  }
  window.dispatchEvent(new CustomEvent('cart:change'));
}

export const cartCount = () => readCart().reduce((n, l) => n + l.qty, 0);

/** يضيف للسلة دون تجاوز `max` (مخزون المنتج). يعيد true إن زادت الكمية فعلاً */
export function addToCart(id: string, qty = 1, max = MAX_QTY, v?: string): boolean {
  const cap = Math.min(max, MAX_QTY);
  const lines = readCart();
  const line = lines.find((l) => same(l, id, v));
  // المخزون للمنتج كله: يُحسب مجموع أنواعه في السلة
  const total = lines.filter((l) => l.id === id).reduce((n, l) => n + l.qty, 0);
  const before = line?.qty ?? 0;
  const after = Math.min(before + qty, cap - (total - before));
  if (after <= before) return false;
  if (line) line.qty = after;
  else lines.push(v ? { id, qty: after, v } : { id, qty: after });
  write(lines);
  return true;
}

export function setQty(id: string, qty: number, v?: string) {
  if (qty <= 0) return removeFromCart(id, v);
  write(readCart().map((l) => (same(l, id, v) ? { ...l, qty: Math.min(qty, MAX_QTY) } : l)));
}

export function removeFromCart(id: string, v?: string) {
  write(readCart().filter((l) => !same(l, id, v)));
}

export function clearCart() {
  write([]);
}

// ---- المنتجات التي حُذفت أو أُخفيت من المتجر بعد أن أضافها الزبون ----
const PKEY = 'awima_cart_pruned';

/** يحذف من السلة كل معرّف ليس ضمن المنتجات الظاهرة حالياً، ويعيد عدد الأسطر المحذوفة */
export function pruneCart(valid: Set<string>): number {
  const lines = readCart();
  const kept = lines.filter((l) => valid.has(l.id));
  const removed = lines.length - kept.length;
  if (removed > 0) {
    try {
      sessionStorage.setItem(PKEY, String(Number(sessionStorage.getItem(PKEY) ?? 0) + removed));
    } catch {
      /* لا بأس */
    }
    write(kept);
  }
  return removed;
}

/** يقرأ عدد الأسطر المحذوفة تلقائياً (مرة واحدة) ليعرض صفحة السلة تنبيهاً للزبون */
export function takePruned(): number {
  try {
    const n = Number(sessionStorage.getItem(PKEY) ?? 0);
    if (n > 0) sessionStorage.removeItem(PKEY);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
