// مولّد أرقام عشوائية قابل للتكرار (seeded) — حتى تعطي التجارب نفس النتائج كل مرة.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Random {
  constructor(seed) { this.rand = mulberry32(seed); }
  float() { return this.rand(); }
  int(lo, hi) { return lo + Math.floor(this.rand() * (hi - lo)); } // [lo, hi)
  // توزيع طبيعي بطريقة Box–Muller
  normal(mean = 0, sd = 1) {
    const u = 1 - this.rand(), v = this.rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  pick(arr) { return arr[this.int(0, arr.length)]; }
}
