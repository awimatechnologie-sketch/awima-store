// باحث التوافق: موديلات الهواتف (من لوحة الإدارة) → نوع المنفذ → المنتجات التي تدعم هذا المنفذ.
export const PORTS = ['usb-c', 'lightning', 'micro-usb'] as const;
export type Port = (typeof PORTS)[number];
export const isPort = (v: unknown): v is Port => PORTS.includes(v as Port);

export interface Device {
  brand: string;
  name: string;
  port: Port;
  note?: string;
  noteFr?: string;
}

export function normalizeDevices(raw: unknown): Device[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Device[] = [];
  for (const r of raw) {
    const name = typeof r?.name === 'string' ? r.name.trim() : '';
    const brand = typeof r?.brand === 'string' ? r.brand.trim() : '';
    if (!name || !brand || !isPort(r?.port)) continue;
    const key = `${brand}|${name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim() : undefined;
    const noteFr = typeof r.note_fr === 'string' && r.note_fr.trim() ? r.note_fr.trim() : undefined;
    out.push({ brand, name, port: r.port, note, noteFr });
  }
  return out;
}

export function brandsOf(devices: Device[]): string[] {
  return [...new Set(devices.map((d) => d.brand))].sort((a, b) => a.localeCompare(b));
}

/** قائمة منافذ المنتج المصرَّح بها: قيم صالحة فقط بلا تكرار */
export function normalizePorts(raw: unknown): Port[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isPort))] : [];
}

export const productsForPort = <P extends { ports?: Port[] }>(products: P[], port: Port): P[] =>
  products.filter((p) => p.ports?.includes(port));
