// نص بسيط من لوحة الإدارة: سطر فارغ = فقرة جديدة، والأسطر التي تبدأ بـ "- " تصبح قائمة.
export type Block = { type: 'p'; text: string } | { type: 'ul'; items: string[] };

export function parseBlocks(txt?: string | null): Block[] {
  const out: Block[] = [];
  for (const chunk of String(txt ?? '').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-•]\s+/.test(l))) {
      out.push({ type: 'ul', items: lines.map((l) => l.replace(/^[-•]\s+/, '')) });
    } else {
      out.push({ type: 'p', text: lines.join(' ') });
    }
  }
  return out;
}
