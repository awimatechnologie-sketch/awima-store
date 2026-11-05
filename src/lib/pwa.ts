// manifest التطبيق (PWA) يُبنى من إعدادات الموقع، فيتبع الاسم والألوان من لوحة الإدارة.
export interface ManifestInput {
  name: string;
  tagline?: string;
  colors: { primary: string };
}

export function buildManifest(site: ManifestInput) {
  return {
    name: site.name,
    short_name: site.name.length > 12 ? site.name.split(/\s+/)[0] : site.name,
    description: site.tagline ?? '',
    id: '/',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ar',
    dir: 'rtl',
    background_color: '#ffffff',
    theme_color: site.colors.primary,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
