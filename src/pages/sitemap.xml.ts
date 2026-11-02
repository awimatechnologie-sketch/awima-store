import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { getAllProducts } from '../services/products';
import { buildSitemap } from '../lib/seo';

export const GET: APIRoute = () => {
  const paths = ['/', '/products', '/awima-box', '/about', '/contact', ...getAllProducts().map((p) => `/products/${p.slug}`)];
  return new Response(buildSitemap(site.url, paths), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
