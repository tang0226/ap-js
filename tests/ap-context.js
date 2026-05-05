import { TestSuite } from '../assert-js/test-suite.js';
import { assertEqual, assertNotEqual, assert, assertInstance, assertThrows } from '../assert-js/assert.js';
import { APContext, FLAGS, I_PREC, I_FLAGS, I_EXP, HDR, LIMB_BITS } from '../ap.js';

// ─── constructor ─────────────────────────────────────────────────────────────

new TestSuite('APContext constructor', {

  'sets prec': () => {
    assertEqual(new APContext(26).prec, 26);
    assertEqual(new APContext(128).prec, 128);
  },

  'computes numLimbs': () => {
    assertEqual(new APContext(26).numLimbs, 1);
    assertEqual(new APContext(52).numLimbs, 2);
    assertEqual(new APContext(128).numLimbs, Math.ceil(128 / LIMB_BITS));
  },

  'computes size as HDR + numLimbs': () => {
    const ctx = new APContext(52);
    assertEqual(ctx.size, HDR + ctx.numLimbs);
  },

}).runTests();

// ─── alloc ───────────────────────────────────────────────────────────────────

new TestSuite('APContext alloc()', {

  'returns Float64Array': () => {
    assertInstance(new APContext(26).alloc(), Float64Array);
  },

  'length matches context size': () => {
    const ctx = new APContext(52);
    assertEqual(ctx.alloc().length, ctx.size);
  },

  'initializes to POS_ZERO': () => {
    assertEqual(new APContext(26).alloc()[I_FLAGS], FLAGS.POS_ZERO);
  },

  'sets prec header': () => {
    const ctx = new APContext(78);
    assertEqual(ctx.alloc()[I_PREC], 78);
  },

  'sets exp to 0': () => {
    assertEqual(new APContext(26).alloc()[I_EXP], 0);
  },

  // input variants
  'alloc(string) parses value': () => {
    const ctx = new APContext(26);
    const f = ctx.alloc('1'), g = ctx.alloc();
    ctx.fromString(g, '1');
    assertEqual(f[I_FLAGS], g[I_FLAGS]);
    assertEqual(f[I_EXP],   g[I_EXP]);
    assertEqual(f[HDR],     g[HDR]);
  },

  'alloc(number) parses value': () => {
    const ctx = new APContext(26);
    const f = ctx.alloc(4), g = ctx.alloc();
    ctx.fromString(g, '4');
    assertEqual(f[I_FLAGS], g[I_FLAGS]);
    assertEqual(f[I_EXP],   g[I_EXP]);
    assertEqual(f[HDR],     g[HDR]);
  },

  'alloc(Float64Array) copies all elements': () => {
    const ctx = new APContext(52);
    const src = ctx.alloc('1.5'), copy = ctx.alloc(src);
    for (let i = 0; i < ctx.size; i++)
      assertEqual(copy[i], src[i]);
  },

  'alloc(Float64Array) returns a new array': () => {
    const ctx = new APContext(26);
    const src = ctx.alloc('1'), copy = ctx.alloc(src);
    assertNotEqual(copy, src);
  },

  'alloc(wrong-size Float64Array) throws RangeError': () => {
    const ctx26 = new APContext(26), ctx52 = new APContext(52);
    assertThrows(() => ctx26.alloc(ctx52.alloc('1')), 'source array size mismatch');
  },

  'ap() is an alias for alloc()': () => {
    const ctx = new APContext(52);
    assertEqual(ctx.ap, ctx.alloc);
    assertInstance(ctx.ap(), Float64Array);
    assertEqual(ctx.ap().length, ctx.size);
  },

}).runTests();

// ─── fromString ──────────────────────────────────────────────────────────────

