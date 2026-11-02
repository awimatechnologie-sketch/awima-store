import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { buildRobots } from '../lib/seo';

export const GET: APIRoute = () =>
  new Response(buildRobots(site.url), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
