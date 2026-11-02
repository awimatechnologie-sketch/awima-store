// سكربت عام لكل الصفحات: السلة، شريط العروض، حالة أوقات العمل.
import { addToCart, cartCount, pruneCart } from '../lib/cart';
import { isOpenNow } from '../lib/hours';

function updateBadges() {
  const n = cartCount();
  document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => {
    el.textContent = String(n);
    el.hidden = n === 0;
  });
}

let toastTimer: number | undefined;
function toast(msg: string) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 2200);
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLElement>('[data-add-to-cart]');
  if (!btn) return;
  e.preventDefault();
  addToCart(btn.dataset.addToCart!);
  toast(`أُضيف «${btn.dataset.name ?? 'المنتج'}» إلى السلة`);
});
// أي منتج حُذف أو أُخفي من المتجر يُزال من سلة الزبون (وتُعرض له رسالة في صفحة السلة)
const validIds = document.body.dataset.validIds;
if (validIds) pruneCart(new Set(validIds.split(',')));

window.addEventListener('cart:change', updateBadges);
window.addEventListener('storage', updateBadges);
updateBadges();

function updateHours() {
  document.querySelectorAll<HTMLElement>('[data-hours]').forEach((el) => {
    const st = isOpenNow(el.dataset.open ?? '', el.dataset.close ?? '');
    const s = el.querySelector<HTMLElement>('[data-hours-status]');
    if (!s || st === null) return;
    s.textContent = st ? 'مفتوح الآن' : 'مغلق الآن';
    s.dataset.state = st ? 'open' : 'closed';
  });
}
updateHours();
window.setInterval(updateHours, 60_000);

// تدوير رسائل العروض إن وُجد أكثر من عرض
const anns = Array.from(document.querySelectorAll<HTMLElement>('[data-ann]'));
if (anns.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let i = 0;
  window.setInterval(() => {
    anns[i].classList.remove('active');
    i = (i + 1) % anns.length;
    anns[i].classList.add('active');
  }, 5000);
}
