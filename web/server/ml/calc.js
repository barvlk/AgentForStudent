// آلة حاسبة آمنة: محلل تعبيرات بالنزول التعاودي (Recursive Descent Parser).
// لا نستخدم eval() أبداً — نقبل فقط الأرقام والعمليات + - * / // % ** والأقواس.
//   expr   := term (('+'|'-') term)*
//   term   := unary (('*'|'/'|'//'|'%') unary)*
//   unary  := ('+'|'-') unary | power
//   power  := atom ('**' unary)?
//   atom   := NUMBER | '(' expr ')'
export class UnsafeExpressionError extends Error {}
const MAX_EXP = 100, MAX_LEN = 200;

export function safeCalculate(input) {
  const src = String(input).replace(/×/g, '*').replace(/÷/g, '/').trim();
  if (!src) throw new UnsafeExpressionError('التعبير فارغ.');
  if (src.length > MAX_LEN) throw new UnsafeExpressionError('التعبير طويل جداً.');
  const toks = [];
  const re = /\s*(\d+\.?\d*|\.\d+|\*\*|\/\/|[-+*/%()])\s*/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new UnsafeExpressionError('التعبير يحتوي على عناصر غير مسموحة.');
    toks.push(m[1]);
    pos = re.lastIndex;
  }
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const bad = () => new UnsafeExpressionError('صيغة التعبير غير صحيحة.');

  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term();
    return v;
  };
  const term = () => {
    let v = unary();
    while (['*', '/', '//', '%'].includes(peek())) {
      const op = next();
      const r = unary();
      if (op === '*') v *= r;
      else {
        if (r === 0) throw new UnsafeExpressionError('قسمة على صفر.');
        v = op === '/' ? v / r : op === '//' ? Math.floor(v / r) : v % r;
      }
    }
    return v;
  };
  const unary = () => {
    if (peek() === '-') { next(); return -unary(); }
    if (peek() === '+') { next(); return unary(); }
    return power();
  };
  const power = () => {
    const b = atom();
    if (peek() === '**') {
      next();
      const e = unary();
      if (Math.abs(e) > MAX_EXP) throw new UnsafeExpressionError('الأس كبير جداً.');
      return b ** e;
    }
    return b;
  };
  const atom = () => {
    const t = next();
    if (t === '(') {
      const v = expr();
      if (next() !== ')') throw bad();
      return v;
    }
    if (t !== undefined && /^[\d.]/.test(t)) return parseFloat(t);
    throw bad();
  };

  const result = expr();
  if (i !== toks.length) throw bad();
  if (!Number.isFinite(result)) throw new UnsafeExpressionError('الناتج كبير جداً.');
  return result;
}
