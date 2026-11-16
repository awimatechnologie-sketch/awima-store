import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrands, getBrandIds, countModels, modelBadges, modelLink, brandLink, screensWhatsapp, screensPhone } from '../src/services/screens.ts';

test('الشاشات: رقم واتساب الصحيح', () => {
  assert.equal(screensWhatsapp(), '212610680508');
  assert.equal(screensPhone(), '0610680508');
});

test('الشاشات: العلامات والموديلات ظاهرة وبأسعار صالحة', () => {
  const brands = getBrands('ar');
  assert.ok(brands.length >= 20);
  assert.equal(new Set(getBrandIds()).size, brands.length);
  const ids = new Set();
  for (const b of brands) {
    assert.ok(b.models.length > 0 && b.image.startsWith('/'));
    for (const m of b.models) {
      assert.ok(m.price > 0 && Number.isInteger(m.price), m.id);
      assert.ok(!ids.has(m.id), 'معرّف مكرر ' + m.id);
      ids.add(m.id);
    }
  }
  assert.equal(countModels(), ids.size);
});

test('الشاشات: سعر البيع = سعر الشراء + 150 (عينة من الملف الأصلي) ولا يُخزَّن سعر الشراء', () => {
  const all = getBrands('ar').flatMap((b) => b.models);
  const m = all.find((x) => x.brand === 'iphone' && x.name === '5S' && x.color === 'Black');
  assert.equal(m.price, 95 + 150);
  assert.ok(all.every((x) => !('buy' in x) && !('raw' in x)));
});

test('الشاشات: الموديل غير المتوفر أو بلا سعر لا يظهر', () => {
  const names = getBrands('ar').flatMap((b) => b.models.map((m) => `${b.id} ${m.name}`));
  assert.ok(!names.includes('huawei NOVA 14 ULTRA'));
});

test('الشاشات: روابط واتساب برقم الشاشات ونص الموديل', () => {
  const b = getBrands('fr').find((x) => x.id === 'samsung');
  const url = modelLink(b.name, b.models[0], 'fr');
  assert.ok(url.startsWith('https://wa.me/212610680508?text='));
  assert.ok(decodeURIComponent(url).includes(b.models[0].name));
  assert.ok(decodeURIComponent(brandLink('Samsung', 'ar')).includes('Samsung'));
  assert.ok(Array.isArray(modelBadges(b.models[0], 'ar')));
});
