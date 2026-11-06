// شريط الثقة في الرئيسية: عناصر تُشتق من إعدادات المتجر الفعلية (لا ادعاءات ثابتة) + عناصر مخصصة من الإدارة.
export interface TrustConfig {
  enabled: boolean;
  show: { whatsapp: boolean; fastDelivery: boolean; freeDelivery: boolean; warranty: boolean; hours: boolean };
  custom: { icon: string; text: string; textFr: string }[];
}
export interface TrustItem { icon: string; text: string; href?: string }

export function normalizeTrust(raw: any): TrustConfig {
  const on = (v: unknown) => v !== false;
  const sh = raw?.show ?? {};
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    enabled: raw?.enabled !== false,
    show: { whatsapp: on(sh.whatsapp), fastDelivery: on(sh.fastDelivery), freeDelivery: on(sh.freeDelivery), warranty: on(sh.warranty), hours: on(sh.hours) },
    custom: (Array.isArray(raw?.custom) ? raw.custom : [])
      .map((c: any) => ({ icon: str(c?.icon, 4) || '✔️', text: str(c?.text, 80), textFr: str(c?.text_fr, 80) }))
      .filter((c: { text: string }) => c.text),
  };
}

export interface TrustFacts {
  fastDelivery: { minItems: number; hours: number };
  freeDeliveryFrom: number | null;
  warrantyEnabled: boolean;
  hoursRange: string;
}

/** tr(key, params) = دالة الترجمة؛ money(n) = تنسيق السعر */
export function buildTrustItems(
  cfg: TrustConfig,
  f: TrustFacts,
  tr: (key: string, vars?: Record<string, string | number>) => string,
  money: (n: number) => string,
  lang: 'ar' | 'fr',
  policyHref: string
): TrustItem[] {
  if (!cfg.enabled) return [];
  const out: TrustItem[] = [];
  if (cfg.show.whatsapp) out.push({ icon: '💬', text: tr('trust.whatsapp') });
  if (cfg.show.fastDelivery && f.fastDelivery.hours > 0) out.push({ icon: '🚚', text: tr('trust.fast', { hours: f.fastDelivery.hours, n: f.fastDelivery.minItems }) });
  if (cfg.show.freeDelivery && f.freeDeliveryFrom) out.push({ icon: '🎁', text: tr('trust.free', { amount: money(f.freeDeliveryFrom) }) });
  if (cfg.show.warranty && f.warrantyEnabled) out.push({ icon: '🛡️', text: tr('trust.warranty'), href: policyHref });
  if (cfg.show.hours && f.hoursRange) out.push({ icon: '🕒', text: f.hoursRange });
  for (const c of cfg.custom) out.push({ icon: c.icon, text: lang === 'fr' && c.textFr ? c.textFr : c.text });
  return out;
}
