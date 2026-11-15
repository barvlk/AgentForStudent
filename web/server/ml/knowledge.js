// البحث المعرفي في المذكرات: TF-IDF على مقاطع حرفية (character n-grams من 2 إلى 4)
// + تشابه جيب التمام (Cosine Similarity). تتحمل العربية (أدوات التعريف/اللواحق) بدون تجذير.
export const DEFAULT_NOTES = {
  'هياكل البيانات': [
    'شجرة البحث الثنائية (BST): زمن البحث والإدراج O(log n) إذا كانت متزنة، وقد يتردى إلى O(n) في أسوأ حالة.',
    'جداول الهاش (Hash Tables): بحث بمتوسط زمن O(1)، وتُعالج التصادمات بطريقة Chaining أو Open Addressing.',
    'خوارزمية الفرز السريع (QuickSort): تعتمد على مبدأ فرّق تسد باختيار عنصر محوري (Pivot)، بمتوسط O(n log n).',
    'المكدس والطابور (Stack & Queue): المكدس يتبع LIFO (آخر من يدخل أول من يخرج)، والطابور يتبع FIFO.',
  ],
  'نظم التشغيل': [
    'خوارزمية SJF (Shortest Job First): تنفذ العملية الأقصر أولاً فتقلل متوسط وقت الانتظار، لكنها قد تسبب المجاعة (Starvation).',
    'خوارزمية Round Robin: لكل عملية شريحة زمنية ثابتة (Time Quantum)، مناسبة للأنظمة التفاعلية.',
    'المجاعة (Starvation): عملية لا تحصل على المعالج لفترة طويلة، وتُحل بالتقادم (Aging) أي رفع أولويتها تدريجياً.',
    'الذاكرة الصفحية (Paging): تقسيم الذاكرة إلى صفحات متساوية الحجم لتجنب التجزئة الخارجية (External Fragmentation).',
  ],
  'أسس هندسة البرمجيات': [
    'منهجية أجايل (Agile): مرونة عالية وتسليم مستمر وتكيّف مع تغيّر المتطلبات عبر دورات قصيرة (Sprints).',
    'إطار سكروم (Scrum): أدوار محددة (Scrum Master, Product Owner, Team) واجتماع يومي قصير (Daily Standup).',
    'مخططات UML: معيار لتصميم الأنظمة، مثل Use Case Diagram لتفاعل المستخدم و Class Diagram لهيكل الأصناف.',
  ],
  'الأمن السيبراني': [
    'مثلث أمن المعلومات (CIA Triad): السرية (Confidentiality)، السلامة (Integrity)، التوافر (Availability).',
    'أنظمة كشف التسلل (IDS) تراقب وتنبّه عند السلوك المريب، بينما أنظمة منع التسلل (IPS) تحجب الهجوم مباشرة.',
    'تخزين كلمات المرور يكون بدوال hash بطيئة مع salt مثل bcrypt أو Argon2 أو scrypt، وليس بتشفير قابل للعكس.',
  ],
  'الذكاء الاصطناعي': [
    'تتبع المعرفة البايزي (BKT): نموذج يقدّر احتمال إتقان الطالب لمهارة ويحدّثه بعد كل محاولة باستخدام قاعدة بايز.',
    'الغابة العشوائية (Random Forest): مجموعة أشجار قرار مدرّبة على عينات مختلفة، والتصويت بينها يقلل الإفراط في التخصيص (Overfitting).',
    'نمط ReAct للوكلاء: دورة تفكير (Thought) ثم فعل باستدعاء أداة (Action) ثم ملاحظة النتيجة (Observation).',
  ],
};

export function normalizeArabic(text) {
  return String(text).toLowerCase()
    .replace(/[ؗ-ًؚ-ْـ]/g, '')
    .replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

function ngrams(text) {
  const counts = new Map();
  for (const word of normalizeArabic(text).match(/[\p{L}\p{N}]+/gu) ?? []) {
    const w = ` ${word} `;
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export class KnowledgeBase {
  constructor(notes = DEFAULT_NOTES, minScore = 0.08) {
    this.minScore = minScore;
    this.docs = Object.entries(notes).flatMap(([category, items]) => items.map((text) => ({ category, text })));
    const tfs = this.docs.map((d) => ngrams(`${d.category} ${d.text}`));
    const df = new Map();
    for (const tf of tfs) for (const g of tf.keys()) df.set(g, (df.get(g) ?? 0) + 1);
    const n = this.docs.length;
    this.idf = new Map([...df].map(([g, c]) => [g, Math.log((1 + n) / (1 + c)) + 1]));
    this.vectors = tfs.map((tf) => this.#vector(tf));
  }

  #vector(tf) {
    const v = new Map();
    let norm = 0;
    for (const [g, c] of tf) {
      const idf = this.idf.get(g);
      if (!idf) continue;
      const x = (1 + Math.log(c)) * idf;
      v.set(g, x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [g, x] of v) v.set(g, x / norm);
    return v;
  }

  search(query, topK = 3) {
    if (!String(query ?? '').trim()) return [];
    const q = this.#vector(ngrams(query));
    return this.vectors.map((v, i) => {
      let dot = 0;
      for (const [g, x] of q) dot += x * (v.get(g) ?? 0);
      return { ...this.docs[i], score: Math.round(dot * 1000) / 1000 };
    }).sort((a, b) => b.score - a.score).slice(0, topK).filter((h) => h.score >= this.minScore);
  }

  searchText(query, topK = 3) {
    const hits = this.search(query, topK);
    if (!hits.length) return 'لم أجد معلومات مطابقة في المذكرات المحلية.';
    return ['نتائج البحث في المذكرات:', ...hits.map((h) => `- [${h.category}] (تطابق ${Math.round(h.score * 100)}%): ${h.text}`)].join('\n');
  }
}