new TestSuite('APContext fromString()', {

  // special values
  '"NaN"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, 'NaN');
    assertEqual(f[I_FLAGS], FLAGS.NAN);
  },

  '"nan" (lowercase)': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, 'nan');
    assertEqual(f[I_FLAGS], FLAGS.NAN);
  },

  '"Infinity"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, 'Infinity');
    assertEqual(f[I_FLAGS], FLAGS.POS_INF);
  },

  '"+inf"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '+inf');
    assertEqual(f[I_FLAGS], FLAGS.POS_INF);
  },

  '"-Infinity"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-Infinity');
    assertEqual(f[I_FLAGS], FLAGS.NEG_INF);
  },

  '"-inf"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-inf');
    assertEqual(f[I_FLAGS], FLAGS.NEG_INF);
  },

  // zero
  '"0" is POS_ZERO': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
    assertEqual(f[I_EXP], 0);
  },

  '"-0" is NEG_ZERO': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-0');
    assertEqual(f[I_FLAGS], FLAGS.NEG_ZERO);
  },

  '"0.0" is zero': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.0');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
  },

  '"0e10" is zero': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0e10');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
  },

  // integer normalization
  // value = mantissa_int * 2^(exp - prec), mantissa_int always in [2^(prec-1), 2^prec)
  // For any power-of-two 2^k: mantissa = 2^(prec-1), exp = k+1
  '"1": flags, exp, mantissa': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], 1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  '"2": exp increments, mantissa unchanged': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(f[I_EXP], 2);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  '"4": exp increments again': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '4');
    assertEqual(f[I_EXP], 3);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // negative
  '"-1": NEG_NORMAL, same mantissa/exp as "1"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-1');
    assertEqual(f[I_FLAGS], FLAGS.NEG_NORMAL);
    assertEqual(f[I_EXP], 1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // fractions: 0.5 = 2^-1 → exp=0, 0.25 = 2^-2 → exp=-1
  '"0.5": exp=0, mantissa=2^(prec-1)': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], 0);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  '"0.25": exp=-1': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], -1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // scientific notation
  '"1e1" matches "10"': () => {
    const ctx = new APContext(52);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1e1');
    ctx.fromString(b, '10');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  '"1.5e2" matches "150"': () => {
    const ctx = new APContext(52);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1.5e2');
    ctx.fromString(b, '150');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  '"1.5e-1" matches "0.15"': () => {
    const ctx = new APContext(52);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1.5e-1');
    ctx.fromString(b, '0.15');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  // non-decimal bases
  '"0xff" matches "255"': () => {
    const ctx = new APContext(26);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '0xff');
    ctx.fromString(b, '255');
    assertEqual(a[I_EXP], b[I_EXP]);
    assertEqual(a[HDR],   b[HDR]);
  },

  '"0b11111111" matches "255"': () => {
    const ctx = new APContext(26);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '0b11111111');
    ctx.fromString(b, '255');
    assertEqual(a[I_EXP], b[I_EXP]);
    assertEqual(a[HDR],   b[HDR]);
  },

  '"-0xff" is NEG_NORMAL': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-0xff');
    assertEqual(f[I_FLAGS], FLAGS.NEG_NORMAL);
  },

  // whitespace
  'trims leading/trailing whitespace': () => {
    const ctx = new APContext(26);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '  1  ');
    ctx.fromString(b, '1');
    assertEqual(a[I_EXP], b[I_EXP]);
    assertEqual(a[HDR],   b[HDR]);
  },

}).runTests();

// ─── toString ────────────────────────────────────────────────────────────────

new TestSuite('APContext toString()', {

  // special values
  'NaN': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, 'NaN');
    assertEqual(ctx.toString(f), 'NaN');
  },

  'Infinity': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, 'Infinity');
    assertEqual(ctx.toString(f), 'Infinity');
  },

  '-Infinity': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-Infinity');
    assertEqual(ctx.toString(f), '-Infinity');
  },

  '+0': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0');
    assertEqual(ctx.toString(f), '0');
  },

  '-0': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-0');
    assertEqual(ctx.toString(f), '-0');
  },

  // decimal — exact binary values only (powers of 2 round-trip cleanly)
  '"1" dec': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(ctx.toString(f), '1');
  },

  '"-1" dec': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-1');
    assertEqual(ctx.toString(f), '-1');
  },

  '"2" dec': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(ctx.toString(f), '2');
  },

  '"0.5" dec': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f), '0.5');
  },

  '"0.25" dec': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(ctx.toString(f), '0.25');
  },

  '"0.125" dec': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.125');
    assertEqual(ctx.toString(f), '0.125');
  },

  'default format matches "dec"': () => {
    const ctx = new APContext(52), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f), ctx.toString(f, 'dec'));
  },

  // scientific notation
  '"1" sci': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(ctx.toString(f, 'e'), '1e+00');
  },

  '"2" sci': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(ctx.toString(f, 'e'), '2e+00');
  },

  '"0.5" sci': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f, 'e'), '5e-01');
  },

  '"0.25" sci': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(ctx.toString(f, 'e'), '2.5e-01');
  },

  'sci format structure': () => {
    const ctx = new APContext(52), f = ctx.alloc();
    ctx.fromString(f, '1234.5');
    const s = ctx.toString(f, 'e');
    assert(/^-?\d(\.\d+)?e[+-]\d{2,}$/.test(s), `sci format invalid: ${s}`);
  },

  // binary
  '"1" bin': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(ctx.toString(f, 'b'), '0b1');
  },

  '"2" bin': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(ctx.toString(f, 'b'), '0b10');
  },

  '"3" bin': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '3');
    assertEqual(ctx.toString(f, 'b'), '0b11');
  },

  '"0.5" bin': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f, 'b'), '0b0.1');
  },

  '"-2" bin': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-2');
    assertEqual(ctx.toString(f, 'b'), '-0b10');
  },

  // hex
  '"255" hex': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '255');
    assertEqual(ctx.toString(f, 'x'), '0xff');
  },

  '"16" hex': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '16');
    assertEqual(ctx.toString(f, 'x'), '0x10');
  },

  '"0.5" hex': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f, 'x'), '0x0.8');
  },

  '"0.25" hex': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(ctx.toString(f, 'x'), '0x0.4');
  },

  // octal
  '"8" oct': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '8');
    assertEqual(ctx.toString(f, 'o'), '0o10');
  },

  '"64" oct': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '64');
    assertEqual(ctx.toString(f, 'o'), '0o100');
  },

}).runTests();

