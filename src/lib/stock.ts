// مخزون بسيط: الحقل stock اختياري. فارغ/غير موجود = غير محدود (لا يُتابَع). 0 = غير متوفر تلقائياً.
export const MAX_QTY = 99;

export type Stock = number | null | undefined;

/** يقبل عدداً صحيحاً ≥ 0 فقط، وإلا null (= غير محدود) */
export const normalizeStock = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

/** المخزون 0 يجعل المنتج «غير متوفر» تلقائياً، وغير ذلك تبقى الحالة التي اختارها المدير */
export function effectiveAvailability<A extends string>(availability: A, stock: Stock): A | 'out_of_stock' {
  return stock === 0 ? 'out_of_stock' : availability;
}

/** أقصى كمية يمكن للزبون طلبها من المنتج */
export const maxQty = (stock: Stock, cap = MAX_QTY): number =>
  stock === null || stock === undefined ? cap : Math.min(cap, Math.max(0, stock));

/** يظهر «متبقّ N فقط» عندما يكون المخزون المحدَّد بين 1 وهذا الحد */
export const LOW_STOCK = 5;
export const isLowStock = (stock: Stock, threshold = LOW_STOCK): boolean =>
  typeof stock === 'number' && stock >= 1 && stock <= threshold;
