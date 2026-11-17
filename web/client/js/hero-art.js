// رسمة صفحة الدخول: طالب مرهق من كثرة الواجبات، وأمامه المساعد الأكاديمي يرتّب له مهامه.
//
// ليش SVG مكتوب بالكود بدل صورة PNG؟
// - حجمه صغير (بضعة KB) ويبقى حاداً على أي شاشة.
// - ألوانه وحركته تُدار من CSS، فنقدر نوقف الحركة لمن يفعّل "تقليل الحركة".
// - ما يحتاج مكتبة ولا ملف خارجي، فيمشي مع Content-Security-Policy الحالي.
//
// القصة تُقرأ من اليمين لليسار (مثل العربي):
// يمين = التوتر (أوراق طايرة، كتب متكدسة، ألوان دافية)
// يسار  = الحل (بطاقة AgentForStudent مرتبة، ألوان باردة)
//
// ملاحظة تقنية: أي عنصر عليه animation بـ CSS transform لازم ما يكون عليه transform
// كـ attribute، لأن CSS يطغى عليه. لذلك نلف العنصر بـ <g> خارجي للحركة وداخلي للموقع.

const SKIN = '#e9b48f';
const SKIN_SHADE = '#d9a07a';
const HAIR = '#2b2340';
const INK = '#1b2a4a';

/** أيقونة الكتاب (نفس شعار الموقع) بخط أبيض، لاستخدامها داخل الرسمة. */
const bookIcon = (x, y) => `
  <g transform="translate(${x} ${y})" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round">
    <path d="M4 5.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4z"/>
    <path d="M20 5.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z"/>
  </g>`;

