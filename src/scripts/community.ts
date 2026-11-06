// الإعجابات وتقييمات الزوار: تعمل فوق الصفحات الثابتة. إن لم تتوفر واجهة /api (لم تُفعَّل قاعدة D1 بعد)
// يبقى الموقع كما هو تماماً: لا قلوب ولا نموذج، ولا خطأ يظهر للزائر.
import { summaryFrom, type Thresholds } from '../lib/reviews';
import { starsHtml, isTrusted } from '../lib/community';

interface Cfg {
  lang: string; likes: boolean; reviews: boolean; minLikes: number; th: Thresholds;
  crown: { enabled: boolean; minAvg: number; minPoints: number }; turnstile: string; t: Record<string, string>;
}
interface Data { likes: Record<string, number>; reviews: Record<string, { count: number; sum: number; points: number }> }

let cfg: Cfg | null = null;
try { cfg = JSON.parse(document.body.dataset.community || 'null'); } catch { cfg = null; }

const T = (k: string, vars: Record<string, string | number> = {}) =>
  (cfg?.t[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(vars[n] ?? `{${n}}`));
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const rand = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const deviceId = () => {
  let d = store.get('awima_device');
  if (!d || !/^[A-Za-z0-9_-]{8,80}$/.test(d)) { d = rand(); store.set('awima_device', d); }
  return d;
};
const likedSet = (): Set<string> => { try { return new Set(JSON.parse(store.get('awima_liked') || '[]')); } catch { return new Set(); } };
const saveLiked = (s: Set<string>) => store.set('awima_liked', JSON.stringify([...s]));
const fmt = (n: number) => (cfg?.lang === 'fr' ? String(n).replace('.', ',') : String(n));

async function loadData(): Promise<Data | null> {
  try {
    const cached = sessionStorage.getItem('awima_community');
    if (cached) { const c = JSON.parse(cached); if (Date.now() - c.t < 60_000) return c.d; }
  } catch { /* ignore */ }
  try {
    const r = await fetch('/api/community');
    if (!r.ok) return null;
    const d = (await r.json()) as Data;
    try { sessionStorage.setItem('awima_community', JSON.stringify({ t: Date.now(), d })); } catch { /* ignore */ }
    return d;
  } catch { return null; }
}

// ---------- التقييمات: دمج ما في البناء مع تقييمات الزوار المعتمدة ----------
function mergedSummary(el: HTMLElement, data: Data) {
  const pid = el.dataset.pid!;
  const x = data.reviews[pid] ?? { count: 0, sum: 0, points: 0 };
  const count = Number(el.dataset.rvCount || 0) + x.count;
  const points = Number(el.dataset.rvPoints || 0) + x.points;
  const sum = Number(el.dataset.rvSum || 0) + x.sum;
  return summaryFrom(count, points, sum, cfg!.th);
}
function paintRating(el: HTMLElement, data: Data) {
  const s = mergedSummary(el, data);
  const tierLabel = s.tier === 'none' ? '' : T(`reviews.tier.${s.tier}`);
  if (s.tier === 'none') el.removeAttribute('data-tier'); else el.dataset.tier = s.tier;
  const trusted = isTrusted(s, el.dataset.trusted === '1', cfg!.crown);
  const rate = el.querySelector<HTMLElement>('.rate');
  if (rate) {
    rate.hidden = s.count === 0;
    rate.querySelector('.st')!.innerHTML = starsHtml(s.average);
    rate.querySelector('.avg')!.textContent = fmt(s.average);
    rate.querySelector('.n')!.textContent = `(${s.count})`;
    rate.querySelector('.tier')!.textContent = tierLabel;
    const tpl = rate.dataset.aria;
    if (tpl) rate.setAttribute('aria-label', tpl.replace('{avg}', fmt(s.average)).replace('{count}', String(s.count)).replace('{tier}', tierLabel));
    const crown = el.querySelector<HTMLElement>('.crown');
    if (crown) crown.hidden = !trusted;
  }
  const sum = el.querySelector<HTMLElement>('.rv-sum');
  if (sum) {
    sum.hidden = s.count === 0;
    sum.querySelector('.st')!.innerHTML = starsHtml(s.average);
    sum.querySelector('.avg')!.textContent = fmt(s.average);
    sum.querySelector('.sum-text')!.textContent = T('reviews.summary', { avg: fmt(s.average), count: s.count });
    sum.querySelector('.rv-tier')!.textContent = tierLabel;
    el.querySelector<HTMLElement>('.rv-explain')!.hidden = s.count === 0;
    el.querySelector<HTMLElement>('.rv-empty')!.hidden = s.count > 0;
  }
  const line = document.querySelector<HTMLElement>(`[data-pid-crown="${el.dataset.pid}"]`);
  if (line) line.hidden = !trusted;
}

// ---------- الإعجابات ----------
function paintLikes(data: Data) {
  const liked = likedSet();
  document.querySelectorAll<HTMLButtonElement>('[data-like]').forEach((b) => {
    const pid = b.dataset.like!;
    const n = data.likes[pid] ?? 0;
    setLike(b, liked.has(pid), n);
    b.hidden = false;
  });
}
function setLike(b: HTMLButtonElement, on: boolean, n: number) {
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', T(on ? 'community.unlike' : 'community.like'));
  b.querySelector('.heart')!.textContent = on ? '♥' : '♡';
  b.querySelector('.lc')!.textContent = n >= Math.max(1, cfg!.minLikes) ? String(n) : '';
  b.dataset.n = String(n);
}
function bindLikes() {
  document.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-like]');
    if (!b || b.disabled) return;
    e.preventDefault();
    const pid = b.dataset.like!;
    const liked = likedSet();
    const was = liked.has(pid);
    const n0 = Number(b.dataset.n || 0);
    // تحديث فوري ثم تأكيد من الخادم
    if (was) liked.delete(pid); else liked.add(pid);
    setLike(b, !was, Math.max(0, n0 + (was ? -1 : 1)));
    b.disabled = true;
    try {
      const r = await fetch('/api/like', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: pid, device: deviceId(), on: !was }) });
      if (!r.ok) throw new Error(String(r.status));
      const { count } = await r.json();
      saveLiked(liked);
      document.querySelectorAll<HTMLButtonElement>(`[data-like="${pid}"]`).forEach((x) => setLike(x, !was, count));
      try { sessionStorage.removeItem('awima_community'); } catch { /* ignore */ }
    } catch {
      setLike(b, was, n0); // تراجع
    } finally { b.disabled = false; }
  });
}

