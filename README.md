# AgentForStudent

[![tests](https://github.com/barvlk/AgentForStudent/actions/workflows/tests.yml/badge.svg)](https://github.com/barvlk/AgentForStudent/actions/workflows/tests.yml)
[![web-tests](https://github.com/barvlk/AgentForStudent/actions/workflows/web-tests.yml/badge.svg)](https://github.com/barvlk/AgentForStudent/actions/workflows/web-tests.yml)
![Node.js](https://img.shields.io/badge/backend-Node.js-3c873a)
![JavaScript](https://img.shields.io/badge/frontend-HTML%20%7C%20CSS%20%7C%20JavaScript-1e4fb3)
![Python](https://img.shields.io/badge/python-3.11%20|%203.12%20|%203.13-blue)
![Gemini](https://img.shields.io/badge/LLM-Google%20Gemini-8e75b2)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

مساعد أكاديمي ذكي لطلاب جامعة أم القرى. يحلل السجل الأكاديمي للطالب، ويقدّر مستوى إتقانه لكل مجال، ويتنبأ بخطر التعثر، ويرتب مهامه، ويبني له خطة مذاكرة أسبوعية، ويحسب معدله الفصلي والتراكمي، ويحاوره عبر مساعد ذكي يستخدم أدوات حقيقية.

> An academic assistant: Bayesian Knowledge Tracing + Random-Forest risk prediction + task scheduling + a GPA calculator (4.00 / 5.00 scales) + a tool-using Gemini agent. Node.js backend with a vanilla JavaScript frontend (no third-party dependencies), plus the original Python/Streamlit version.

## جرّب الموقع مباشرة

**https://agentforstudent.onrender.com/**

- الرقم الجامعي: `441126225` · كلمة المرور: `Demo2026x` (بيانات وهمية بالكامل)
- الاستضافة المجانية تنام بعد فترة خمول، فأول فتح قد يتأخر نحو 30 ثانية
- بدون ربط قاعدة PostgreSQL تتجدد البيانات عند كل إعادة تشغيل (الاستضافة المجانية تمسح الملفات). مع `DATABASE_URL` تبقى محفوظة، انظر [web/README.md](web/README.md#ربط-قاعدة-postgresql-لتبقى-البيانات-بعد-إعادة-تشغيل-الموقع)

## لقطات من النظام

> اللقطات من بيانات تجريبية اصطناعية (أسماء ودرجات وهمية).

| تسجيل الدخول | لوحة الأداء: الإتقان وخطر التعثر |
|---|---|
| ![تسجيل الدخول](docs/screenshots/login.png) | ![لوحة الأداء](docs/screenshots/dashboard.png) |
| **ترتيب المهام حسب الأولوية** | **حاسبة المعدل (سلم 4.00 و5.00)** |
| ![المهام](docs/screenshots/tasks.png) | ![حاسبة المعدل](docs/screenshots/gpa.png) |

**المساعد الأكاديمي**

![المساعد الأكاديمي](docs/screenshots/chat.png)

## المزايا

| المجال | الميزة |
|---|---|
| التحليلات | تتبع الإتقان بـ **BKT**، والتنبؤ بالتعثر بـ **Random Forest** مع تقييم على بيانات لم يتدرب عليها النموذج |
| حاسبة المعدل | معدل الفصل والتراكمي، وسلم **4.00** أو **5.00**، وجدول **"ماذا لو"** لكل تقدير، وحساب المعدل المطلوب لبلوغ هدف |
| المساعد | **Gemini Function Calling** بست أدوات (المذكرات، المهام، التحليلات، الخطة، محاكاة المعدل، الحاسبة الآمنة) مع **محرك محلي احتياطي** يرد حتى بدون Gemini |
| المهام | إضافة وإنجاز وحذف، وترتيب حسب الأهمية وقرب الموعد مع **SJF** عند التساوي |
| خطة المذاكرة | توزيع ساعات الأسبوع حسب خطر التعثر وفجوة الإتقان (نمط ReAct) مع حد أدنى للمراجعة في كل مجال |
| قاعدة البيانات | **SQL** مطبّعة (طلاب، مقررات، تسجيلات، مهام، حسابات) بمفاتيح أجنبية وقيود CHECK وعروض (Views) ومهاجرات؛ **SQLite** محلياً و**PostgreSQL** للحفظ الدائم عبر `DATABASE_URL` |
| الأمان | كلمات مرور **scrypt**، قفل الحساب، جلسات HttpOnly بانتهاء خمول، سجل تدقيق، Content-Security-Policy، منع XSS وSQL Injection وIDOR |
| الجودة | **46 اختباراً** للموقع (Node) تعمل على SQLite وPostgreSQL، و**55** لنسخة بايثون، وكلاهما على GitHub Actions |

## حاسبة المعدل

المعدل = مجموع (نقاط التقدير × ساعات المقرر) ÷ مجموع الساعات.

مثال: معدلك 3.37 على 71 ساعة، وأخذت **A+** في مقرر **4 ساعات** (سلم 4.00):

```
(3.37 × 71 + 4.00 × 4) ÷ 75 = 3.40
```

| سلم 4.00 (جدول أم القرى) | A+ | A | B+ | B | C+ | C | D+ | D | F |
|---|---|---|---|---|---|---|---|---|---|
| النقاط | 4.00 | 3.75 | 3.50 | 3.00 | 2.50 | 2.00 | 1.50 | 1.00 | 0 |

| سلم 5.00 (الشائع في الجامعات السعودية) | A+ | A | B+ | B | C+ | C | D+ | D | F |
|---|---|---|---|---|---|---|---|---|---|
| النقاط | 5.00 | 4.75 | 4.50 | 4.00 | 3.50 | 3.00 | 2.50 | 2.00 | 1.00 |

حدود النسب والنقاط قد تختلف قليلاً بين الجامعات؛ ارجع للائحة جامعتك للاعتماد الرسمي.

## المعمارية (النسخة الجديدة: `web/`)

```mermaid
flowchart LR
    FE["الواجهة الأمامية<br/>HTML + CSS + JavaScript"] -- "REST API" --> API["خادم Node.js"]
    API --> AUTH["المصادقة<br/>scrypt + قفل + جلسات"]
    API --> DB[("قاعدة SQL<br/>SQLite أو PostgreSQL<br/>طلاب · مقررات · تسجيلات · مهام")]
    API --> ML["الخوارزميات<br/>BKT · Random Forest · الجدولة · ReAct"]
    API --> GPA["حاسبة المعدل"]
    API --> CHAT["المساعد"]
    CHAT -- "Gemini" --> TOOLS["أدوات مربوطة<br/>بالطالب الحالي"]
    CHAT -. "احتياطي" .-> LOCAL["المحرك المحلي"]
    TOOLS --> ML
    TOOLS --> GPA
    LOCAL --> ML
```

## هيكل المشروع

```
├── web/                       # النسخة الجديدة: Node.js + HTML/CSS/JS (بدون مكتبات خارجية)
│   ├── server/                # index.js · auth.js · db.js · services.js · chat.js · sample.js
│   │   └── ml/                # bkt · forest · risk · scheduler · planner · knowledge · calc
│   ├── client/                # index.html · styles.css · js/ (main, dashboard, tasks, gpacalc, chat, charts ...)
│   └── test/                  # اختبارات node:test
├── render.yaml                # إعداد النشر على Render (الخطة المجانية)
├── agentforstudent/           # النسخة الأولى: Python + Streamlit
├── tests/                     # اختبارات pytest للنسخة الأولى
└── docs/                      # الصور والشروحات
```

شرح كل خوارزمية ووظيفتها في [web/README.md](web/README.md).

## التشغيل السريع

### النسخة الجديدة (Node.js 22.5 أو أحدث)

```bash
git clone https://github.com/barvlk/AgentForStudent.git
cd AgentForStudent/web
npm install
npm start            # http://localhost:3000
npm test             # 46 اختباراً (SQLite + PostgreSQL)
```

عند أول تشغيل ينشئ النظام جداول القاعدة، ويولّد 100 طالب وهمي، ويدرّب نموذج التنبؤ، وينشئ حساب العرض. محلياً تُحفظ البيانات في `web/data/afs.db` (SQLite). للمحادثة عبر Gemini ولربط PostgreSQL أنشئ ملف `.env` في جذر المشروع:

```
GEMINI_API_KEY=مفتاحك
GEMINI_MODEL=gemini-2.5-flash
DATABASE_URL=postgres://user:pass@host/db     # اختياري: لحفظ البيانات في PostgreSQL
AFS_DEMO_STUDENT_ID=441126225
AFS_DEMO_PASSWORD=كلمة_مرور_للعرض
```

بدون `GEMINI_API_KEY` تعمل كل المزايا، والمحادثة تستخدم المحرك المحلي. وبدون `DATABASE_URL` تُستخدم SQLite.

### النشر على Render

افتح Render ← **New** ← **Blueprint** ← اختر المستودع. ملف [render.yaml](render.yaml) يضبط الخدمة على الخطة المجانية. أضف من **Environment**:

- `DATABASE_URL`: رابط قاعدة PostgreSQL (من Neon أو Supabase أو Render) لتبقى البيانات بعد إعادة التشغيل.
- `GEMINI_API_KEY`: اختياري.

### النسخة الأولى (Python + Streamlit)

```bash
python -m venv .venv
.venv\Scripts\activate           # ويندوز  (لينكس/ماك: source .venv/bin/activate)
pip install -r requirements-dev.txt

python main.py setup --demo      # يولّد 100 طالب وهمي، مفتاح تشفير، ويشفّر البيانات وينشئ الحسابات
python main.py web               # أو: streamlit run app.py
python -m pytest -q              # 55 اختباراً
```

افتح `data/initial_credentials.csv` وخذ أي رقم جامعي مع كلمة مروره المؤقتة. أوامر لوحة التحكم الأخرى (`student`, `train`, `users`, `backup`, `audit` ...) متوفرة عبر `python main.py`.

لتشغيلها ببيانات الجامعة الحقيقية ضع ملف الطلاب في `data/raw/students_by_term_150.xlsx` ثم `python main.py setup`. أعمدة الملف: `الرقم الجامعي، اسم الطالب، المستوى الدراسي الحالي، ترم المادة، رمز المقرر، اسم المقرر، الساعات، الدرجة، التقدير، النقاط`. **احذف `data/initial_credentials.csv` بعد توزيع كلمات المرور، ولا ترفع بيانات طلاب حقيقية على نسخة عامة.**

## ملاحظات علمية

- البيانات في هذا المستودع **اصطناعية**. أرقام التقييم (مثل ROC-AUC) نتائج على بيانات مولّدة بنمط واضح، ولا تدل على دقة النموذج على طلاب حقيقيين.
- معاملات BKT موضوعة يدوياً ولم تُقدَّر من بيانات حقيقية.
- المحرك المحلي للمحادثة يعتمد كلمات مفتاحية، ولفهم أي سؤال يلزم Gemini.

## المؤلف

عبدالمجيد — قسم الذكاء الاصطناعي، جامعة أم القرى (مشروع تخرج).

## الترخيص

[MIT](LICENSE)