/** ورقة واجب طايرة (جزء من "التوتر"). */
function paper({ x, y, rotate, w, h, label, badge }) {
  return `
  <g class="art-float${badge ? '' : ' d3'}">
    <g transform="translate(${x} ${y}) rotate(${rotate})">
      <rect width="${w}" height="${h}" rx="6" fill="#fff" stroke="#ffd3c2" stroke-width="1.5"/>
      <path d="M10 16h${w - 20}M10 27h${w - 26}M10 38h${w - 22}" stroke="#ffc6b0" stroke-width="3" stroke-linecap="round"/>
      <text x="${w - 10}" y="${h - 10}" text-anchor="end" font-size="11" font-weight="600" fill="#c2502c">${label}</text>
      ${badge
        ? `<circle cx="${w - 2}" cy="2" r="11" fill="#ff6b4a"/>
           <path d="M${w - 2} -3.5v6M${w - 2} 7v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`
        : `<g transform="translate(${w - 2} 2)" stroke="#ff8a65" stroke-width="2" stroke-linecap="round">
             <circle r="11" fill="#fff"/><path d="M0 -5.5V0l3.5 2.5" fill="none"/>
           </g>`}
    </g>
  </g>`;
}

/** كتب متكدسة على المكتب: كل كتاب [x, y, عرض, لون]. */
function bookStack() {
  const books = [
    [440, 284, 92, '#ff8a65'],
    [447, 268, 82, '#ffc56b'],
    [438, 252, 90, '#8fb3ff'],
    [450, 236, 76, '#ff9fb0'],
  ];
  const rows = books.map(([x, y, w, c]) => `
    <rect x="${x}" y="${y}" width="${w}" height="16" rx="3" fill="${c}"/>
    <rect x="${x + 8}" y="${y + 3}" width="3" height="10" rx="1.5" fill="#fff" opacity=".7"/>`).join('');
  // الكتاب الأعلى مايل، كأنه على وشك يطيح: لمسة بصرية للفوضى
  return `${rows}
    <g transform="rotate(-9 486 226)">
      <rect x="446" y="219" width="80" height="15" rx="3" fill="#7ad3c9"/>
      <rect x="454" y="222" width="3" height="9" rx="1.5" fill="#fff" opacity=".7"/>
    </g>`;
}

/** الطالب: كرسي، جسم، يدين على راسه، ووجه قلقان. */
function student() {
  return `
  <rect x="292" y="146" width="136" height="174" rx="28" fill="#cfdcf7"/>
  <path d="M290 300C290 245 312 210 360 206C408 210 430 245 430 300Z" fill="url(#afs-hoodie)"/>
  <path d="M335 208Q360 230 385 208" fill="none" stroke="#f0673f" stroke-width="4" stroke-linecap="round"/>
  <path d="M352 216l-2 24M368 216l2 24" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".85"/>
  <rect x="350" y="180" width="20" height="26" rx="6" fill="${SKIN_SHADE}"/>

  <!-- الذراعين مرفوعة لجوانب الراس: وضعية "ماسك راسه من الضغط" -->
  <path d="M305 240Q284 206 320 174M415 240Q436 206 400 174" fill="none" stroke="#ff8a65" stroke-width="24" stroke-linecap="round"/>

  <ellipse cx="360" cy="150" rx="37" ry="41" fill="${SKIN}"/>
  <path d="M323 150C318 112 340 100 362 101C388 102 402 120 397 150C390 132 376 124 360 126C346 124 330 134 323 150Z" fill="${HAIR}"/>
  <path d="M343 106L336 91L352 102ZM358 102L362 86L370 101ZM378 106L391 95L388 111Z" fill="${HAIR}"/>

  <!-- الحواجب: الطرف الداخلي مرفوع = تعبير قلق -->
  <path d="M339 139L353 133M381 139L367 133" stroke="${HAIR}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="346" cy="149" r="3.2" fill="${HAIR}"/>
  <circle cx="374" cy="149" r="3.2" fill="${HAIR}"/>
  <path d="M340 157q6 3.5 12 0M368 157q6 3.5 12 0" fill="none" stroke="#c7845f" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M349 173q5.5 -4 11 0q5.5 4 11 0" fill="none" stroke="#8a3d2b" stroke-width="2.2" stroke-linecap="round"/>

  <ellipse cx="322" cy="168" rx="11" ry="13" fill="${SKIN}"/>
  <ellipse cx="398" cy="168" rx="11" ry="13" fill="${SKIN}"/>

  <path class="art-drop" d="M405 110C409 118 412 123 412 127a7 7 0 0 1 -14 0c0 -4 3 -9 7 -17z" fill="#8fd0ff"/>
  <path class="art-jitter" d="M322 62c10 -22 40 -22 44 -4c4 18 -30 20 -26 2c4 -18 44 -24 50 -4c6 20 -30 24 -22 4c6 -14 30 -12 34 2"
        fill="none" stroke="#ff7a55" stroke-width="3" stroke-linecap="round"/>`;
}

/** المكتب واللابتوب (ظهر الشاشة عليه شعار المساعد) والكوب. */
function deskAndLaptop() {
  return `
  <rect x="60" y="298" width="480" height="14" rx="7" fill="#fff" stroke="#dbe5f7"/>
  <rect x="72" y="312" width="456" height="10" fill="#e3ebfa"/>
  <rect x="92" y="322" width="12" height="82" rx="4" fill="#d3def5"/>
  <rect x="496" y="322" width="12" height="82" rx="4" fill="#d3def5"/>

  <rect x="290" y="212" width="140" height="88" rx="10" fill="#eef3ff" stroke="#cdd9f3" stroke-width="2"/>
  <rect x="280" y="292" width="160" height="8" rx="4" fill="#d6e1f6"/>
  <circle class="art-pulse" cx="360" cy="256" r="46" fill="url(#afs-glow)"/>
  <circle cx="360" cy="256" r="20" fill="url(#afs-brand)"/>
  ${bookIcon(348, 243)}

  <rect x="246" y="268" width="26" height="30" rx="5" fill="#fff" stroke="#ffb59b" stroke-width="2"/>
  <path d="M272 276c10 0 10 14 0 14" fill="none" stroke="#ffb59b" stroke-width="2"/>
  <path class="art-steam" d="M254 260c-4 -6 4 -10 0 -16" fill="none" stroke="#c9d6ee" stroke-width="2" stroke-linecap="round"/>
  <path class="art-steam d2" d="M264 260c-4 -6 4 -10 0 -16" fill="none" stroke="#c9d6ee" stroke-width="2" stroke-linecap="round"/>`;
}

/** الشعاع اللي يطلع من اللابتوب للبطاقة: يمثل "الوكيل يشتغل". */
function beam() {
  const sparkle = (x, y, d = '') => `
    <g transform="translate(${x} ${y})">
      <path class="art-twinkle${d}" d="M0 -6L1.5 -1.5L6 0L1.5 1.5L0 6L-1.5 1.5L-6 0L-1.5 -1.5Z" fill="#1fb6c9"/>
    </g>`;
  return `
  <path class="art-beam" d="M322 244C292 238 268 206 240 182" fill="none" stroke="url(#afs-beam)"
        stroke-width="2.5" stroke-dasharray="4 7" stroke-linecap="round"/>
  ${sparkle(296, 226)}${sparkle(262, 196, ' d2')}`;
}

/** بطاقة الحل: مهام مرتبة + خطة مذاكرة + المعدل. اتجاهها من اليمين لليسار. */
function solutionCard() {
  // [عنوان المهمة، الأولوية، لون خلفية الشارة، لون نص الشارة]
  const tasks = [
    ['تسليم تقرير الشبكات', 'عالية', '#ffe7df', '#c2502c'],
    ['مذاكرة الخوارزميات', 'متوسطة', '#fff1d2', '#9a6200'],
    ['واجب الإحصاء', 'منخفضة', '#e2f6f1', '#137a5c'],
  ];
  const rows = tasks.map(([title, prio, bg, fg], i) => {
    const y = 68 + i * 30;
    const mark = i === 0
      ? `<circle cx="188" cy="${y + 11}" r="9" fill="#16a36b"/>
         <path d="M184 ${y + 11}l3 3l5 -6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<circle cx="188" cy="${y + 11}" r="9" fill="#fff" stroke="#c8d4ea" stroke-width="1.5"/>
         <text x="188" y="${y + 15}" text-anchor="middle" font-size="10" font-weight="600" fill="#5d6b88">${i + 1}</text>`;
    return `${mark}
      <text x="172" y="${y + 15}" text-anchor="end" font-size="11" font-weight="500" fill="${INK}">${title}</text>
      <rect x="14" y="${y + 3}" width="42" height="16" rx="8" fill="${bg}"/>
      <text x="35" y="${y + 14.5}" text-anchor="middle" font-size="8.5" font-weight="600" fill="${fg}">${prio}</text>`;
  }).join('');

  const bars = [18, 30, 22, 36, 26]
    .map((h, i) => `<rect x="${18 + i * 22}" y="${200 - h}" width="13" height="${h}" rx="4" fill="url(#afs-brand)"/>`)
    .join('');

  return `
  <g class="art-float d2">
    <g transform="translate(22 56)">
      <rect width="216" height="214" rx="16" fill="#fff" filter="url(#afs-shadow)"/>
      <rect x="174" y="14" width="28" height="28" rx="8" fill="url(#afs-brand)"/>
      ${bookIcon(176, 16)}
      <text x="164" y="27" text-anchor="end" font-size="12" font-weight="600" fill="${INK}">AgentForStudent</text>
      <text x="164" y="41" text-anchor="end" font-size="9.5" fill="#5d6b88">رتّبت لك مهام الأسبوع</text>
      <path d="M14 56H202" stroke="#edf1f9" stroke-width="1.5"/>
      ${rows}
      <path d="M14 162H202" stroke="#edf1f9" stroke-width="1.5"/>
      <text x="202" y="180" text-anchor="end" font-size="9.5" fill="#5d6b88">خطة المذاكرة</text>
      <g class="art-bars">${bars}</g>
      <rect x="146" y="186" width="56" height="20" rx="10" fill="#eaf0ff"/>
      <text x="174" y="200" text-anchor="middle" font-size="9.5" font-weight="600" fill="#2148b8">المعدل 3.62</text>
    </g>
  </g>`;
}

/**
 * يرجع الرسمة كاملة كنص SVG جاهز يندمج في صفحة الدخول (login.js).
 * @returns {string}
 */
export function heroArt() {
  return `
