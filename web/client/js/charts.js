// رسوم بيانية SVG مكتوبة يدوياً (بدون مكتبات): حلقة، رادار، خطي، أعمدة أفقية، دونات، خط مصغّر.
import { esc } from './ui.js';

let uid = 0;
const id = (p) => `${p}${++uid}`;

// حلقة تقدّم (Gauge)
export function ring(value, { size = 54, stroke = 6, color = 'var(--accent)', text = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return `<svg class="score-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(text)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${esc(text)}</text></svg>`;
}

// خط مصغّر (Sparkline) لتطور الإتقان عبر الترمات
export function sparkline(values, color = 'var(--accent)') {
  if (values.length < 2) return '';
  const W = 200, H = 36, p = 3;
  const x = (i) => p + (i * (W - 2 * p)) / (values.length - 1);
  const y = (v) => H - p - v * (H - 2 * p);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const g = id('sg');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${g}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".4"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${p},${H} ${pts.join(' ')} ${W - p},${H}" fill="url(#${g})"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// رسم خطي مع تعبئة (متوسط الدرجات لكل ترم)
export function lineChart(data, { min = 50, max = 100, color = '#1e4fb3' } = {}) {
  if (!data.length) return '';
  const W = 520, H = 330, L = 34, R = 14, T = 16, B = 30;
  const x = (i) => (data.length === 1 ? W / 2 : L + (i * (W - L - R)) / (data.length - 1));
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const g = id('lg');
  const grid = [min, (min + max) / 2, max].map((v) => `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="central">${Math.round(v)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="متوسط الدرجات لكل ترم">
    <defs><linearGradient id="${g}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <polygon points="${x(0)},${H - B} ${pts.map((p) => p.join(',')).join(' ')} ${x(data.length - 1)},${H - B}" fill="url(#${g})"/>
    <polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="var(--bg)" stroke="${color}" stroke-width="3"/><text x="${p[0]}" y="${p[1] - 12}" text-anchor="middle" style="fill:var(--text);font-weight:700">${data[i].value}</text><text x="${p[0]}" y="${H - 8}" text-anchor="middle">${esc(data[i].label)}</text>`).join('')}</svg>`;
}

// أعمدة أفقية (الدرجات حسب المقرر) بلون يعكس مستوى الدرجة
export function hBars(items, { max = 100, color } = {}) {
  const row = 30, L = 190, W = 560, H = items.length * row + 6;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="الدرجات حسب المقرر">
    ${items.map((it, i) => {
      const w = Math.max(2, ((W - L - 36) * it.value) / max), y = i * row + 4, c = color?.(it.value) ?? 'var(--accent)';
      return `<text x="${L - 8}" y="${y + 11}" text-anchor="end" dominant-baseline="central">${esc(it.label.length > 30 ? it.label.slice(0, 29) + '…' : it.label)}</text>
        <rect x="${L}" y="${y}" width="${W - L - 36}" height="20" rx="6" fill="var(--surface-2)"/>
        <rect x="${L}" y="${y}" width="${w}" height="20" rx="6" fill="${c}" opacity=".9"/>
        <text x="${L + w + 6}" y="${y + 11}" dominant-baseline="central" style="fill:var(--text);font-weight:700">${it.value}</text>`;
    }).join('')}</svg>`;
}

// رادار: طبقتان (الإتقان والمخاطر) لكل مجال
export function radar(axes, layers) {
  const S = 300, c = S / 2, R = 100, n = axes.length;
  const ang = (i) => -Math.PI / 2 - (i * 2 * Math.PI) / n; // عكس عقارب الساعة ليتناسب مع RTL
  const pt = (i, v) => [c + Math.cos(ang(i)) * R * v, c + Math.sin(ang(i)) * R * v];
  const poly = (vals) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${axes.map((_, i) => pt(i, k).join(',')).join(' ')}" fill="none" stroke="var(--border)"/>`).join('');
  const spokes = axes.map((_, i) => `<line x1="${c}" y1="${c}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="var(--border)"/>`).join('');
  const labels = axes.map((a, i) => { const [x, y] = pt(i, 1.28); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" style="fill:var(--text);font-size:12px;font-weight:700">${esc(a)}</text>`; }).join('');
  return `<svg class="chart radar" viewBox="0 0 ${S} ${S}" role="img" aria-label="رادار الإتقان وخطر التعثر">${rings}${spokes}
    ${layers.map((l) => `<polygon points="${poly(l.values)}" fill="${l.color}" fill-opacity=".22" stroke="${l.color}" stroke-width="2.5" stroke-linejoin="round"/>${l.values.map((v, i) => `<circle cx="${pt(i, v)[0]}" cy="${pt(i, v)[1]}" r="4" fill="${l.color}"/>`).join('')}`).join('')}
    ${labels}</svg>`;
}

// دونات: توزيع ساعات المذاكرة
export function donut(segments, { size = 200, stroke = 26, center = '' } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const len = (s.value / total) * c;
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - 3)} ${c}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(s.label)}: ${s.value}</title></circle>`;
    offset += len;
    return el;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="توزيع ساعات المذاكرة">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>${arcs}
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" style="fill:var(--text);font-size:24px;font-weight:800">${esc(center)}</text></svg>`;
}
