// أدوات الواجهة: تهريب HTML (منع XSS)، عرض Markdown مبسّط وآمن، إشعارات، ألوان.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Markdown مبسّط: **عريض**، _مائل_، `كود`، قوائم (• - 1.)، فقرات. يُهرَّب النص أولاً فلا يمكن حقن HTML.
export function markdown(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,!؟،]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push('</ul>'); list = null; } };
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*(?:[•\-*]|\d+\.)\s+(.*)$/);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list && /^\s{2,}\S/.test(raw) && out.length) { out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, `<br>${inline(line.trim())}</li>`); continue; }
    close();
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('');
}

export function toast(message, kind = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 4200);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const pct = (x) => `${Math.round(x * 100)}%`;

// لون حسب القيمة: أخضر = جيد، أصفر = متوسط، أحمر = سيئ (عكسي للمخاطر)
export const goodColor = (v) => (v >= 0.8 ? 'var(--good)' : v >= 0.5 ? 'var(--warn)' : 'var(--bad)');
export const riskColor = (v) => (v >= 0.6 ? 'var(--bad)' : v >= 0.35 ? 'var(--warn)' : 'var(--good)');
export const scoreColor = (s) => (s >= 90 ? 'var(--good)' : s >= 80 ? 'var(--accent)' : s >= 75 ? 'var(--warn)' : 'var(--bad)');
export const PRIORITY_COLOR = { 'عالية': 'var(--bad)', 'متوسطة': 'var(--warn)', 'عادية': 'var(--good)' };

export function animateBars(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => $$('[data-w]', root).forEach((el) => { el.style.width = el.dataset.w; })));
}
