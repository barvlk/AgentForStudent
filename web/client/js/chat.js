import { api } from './api.js';
import { esc, $, markdown } from './ui.js';

const SUGGESTIONS = [
  ['📌 مهامي الأهم', 'وش أهم مهامي ومواعيدي الحين؟ رتبها لي.'],
  ['📈 خطة مذاكرة', 'عطني خطة مذاكرة لهالأسبوع بناءً على نقاط ضعفي.'],
  ['🧠 وين أنا ضعيف؟', 'حلل لي مستواي في كل مجال ووين أحتاج أركز.'],
  ['📚 اشرح لي SJF', 'اشرح لي خوارزمية SJF'],
  ['🧮 احسب', 'كم يساوي (85*3 + 90*4) / 7 ؟'],
];

let messages = null; // تبقى المحادثة عند التنقل بين التبويبات

export function renderChat(root, { profile, ai }) {
  if (!messages) {
    messages = [{ role: 'bot', text: `هلا والله يا ${profile.first_name} 👋\n\nمعدلك الحالي **${profile.gpa.toFixed(2)}** وأنت في **${profile.level}**.\nاسألني عن **مهامك**، **نقاط ضعفك**، **خطة مذاكرة**، أو خلّني **أشرح لك** أي مفهوم. اكتب أي سؤال تبيه!` }];
  }

  root.innerHTML = `
  <div class="card chat fade-in">
    <div class="chat-head">
      <div class="avatar">🤖</div>
      <div style="flex:1"><h3>المساعد الذكي</h3><small><span class="dot ${ai ? '' : 'off'}"></span>${ai ? 'Gemini + أدوات حقيقية' : 'المحرك المحلي الذكي'}</small></div>
      <button class="btn sm ghost" id="clear-chat" title="محادثة جديدة">🗑️ جديدة</button>
    </div>
    <div class="msgs" id="msgs" aria-live="polite"></div>
    <div class="suggest" id="suggest">${SUGGESTIONS.map(([l, q]) => `<button type="button" data-q="${esc(q)}">${l}</button>`).join('')}</div>
    <form class="composer" id="composer">
      <textarea class="input" id="msg-input" rows="1" maxlength="2000" placeholder="اكتب سؤالك هنا... (Enter للإرسال)" aria-label="رسالتك"></textarea>
      <button class="btn primary" id="send" type="submit" aria-label="إرسال">إرسال ➤</button>
    </form>
  </div>`;

  const list = $('#msgs', root), input = $('#msg-input', root), send = $('#send', root);
  let busy = false;

  const bubble = (m) => `<div class="msg ${m.role}"><div class="avatar">${m.role === 'bot' ? '🤖' : '🧑‍🎓'}</div>
    <div><div class="bubble">${m.html ?? markdown(m.text)}</div>${m.tag ? `<span class="tag">${esc(m.tag)}</span>` : ''}</div></div>`;
  const scroll = () => { list.scrollTop = list.scrollHeight; };
  const draw = () => { list.innerHTML = messages.map(bubble).join(''); scroll(); };
  draw();

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true; send.disabled = true;
    messages.push({ role: 'user', text });
    draw();
    list.insertAdjacentHTML('beforeend', `<div class="msg bot" id="typing"><div class="avatar">🤖</div><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>`);
    scroll();
    try {
      const r = await api.chat(text);
      const tools = r.tools?.length ? ` · 🔧 ${r.tools.join(', ')}` : '';
      messages.push({ role: 'bot', text: r.reply, tag: (r.mode === 'gemini' ? 'Gemini' : 'المحرك المحلي') + tools });
    } catch (e) {
      messages.push({ role: 'bot', text: `⚠️ ${e.message}` });
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