// ---------- صفحة المنتج: تقييمات الزوار + النموذج ----------
async function productReviews(section: HTMLElement) {
  const pid = section.dataset.pid!;
  try {
    const r = await fetch(`/api/reviews?product=${encodeURIComponent(pid)}`);
    if (!r.ok) return;
    const { reviews } = await r.json() as { reviews: { rating: number; author: string | null; comment: string | null; buyer: string; ts: number }[] };
    const ul = section.querySelector('#rv-list')!;
    for (const x of reviews) {
      const li = document.createElement('li'); li.className = 'rv';
      const h = document.createElement('div'); h.className = 'rv-h';
      const name = document.createElement('strong'); name.textContent = x.author || T('reviews.customer'); h.append(name);
      if (x.buyer === 'verified') { const v = document.createElement('span'); v.className = 'rv-b'; v.textContent = T('reviews.verified'); h.append(v); }
      const st = document.createElement('span'); st.className = 'rv-s'; st.setAttribute('role', 'img'); st.setAttribute('aria-label', T('reviews.stars', { n: x.rating }));
      st.textContent = '★'.repeat(x.rating) + '☆'.repeat(5 - x.rating); h.append(st);
      const tm = document.createElement('time'); tm.textContent = new Date(x.ts).toISOString().slice(0, 10); h.append(tm);
      li.append(h);
      if (x.comment) { const p = document.createElement('p'); p.textContent = x.comment; li.append(p); }
      ul.prepend(li);
    }
  } catch { /* ignore */ }
}