<svg class="art" viewBox="0 0 600 430" role="img" aria-labelledby="afs-art-t">
  <title id="afs-art-t">طالب مرهق من كثرة الواجبات، وأمامه المساعد الأكاديمي يرتّب مهامه ويبني له خطة مذاكرة</title>
  <defs>
    <linearGradient id="afs-sky" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe0cf"/><stop offset="1" stop-color="#d9e9ff"/>
    </linearGradient>
    <linearGradient id="afs-brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b6ef5"/><stop offset="1" stop-color="#1fb6c9"/>
    </linearGradient>
    <linearGradient id="afs-hoodie" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffa07e"/><stop offset="1" stop-color="#ff7a55"/>
    </linearGradient>
    <linearGradient id="afs-beam" gradientUnits="userSpaceOnUse" x1="322" y1="244" x2="240" y2="182">
      <stop offset="0" stop-color="#3b6ef5"/><stop offset="1" stop-color="#1fb6c9"/>
    </linearGradient>
    <radialGradient id="afs-glow">
      <stop offset="0" stop-color="#7fc8ff" stop-opacity=".55"/><stop offset="1" stop-color="#7fc8ff" stop-opacity="0"/>
    </radialGradient>
    <filter id="afs-shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#2f5fe0" flood-opacity=".16"/>
    </filter>
  </defs>

  <circle cx="370" cy="196" r="168" fill="url(#afs-sky)"/>
  <circle cx="540" cy="64" r="9" fill="#ffd0bb"/>
  <circle cx="560" cy="352" r="7" fill="#bfe0ff"/>
  <ellipse cx="300" cy="408" rx="240" ry="12" fill="${INK}" opacity=".06"/>

  ${paper({ x: 470, y: 46, rotate: 12, w: 64, h: 80, label: 'واجب', badge: true })}
  ${paper({ x: 500, y: 150, rotate: -10, w: 56, h: 70, label: 'تقرير', badge: false })}

  ${student()}
  ${deskAndLaptop()}
  ${bookStack()}
  ${beam()}
  ${solutionCard()}
</svg>`;
}
