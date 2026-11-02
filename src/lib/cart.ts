// سلة المشتريات — تُحفظ في متصفح الزبون فقط (localStorage)، بلا خادم ولا قاعدة بيانات.
// نخزّن المعرّف والكمية فقط؛ الأسعار والأسماء تُقرأ دائماً من بيانات الموقع الحالية.
const KEY = 'awima_cart_v1';
const MAX_QTY = 99;

export type CartLine = { id: string; qty: number };

export function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((l) => l && typeof l.id === 'string' && Number.isInteger(l.qty) && l.qty > 0)
      .map((l) => ({ id: l.id, qty: Math.min(l.qty, MAX_QTY) }));
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

export function addToCart(id: string, qty = 1) {
  const lines = readCart();
  const line = lines.find((l) => l.id === id);
  if (line) line.qty = Math.min(line.qty + qty, MAX_QTY);
  else lines.push({ id, qty: Math.min(qty, MAX_QTY) });
  write(lines);
}

export function setQty(id: string, qty: number) {
  if (qty <= 0) return removeFromCart(id);
  write(readCart().map((l) => (l.id === id ? { ...l, qty: Math.min(qty, MAX_QTY) } : l)));
}

export function removeFromCart(id: string) {
  write(readCart().filter((l) => l.id !== id));
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
