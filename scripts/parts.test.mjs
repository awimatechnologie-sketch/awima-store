import test from 'node:test';
import assert from 'node:assert/strict';
import { getParts, getPartCats, getPartsText, partsWhatsapp, waBase } from '../src/services/parts.ts';

test('القطع: واتساب والبيانات صالحة', () => {
  assert.equal(partsWhatsapp(), '212610680508');
  assert.ok(waBase().startsWith('https://wa.me/212610680508?text='));
  const parts = getParts();
  assert.ok(parts.length >= 100);
  const ids = new Set();
  for (const p of parts) {
    assert.ok(p.retail > 0 && p.wholesale > 0 && p.wholesale <= p.retail, p.id);
    assert.ok(!ids.has(p.id)); ids.add(p.id);
  }
});
test('القطع: كل قطعة لها تصنيف ظاهر والنصوص بالعربية والفرنسية', () => {
  const cats = new Set(getPartCats('ar').map((c) => c.id));
  assert.ok(getParts().every((p) => cats.has(p.cat)));
  assert.equal(getPartCats('fr').length, cats.size);
  const ar = getPartsText('ar'), fr = getPartsText('fr');
  assert.ok(ar.steps.length === 4 && fr.steps.length === 4 && ar.quality.length > 0);
  assert.notEqual(ar.title, fr.title);
});
