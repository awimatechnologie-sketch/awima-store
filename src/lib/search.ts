// توحيد النص للبحث: يعمل بالعربية والفرنسية والأرقام الهندية، ويُستعمل في المتصفح وفي الاختبارات.

/** يزيل التشكيل والتطويل، يوحّد الألف والياء والتاء المربوطة، الأرقام الهندية، ونبرات الحروف اللاتينية */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // é → e
    .replace(/[ً-ٰٟـ]/g, '') // التشكيل + الألف الخنجرية + التطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ٠-٩
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ۰-۹
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** كل كلمات البحث يجب أن تظهر في النص (AND)، بغض النظر عن الترتيب */
export function matches(query: string, haystackNormalized: string): boolean {
  const terms = normalize(query).split(' ').filter(Boolean);
  return terms.every((t) => haystackNormalized.includes(t));
}
