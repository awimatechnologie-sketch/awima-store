import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { buildManifest } from '../lib/pwa';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildManifest({ name: site.name, tagline: site.tagline, colors: site.colors })), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