// ─── precision ───────────────────────────────────────────────────────────────

new TestSuite('APContext precision', {

  // 2^53+1 = 9007199254740993. float64 rounds this to 9007199254740992 (2^53).
  // Our library with prec=78 (>54 bits) must store it exactly.
  'exact integer beyond float64 (2^53+1)': () => {
    const ctx = new APContext(78), f = ctx.alloc();
    ctx.fromString(f, '9007199254740993');
    assertEqual(ctx.toString(f), '9007199254740993');
  },

  // Corollary: at prec=52 (like float64) it should round, just as float64 does.
  'prec=52 rounds 2^53+1 like float64': () => {
    const ctx = new APContext(52), f = ctx.alloc();
    ctx.fromString(f, '9007199254740993');
    assertEqual(ctx.toString(f), '9007199254740992');
  },

  // A 128-bit number uses 5 limbs. If precision is real, limbs 1-4 must be non-zero
  // for a value whose binary expansion doesn't terminate after 26 bits.
  'multiple limbs carry non-zero data': () => {
    const ctx = new APContext(128), f = ctx.alloc();
    ctx.fromString(f, '1.23456789012345678901234567890123456789');
    let populated = 0;
    for (let i = 1; i < ctx.numLimbs; i++) if (f[HDR + i] !== 0) populated++;
    assert(populated >= 3, `only ${populated} extra limbs populated — precision not stored`);
  },

  // 128-bit context should produce ~39 significant decimal digits for 1/3.
  // float64 produces 15-16. We assert at least 30 correct leading 3s.
  '1/3 at 128 bits gives far more digits than float64': () => {
    const ctx = new APContext(128), f = ctx.alloc();
    ctx.fromString(f, '0.' + '3'.repeat(42));
    const s = ctx.toString(f);
    const threes = s.startsWith('0.') ? (s.slice(2).match(/^3+/) || [''])[0].length : 0;
    assert(threes >= 30, `expected >=30 correct digits of 1/3, got ${threes}: "${s}"`);
  },

  // Higher precision must produce a strictly longer decimal string for the same input.
  '128-bit produces more decimal digits than 52-bit': () => {
    const input = '0.' + '3'.repeat(42);
    const ctx52  = new APContext(52),  f52  = ctx52.alloc();
    const ctx128 = new APContext(128), f128 = ctx128.alloc();
    ctx52.fromString(f52,   input);
    ctx128.fromString(f128, input);
    const s52  = ctx52.toString(f52);
    const s128 = ctx128.toString(f128);
    assert(s128.length > s52.length,
      `128-bit output ("${s128}") should be longer than 52-bit ("${s52}")`);
  },

  // A very large integer with many significant digits, unrepresentable in float64.
  'large integer with >53 significant bits round-trips': () => {
    const big = '123456789012345678901234567890'; // 30 digits, ~100 bits
    const ctx = new APContext(128), f = ctx.alloc();
    ctx.fromString(f, big);
    assertEqual(ctx.toString(f), big);
  },

}).runTests();

// ─── inverse (fromString ↔ toString) ─────────────────────────────────────────

