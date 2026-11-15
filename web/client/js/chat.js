import { api } from './api.js';
import { esc, $, markdown } from './ui.js';
import { icon } from './icons.js';

const SUGGESTIONS = [
  ['أهم مهامي', 'ما أهم مهامي ومواعيدي الآن؟ رتّبها لي.'],
  ['خطة مذاكرة', 'أعطني خطة مذاكرة لهذا الأسبوع بناءً على نقاط ضعفي.'],
  ['تحليل مستواي', 'حلّل مستواي في كل مجال وأين أحتاج التركيز.'],
  ['شرح خوارزمية SJF', 'اشرح لي خوارزمية SJF'],
  ['عملية حسابية', 'كم يساوي (85*3 + 90*4) / 7 ؟'],
];

let messages = null; // تبقى المحادثة عند التنقل بين الصفحات

export function renderChat(root, { profile, ai }) {
  if (!messages) {
    messages = [{ role: 'bot', text: `مرحباً ${profile.first_name}،\n\nمعدلك التراكمي الحالي **${profile.gpa.toFixed(2)}** من 4.00، وأنت في **${profile.level}**.\nيمكنني مساعدتك في متابعة **مهامك**، وتحليل **مستواك**، وإعداد **خطة مذاكرة**، وشرح المفاهيم الدراسية. تفضّل بكتابة سؤالك.` }];
  }

  root.innerHTML = `
  <div class="card chat fade-in">
    <div class="chat-head">
      <div style="flex:1"><h3>المساعد الأكاديمي</h3><small><span class="dot ${ai ? '' : 'off'}" id="ai-dot"></span><span id="ai-status">${ai ? 'متصل بخدمة الذكاء الاصطناعي' : 'الوضع المحلي'}</span></small></div>
      <button class="btn sm ghost" id="clear-chat" title="بدء محادثة جديدة">${icon('refresh')} محادثة جديدة</button>
    </div>
    <div class="msgs" id="msgs" aria-live="polite"></div>
    <div class="suggest" id="suggest">${SUGGESTIONS.map(([l, q]) => `<button type="button" data-q="${esc(q)}">${l}</button>`).join('')}</div>
    <form class="composer" id="composer">
      <textarea class="input" id="msg-input" rows="1" maxlength="2000" placeholder="اكتب سؤالك هنا" aria-label="رسالتك"></textarea>
      <button class="btn primary" id="send" type="submit" aria-label="إرسال">${icon('send')} إرسال</button>
    </form>
  </div>`;

  const list = $('#msgs', root), input = $('#msg-input', root), send = $('#send', root);
  let busy = false;

  const bubble = (m) => `<div class="msg ${m.role}"><div class="avatar">${m.role === 'bot' ? 'م' : esc(profile.first_name[0])}</div>
    <div><div class="bubble">${markdown(m.text)}</div>${m.tag ? `<span class="tag">${esc(m.tag)}</span>` : ''}</div></div>`;
  const scroll = () => { list.scrollTop = list.scrollHeight; };
  const draw = () => { list.innerHTML = messages.map(bubble).join(''); scroll(); };
  draw();

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true; send.disabled = true;
    messages.push({ role: 'user', text });
    draw();
    list.insertAdjacentHTML('beforeend', `<div class="msg bot"><div class="avatar">م</div><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>`);
    scroll();
    try {
      const r = await api.chat(text);
      if (ai) {
        window.dispatchEvent(new CustomEvent('ai-status', { detail: { ok: !r.fallback } }));
        $('#ai-dot', root)?.classList.toggle('off', !!r.fallback);
        const st = $('#ai-status', root); if (st) st.textContent = r.fallback ? 'يعمل بالمحرك المحلي مؤقتاً' : 'متصل بخدمة الذكاء الاصطناعي';
      }
      const engine = r.mode === 'gemini' ? 'المحرك: Gemini' : r.fallback ? 'المحرك: محلي احتياطي (تعذّر الاتصال بـ Gemini)' : 'المحرك: محلي';
      messages.push({ role: 'bot', text: r.reply, tag: [engine, r.tools?.length ? `الأدوات: ${r.tools.join('، ')}` : ''].filter(Boolean).join(' · ') });
    } catch (e) {
      messages.push({ role: 'bot', text: `تعذّر إكمال الطلب: ${e.message}` });
    }
    busy = false; send.disabled = false;
    draw(); input.focus();
  }

  $('#composer', root).addEventListener('submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; input.style.height = 'auto'; ask(t); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer', root).requestSubmit(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; });
  $('#suggest', root).addEventListener('click', (e) => { const b = e.target.closest('button[data-q]'); if (b) ask(b.dataset.q); });
  $('#clear-chat', root).addEventListener('click', async () => { messages = null; await api.clearChat().catch(() => {}); renderChat(root, { profile, ai }); });
  input.focus();
}

export const resetChat = () => { messages = null; };
