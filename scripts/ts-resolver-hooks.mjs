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