function buildForm(section: HTMLElement) {
  const slot = section.querySelector<HTMLElement>('#rv-form-slot');
  if (!slot) return;
  const pid = section.dataset.pid!;
  const token = new URLSearchParams(location.search).get('rv') || '';
  if (!token && store.get(`awima_reviewed_${pid}`)) { slot.hidden = false; slot.innerHTML = ''; const p = document.createElement('p'); p.className = 'rv-msg ok'; p.textContent = T('community.already'); slot.append(p); return; }
  const form = document.createElement('form');
  form.className = 'rv-form';
  form.noValidate = true;
  const h = document.createElement('h3'); h.textContent = T('community.formTitle');
  const pick = document.createElement('div'); pick.className = 'rv-pick'; pick.setAttribute('role', 'radiogroup'); pick.setAttribute('aria-label', T('community.yourRating'));
  let rating = 0;
  const btns: HTMLButtonElement[] = [];
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '★'; b.setAttribute('aria-label', T('reviews.stars', { n: i }));
    b.addEventListener('click', () => { rating = i; btns.forEach((x, j) => x.classList.toggle('on', j < i)); });
    btns.push(b); pick.append(b);
  }
  const label = (text: string, el: HTMLElement) => { const l = document.createElement('label'); const s = document.createElement('span'); s.textContent = text; l.append(s, el); return l; };
  const name = document.createElement('input'); name.type = 'text'; name.maxLength = 40; name.autocomplete = 'given-name';
  const comment = document.createElement('textarea'); comment.maxLength = 500;
  const hp = document.createElement('div'); hp.className = 'rv-hp'; hp.setAttribute('aria-hidden', 'true');
  const hpIn = document.createElement('input'); hpIn.type = 'text'; hpIn.name = 'website'; hpIn.tabIndex = -1; hpIn.autocomplete = 'off'; hp.append(hpIn);
  const note = document.createElement('p'); note.className = 'note'; note.textContent = token ? T('community.verifiedNote') : T('community.pendingNote');
  const msg = document.createElement('p'); msg.className = 'rv-msg'; msg.setAttribute('aria-live', 'polite');
  const send = document.createElement('button'); send.type = 'submit'; send.className = 'btn btn-cart'; send.textContent = T('community.send');
  form.append(h, label(T('community.yourRating'), pick), label(T('community.name'), name), label(T('community.comment'), comment), hp);
  if (cfg!.turnstile && !token) {
    const ts = document.createElement('div'); ts.className = 'cf-turnstile'; ts.dataset.sitekey = cfg!.turnstile; form.append(ts);
    const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; sc.async = true; document.head.append(sc);
  }
  form.append(note, send, msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'rv-msg';
    if (!rating) { msg.className = 'rv-msg err'; msg.textContent = T('community.pickRating'); return; }
    send.disabled = true; send.textContent = T('community.sending');
    try {
      const r = await fetch('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        product: pid, rating, author: name.value, comment: comment.value, device: deviceId(), website: hpIn.value,
        token,
        turnstile: (form.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value || '',
      }) });
      if (r.status === 201 || r.status === 409) {
        store.set(`awima_reviewed_${pid}`, '1');
        const body = r.status === 201 ? await r.json().catch(() => ({})) : {};
        slot.innerHTML = ''; const p = document.createElement('p'); p.className = 'rv-msg ok';
        p.textContent = T(r.status !== 201 ? 'community.already' : body.verified && body.status === 'approved' ? 'community.thanksVerified' : 'community.thanks'); slot.append(p);
        try { sessionStorage.removeItem('awima_community'); } catch { /* ignore */ }
        return;
      }
      const err = (await r.json().catch(() => ({}))).error;
      msg.className = 'rv-msg err';
      msg.textContent = T(err === 'bad_token' || err === 'expired_token' ? 'community.tokenBad' : err === 'token_used' ? 'community.tokenUsed' : r.status === 429 ? 'community.tooMany' : err === 'links_not_allowed' ? 'community.noLinks' : err === 'captcha' ? 'community.captcha' : 'community.error');
    } catch {
      msg.className = 'rv-msg err'; msg.textContent = T('community.error');
    }
    send.disabled = false; send.textContent = T('community.send');
  });
  slot.append(form);
  slot.hidden = false;
}

async function init() {
  if (!cfg) return;
  const data = await loadData();
  if (!data) return; // الواجهة غير مفعّلة: الموقع كما هو
  (window as unknown as { __awimaData?: Data }).__awimaData = data;
  window.dispatchEvent(new CustomEvent('awima:data', { detail: data }));
  document.querySelectorAll<HTMLElement>('.pc[data-pid], .reviews[data-pid]').forEach((el) => paintRating(el, data));
  if (cfg.likes) { paintLikes(data); bindLikes(); }
  const section = document.querySelector<HTMLElement>('.reviews[data-pid]');
  if (section && cfg.reviews) { productReviews(section); buildForm(section); }
}
init();
