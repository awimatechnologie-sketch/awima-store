// أدوات SEO بلا مكتبات: sitemap.xml وrobots.txt وبيانات Store المنظّمة. دوال صرفة قابلة للاختبار.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** base بدون / في النهاية، وpaths تبدأ بـ / */
export function buildSitemap(base: string, paths: string[]): string {
  const root = base.replace(/\/$/, '');
  const urls = [...new Set(paths)]
    .map((p) => `  <url><loc>${esc(root + (p.startsWith('/') ? p : '/' + p))}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobots(base: string): string {
  const root = base.replace(/\/$/, '');
  return ['User-agent: *', 'Allow: /', 'Disallow: /admin/', 'Disallow: /cart', '', `Sitemap: ${root}/sitemap.xml`, ''].join('\n');
}

type StoreInput = {
  name: string;
  tagline: string;
  url: string;
  logo: { store: string; og: string };
  contact: { whatsapp: string; email?: string; address?: string };
  social: Record<string, string | undefined>;
  hours: { open: string; close: string };
  cities: { name: string; open: boolean }[];
};

/** schema.org Store للصفحة الرئيسية */
export function buildStoreLd(s: StoreInput): Record<string, unknown> {
  const abs = (p: string) => (/^https?:\/\//.test(p) ? p : s.url.replace(/\/$/, '') + p);
  // 24:00 غير صالحة في schema.org فتُكتب 00:00
  const t = (x: string) => (x.startsWith('24:') ? '00:00' : x.padStart(5, '0'));
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: s.name,
    description: s.tagline,
    url: s.url,
    logo: abs(s.logo.store),
    image: abs(s.logo.og),
    telephone: `+${s.contact.whatsapp}`,
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: t(s.hours.open),
        closes: t(s.hours.close),
      },
    ],
  };
  if (s.contact.email) ld.email = s.contact.email;
  if (s.contact.address) ld.address = { '@type': 'PostalAddress', streetAddress: s.contact.address, addressCountry: 'MA' };
  const same = Object.values(s.social).filter((v): v is string => !!v && /^https:\/\//.test(v));
  if (same.length) ld.sameAs = same;
  const cities = s.cities.filter((c) => c.open).map((c) => ({ '@type': 'City', name: c.name }));
  if (cities.length) ld.areaServed = cities;
  return ld;
}
