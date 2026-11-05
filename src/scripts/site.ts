// سكربت عام لكل الصفحات: السلة، شريط العروض، حالة أوقات العمل.
import { addToCart, cartCount, pruneCart } from '../lib/cart';
import { maxQty } from '../lib/stock';
import { t, langOf } from '../i18n';

// لغة الصفحة من وسم html (ar/fr)
const lang = langOf(document.documentElement.lang);
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
  // data-stock فارغ/غير موجود = مخزون غير محدود
  const raw = btn.dataset.stock;
  const max = maxQty(raw === undefined || raw === '' ? null : Number(raw));
  const name = btn.dataset.name ?? 'المنتج';
  if (addToCart(btn.dataset.addToCart!, 1, max)) toast(t(lang, 'toast.added', { name }));
  else toast(t(lang, 'toast.max', { name, n: max }));
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
    s.textContent = t(lang, st ? 'hours.open' : 'hours.closed');
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

// زر تبديل اللغة يحافظ على الفلاتر (?q=...) والمرساة (#q) عند الانتقال إلى نفس الصفحة بلغة أخرى
const LANG_KEY = 'awima_lang_v1';
const savedLang = (): string | null => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } };
document.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]').forEach((a) => {
  a.href = a.href.split(/[?#]/)[0] + location.search + location.hash;
  // نتذكّر اختيار الزائر الصريح فقط (النقر على الزر)
  a.addEventListener('click', () => { try { localStorage.setItem(LANG_KEY, a.hreflang); } catch {} });
});
// من فضّل الفرنسية يُوجَّه من الصفحة الرئيسية العربية فقط (روابط الصفحات الأخرى تُحترم كما هي)
if (location.pathname === '/' && savedLang() === 'fr') location.replace('/fr/' + location.search + location.hash);

// ---- PWA: تسجيل الـ Service Worker (في الإنتاج فقط) وزر «تثبيت التطبيق» ----
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installEvent: InstallEvent | null = null;
const installBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-install-app]'));
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e as InstallEvent;
  installBtns.forEach((b) => (b.hidden = false));
});
installBtns.forEach((b) =>
  b.addEventListener('click', async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    installEvent = null;
    installBtns.forEach((x) => (x.hidden = true));
  })
);
window.addEventListener('appinstalled', () => installBtns.forEach((b) => (b.hidden = true)));