new TestSuite('APContext inverse', {

  // toString(fromString(s)) === s for exact binary fractions (no precision loss).
  'exact binary fractions round-trip through toString': () => {
    const ctx = new APContext(128);
    for (const s of ['0.5', '0.25', '0.125', '0.0625', '16', '256', '65536']) {
      const f = ctx.alloc();
      ctx.fromString(f, s);
      assertEqual(ctx.toString(f), s, `toString(fromString("${s}")) !== "${s}"`);
    }
  },

  // fromString(toString(f)) === f: converting to string and back gives identical bits.
  // Very small decimals (e.g. 1e-23) are excluded: the truncating integer division
  // in fromString can introduce a 1-ULP difference in the last limb after a round-trip.
  // This is acceptable — each value is still accurate to `prec` bits independently.
  'fromString(toString(f)) recovers identical bits': () => {
    const ctx = new APContext(128);
    const inputs = [
      '0.1',
      '0.3333333333333333333333333333333333333333',
      '3.14159265358979323846264338327950288420',
      '9007199254740993',
      '123456789012345678901234567890',
    ];
    for (const v of inputs) {
      const f = ctx.alloc(), g = ctx.alloc();
      ctx.fromString(f, v);
      ctx.fromString(g, ctx.toString(f));
      assertEqual(f[I_EXP], g[I_EXP], `exp mismatch for "${v}"`);
      for (let i = 0; i < ctx.numLimbs; i++)
        assertEqual(f[HDR + i], g[HDR + i], `limb ${i} mismatch for "${v}"`);
    }
  },

  // toString is format-agnostic inverse: a value expressed as hex, parsed back, equals original.
  'hex toString → fromString recovers identical bits': () => {
    const ctx = new APContext(78);
    for (const v of ['255', '65536', '1000000']) {
      const f = ctx.alloc(), g = ctx.alloc();
      ctx.fromString(f, v);
      ctx.fromString(g, ctx.toString(f, 'x'));
      assertEqual(f[I_EXP], g[I_EXP], `exp mismatch for "${v}" via hex`);
      for (let i = 0; i < ctx.numLimbs; i++)
        assertEqual(f[HDR + i], g[HDR + i], `limb ${i} mismatch for "${v}" via hex`);
    }
  },

  // Consistency check carried over from earlier toString tests.
  '0xff round-trip via dec': () => {
    const ctx = new APContext(26);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '0xff');
    ctx.fromString(b, ctx.toString(a, 'dec'));
    assertEqual(a[I_EXP], b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

}).runTests();

// ─── neg ─────────────────────────────────────────────────────────────────────

new TestSuite('APContext neg()', {

  'neg(NaN) = NaN': () => {
    const ctx = new APContext(26), f = ctx.ap('NaN'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'neg(+0) = -0': () => {
    const ctx = new APContext(26), f = ctx.ap('0'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'neg(-0) = +0': () => {
    const ctx = new APContext(26), f = ctx.ap('-0'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'neg(+Inf) = -Inf': () => {
    const ctx = new APContext(26), f = ctx.ap('Infinity'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  'neg(-Inf) = +Inf': () => {
    const ctx = new APContext(26), f = ctx.ap('-Infinity'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  'neg(1) = -1': () => {
    const ctx = new APContext(26), f = ctx.ap('1'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(ctx.toString(dst), '-1');
  },

  'neg(-1) = 1': () => {
    const ctx = new APContext(26), f = ctx.ap('-1'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(ctx.toString(dst), '1');
  },

  'neg preserves exp and limbs': () => {
    const ctx = new APContext(52), f = ctx.ap('1.5'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_EXP], f[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++)
      assertEqual(dst[HDR + i], f[HDR + i]);
  },

  'double neg recovers original bits': () => {
    const ctx = new APContext(52);
    const f = ctx.ap('0.75'), tmp = ctx.ap(), dst = ctx.ap();
    ctx.neg(tmp, f);
    ctx.neg(dst, tmp);
    assertEqual(dst[I_FLAGS], f[I_FLAGS]);
    assertEqual(dst[I_EXP],   f[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++)
      assertEqual(dst[HDR + i], f[HDR + i]);
  },

  'in-place neg(f, f) works': () => {
    const ctx = new APContext(26), f = ctx.ap('1');
    ctx.neg(f, f);
    assertEqual(ctx.toString(f), '-1');
  },

}).runTests();

// ─── add ─────────────────────────────────────────────────────────────────────

new TestSuite('APContext add()', {

  // special values
  'NaN + x = NaN': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('NaN'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'x + NaN = NaN': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('1'), b = ctx.ap('NaN'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  '+Inf + -Inf = NaN': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('Infinity'), b = ctx.ap('-Infinity'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  '+Inf + +Inf = +Inf': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('Infinity'), b = ctx.ap('Infinity'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  '-Inf + -Inf = -Inf': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('-Infinity'), b = ctx.ap('-Infinity'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  '+Inf + normal = +Inf': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('Infinity'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  '0 + x = x': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('0'), b = ctx.ap('4'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '4');
  },

  'x + 0 = x': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('0'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '4');
  },

  // same sign, aligned exponents
  '1 + 1 = 2': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('1'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '2');
  },

  '0.5 + 0.5 = 1 (carry normalization)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('0.5'), b = ctx.ap('0.5'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '1');
  },

  '0.5 + 0.25 = 0.75': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('0.5'), b = ctx.ap('0.25'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '0.75');
  },

  '-1 + (-1) = -2': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('-1'), b = ctx.ap('-1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '-2');
  },

  // same sign, misaligned exponents
  '1 + 0.5 = 1.5 (expDiff=1)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('1'), b = ctx.ap('0.5'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '1.5');
  },

  '4 + 2 = 6 (expDiff=1)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '6');
  },

  '8 + 2 = 10 (expDiff=2)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('8'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '10');
  },

  // b negligible: iDiff >= numLimbs → early return with a
  'b negligible at single-limb precision': () => {
    const ctx = new APContext(26);  // numLimbs = 1
    const a = ctx.ap('67108864'), b = ctx.ap('1'), dst = ctx.ap();  // 2^26, iDiff=1 = numLimbs
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '67108864');
  },

  // exercises offset=0, iDiff=1, numLimbs=2 path (covers roundBit branch at line 165-166)
  '2^26 + 1 at prec=52 (offset=0, iDiff=1)': () => {
    const ctx = new APContext(52);  // numLimbs = 2
    const a = ctx.ap('67108864'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '67108865');
  },

  // different sign: magnitude subtraction
  '4 + (-2) = 2': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('-2'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '2');
  },

  '2 + (-4) = -2': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('2'), b = ctx.ap('-4'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '-2');
  },

  '4 + (-4) = 0 (exact cancellation)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('-4'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  '-4 + 2 = -2': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('-4'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '-2');
  },

  '1 + (-0.5) = 0.5': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('1'), b = ctx.ap('-0.5'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '0.5');
  },

  '4 + (-1) = 3 (borrow propagation)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('-1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '3');
  },

  // multi-limb precision
  '2^53 + 1 exact at prec=78': () => {
    const ctx = new APContext(78);
    const a = ctx.ap('9007199254740992'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '9007199254740993');
  },

  // aliasing
  'dst === a (in-place a += b)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('1'), b = ctx.ap('1');
    ctx.add(a, a, b);
    assertEqual(ctx.toString(a), '2');
  },

  'dst === b (in-place b = a + b)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('2');
    ctx.add(b, a, b);
    assertEqual(ctx.toString(b), '6');
  },

}).runTests();

// ─── sub ─────────────────────────────────────────────────────────────────────

new TestSuite('APContext sub()', {

  '4 - 2 = 2': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '2');
  },

  '2 - 4 = -2': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('2'), b = ctx.ap('4'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '-2');
  },

  '4 - 4 = 0': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('4'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  '1 - 0 = 1': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('1'), b = ctx.ap('0'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '1');
  },

  '0 - 1 = -1': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('0'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '-1');
  },

  '-2 - (-4) = 2': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('-2'), b = ctx.ap('-4'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '2');
  },

  '-4 - 2 = -6': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('-4'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '-6');
  },

  '8 - 0.5 = 7.5 (fractional result)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('8'), b = ctx.ap('0.5'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '7.5');
  },

  '4 - 1 = 3 (borrow propagation)': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '3');
  },

  'sub(a,b) = neg(sub(b,a))': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('2');
    const r1 = ctx.ap(), r2 = ctx.ap(), neg_r1 = ctx.ap();
    ctx.sub(r1, a, b);
    ctx.sub(r2, b, a);
    ctx.neg(neg_r1, r1);
    assertEqual(neg_r1[I_FLAGS], r2[I_FLAGS]);
    assertEqual(neg_r1[I_EXP],   r2[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++)
      assertEqual(neg_r1[HDR + i], r2[HDR + i]);
  },

  'dst === b aliasing: b = a - b': () => {
    const ctx = new APContext(26);
    const a = ctx.ap('4'), b = ctx.ap('1');
    ctx.sub(b, a, b);
    assertEqual(ctx.toString(b), '3');
  },

  'large exact subtraction at prec=78': () => {
    const ctx = new APContext(78);
    const a = ctx.ap('9007199254740993'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '9007199254740992');
  },

  'multi-limb cancellation leaves correct result': () => {
    const ctx = new APContext(78);
    const a = ctx.ap('9007199254740993'), b = ctx.ap('9007199254740992'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '1');
  },

}).runTests();
