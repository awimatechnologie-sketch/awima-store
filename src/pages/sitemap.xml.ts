import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { getAllProducts } from '../services/products';
import { buildSitemap } from '../lib/seo';
import { localePath } from '../i18n';

// كل صفحة بالعربية (بلا بادئة) وبالفرنسية (/fr) مع روابط hreflang المتبادلة
const stripFr = (p: string) => p.replace(/^\/fr(?=\/|$)/, '') || '/';

export const GET: APIRoute = () => {
  const arPaths = ['/', '/products', '/awima-box', '/about', '/contact', ...getAllProducts().map((p) => `/products/${p.slug}`)];
  const paths = [...arPaths, ...arPaths.map((p) => localePath('fr', p))];
  const xml = buildSitemap(site.url, paths, (p) => {
    const base = stripFr(p);
    return [
      { lang: 'ar', path: base },
      { lang: 'fr', path: localePath('fr', base) },
      { lang: 'x-default', path: base },
    ];
  });
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
