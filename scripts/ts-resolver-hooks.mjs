export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    const relative = specifier.startsWith('.') || specifier.startsWith('/');
    if (relative && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'ERR_UNSUPPORTED_DIR_IMPORT')) {
      for (const s of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return await nextResolve(s, context);
        } catch {
          /* جرّب التالي */
        }
      }
    }
    throw e;
  }
}

// Vite يسمح باستيراد JSON مباشرة؛ في Node نضيف سمة type: json تلقائياً للاختبارات
export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
  return nextLoad(url, context);
}
