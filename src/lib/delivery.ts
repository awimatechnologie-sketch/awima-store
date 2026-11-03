// رسوم التوصيل: لكل مدينة رسم ثابت بالدرهم (fee) يُضاف إلى مجموع المنتجات.
export type CityFee = { name: string; fee: number | null };

/** رسم مدينة، أو null إن لم تكن موجودة أو بلا رسم محدد */
export function feeFor(cities: CityFee[], name: string): number | null {
  const c = cities.find((x) => x.name === name);
  return c && c.fee !== null && Number.isFinite(c.fee) && c.fee >= 0 ? c.fee : null;
}

/** الإجمالي = مجموع المنتجات + رسم التوصيل. سلة بلا منتجات = بلا رسوم */
export function orderTotals(subtotal: number, itemCount: number, fee: number | null) {
  const f = itemCount > 0 ? (fee ?? 0) : 0;
  return { subtotal, fee: f, total: subtotal + f };
}

/** رسم صالح من الإعدادات: رقم ≥ 0 وإلا null */
export const normalizeFee = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** حد التوصيل المجاني: رقم > 0 وإلا null (= معطّل) */
export const normalizeFreeFrom = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/** الرسم الفعلي: صفر إن بلغ مجموع المنتجات حد التوصيل المجاني، وإلا رسم المدينة */
export function effectiveFee(fee: number | null, subtotal: number, freeFrom: number | null | undefined): number | null {
  return freeFrom != null && subtotal > 0 && subtotal >= freeFrom ? 0 : fee;
}

/** المبلغ الناقص للتوصيل المجاني، أو null إن كان معطّلاً أو تحقق الحد */
export function freeRemaining(subtotal: number, freeFrom: number | null | undefined): number | null {
  return freeFrom != null && subtotal < freeFrom ? freeFrom - subtotal : null;
}
