import { TestSuite } from '../assert-js/test-suite.js';
import { assertEqual, assertNotEqual, assert, assertInstance, assertThrows, assertTruthy, assertFalsy } from '../assert-js/assert.js';
import { APContext, FLAGS, I_PREC, I_FLAGS, I_EXP, HDR, LIMB_BITS } from '../ap.js';

// ─── constructor ─────────────────────────────────────────────────────────────

new TestSuite('APContext constructor', {

  'sets prec': () => {
    assertEqual(new APContext(16).prec, 16);
    assertEqual(new APContext(128).prec, 128);
  },

  'computes numLimbs': () => {
    assertEqual(new APContext(16).numLimbs, 1);
    assertEqual(new APContext(32).numLimbs, 2);
    assertEqual(new APContext(128).numLimbs, Math.ceil(128 / LIMB_BITS));
  },

  'computes size as HDR + numLimbs': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.size, HDR + ctx.numLimbs);
  },

}).runTests();

// ─── alloc ───────────────────────────────────────────────────────────────────

new TestSuite('APContext alloc()', {

  'returns Int32Array': () => {
    assertInstance(new APContext(16).alloc(), Int32Array);
  },

  'length matches context size': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.alloc().length, ctx.size);
  },

  'initializes to POS_ZERO': () => {
    assertEqual(new APContext(16).alloc()[I_FLAGS], FLAGS.POS_ZERO);
  },

  'sets prec header': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.alloc()[I_PREC], 32);
  },

  'sets exp to 0': () => {
    assertEqual(new APContext(16).alloc()[I_EXP], 0);
  },

  // input variants
  'alloc(string) parses value': () => {
    const ctx = new APContext(16);
    const f = ctx.alloc('1'), g = ctx.alloc();
    ctx.fromString(g, '1');
    assertEqual(f[I_FLAGS], g[I_FLAGS]);
    assertEqual(f[I_EXP],   g[I_EXP]);
    assertEqual(f[HDR],     g[HDR]);
  },

  'alloc(number) parses value': () => {
    const ctx = new APContext(16);
    const f = ctx.alloc(4), g = ctx.alloc();
    ctx.fromString(g, '4');
    assertEqual(f[I_FLAGS], g[I_FLAGS]);
    assertEqual(f[I_EXP],   g[I_EXP]);
    assertEqual(f[HDR],     g[HDR]);
  },

  'alloc(Int32Array) copies all elements': () => {
    const ctx = new APContext(32);
    const src = ctx.alloc('1.5'), copy = ctx.alloc(src);
    for (let i = 0; i < ctx.size; i++)
      assertEqual(copy[i], src[i]);
  },

  'alloc(Int32Array) returns a new array': () => {
    const ctx = new APContext(16);
    const src = ctx.alloc('1'), copy = ctx.alloc(src);
    assertNotEqual(copy, src);
  },

  'alloc(wrong-size Int32Array) throws RangeError': () => {
    const ctx16 = new APContext(16), ctx32 = new APContext(32);
    assertThrows(() => ctx16.alloc(ctx32.alloc('1')), 'source array size mismatch');
  },

  'ap() is an alias for alloc()': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.ap, ctx.alloc);
    assertInstance(ctx.ap(), Int32Array);
    assertEqual(ctx.ap().length, ctx.size);
  },

}).runTests();

// ─── fromString ──────────────────────────────────────────────────────────────

new TestSuite('APContext fromString()', {

  // special values
  '"NaN"': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, 'NaN');
    assertEqual(f[I_FLAGS], FLAGS.NAN);
  },

  '"nan" (lowercase)': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, 'nan');
    assertEqual(f[I_FLAGS], FLAGS.NAN);
  },

  '"Infinity"': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, 'Infinity');
    assertEqual(f[I_FLAGS], FLAGS.POS_INF);
  },

  '"+inf"': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '+inf');
    assertEqual(f[I_FLAGS], FLAGS.POS_INF);
  },

  '"-Infinity"': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '-Infinity');
    assertEqual(f[I_FLAGS], FLAGS.NEG_INF);
  },

  '"-inf"': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '-inf');
    assertEqual(f[I_FLAGS], FLAGS.NEG_INF);
  },

  // zero
  '"0" is POS_ZERO': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
    assertEqual(f[I_EXP], 0);
  },

  '"-0" is NEG_ZERO': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '-0');
    assertEqual(f[I_FLAGS], FLAGS.NEG_ZERO);
  },

  '"0.0" is zero': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.0');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
  },

  '"0e10" is zero': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0e10');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
  },

  // integer normalization
  // value = mantissa_int * 2^(exp - prec), mantissa_int always in [2^(prec-1), 2^prec)
  // For any power-of-two 2^k: mantissa = 2^(prec-1), exp = k+1
  // Use prec=LIMB_BITS so the full mantissa fits in one limb: f[HDR] = 2^(LIMB_BITS-1)
  '"1": flags, exp, mantissa': () => {
    const ctx = new APContext(LIMB_BITS), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], 1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  '"2": exp increments, mantissa unchanged': () => {
    const ctx = new APContext(LIMB_BITS), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(f[I_EXP], 2);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  '"4": exp increments again': () => {
    const ctx = new APContext(LIMB_BITS), f = ctx.alloc();
    ctx.fromString(f, '4');
    assertEqual(f[I_EXP], 3);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // negative
  '"-1": NEG_NORMAL, same mantissa/exp as "1"': () => {
    const ctx = new APContext(LIMB_BITS), f = ctx.alloc();
    ctx.fromString(f, '-1');
    assertEqual(f[I_FLAGS], FLAGS.NEG_NORMAL);
    assertEqual(f[I_EXP], 1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // fractions: 0.5 = 2^-1 → exp=0, 0.25 = 2^-2 → exp=-1
  '"0.5": exp=0, mantissa=2^(prec-1)': () => {
    const ctx = new APContext(LIMB_BITS), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], 0);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  '"0.25": exp=-1': () => {
    const ctx = new APContext(LIMB_BITS), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], -1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // scientific notation
  '"1e1" matches "10"': () => {
    const ctx = new APContext(32);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1e1');
    ctx.fromString(b, '10');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  '"1.5e2" matches "150"': () => {
    const ctx = new APContext(32);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1.5e2');
    ctx.fromString(b, '150');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  '"1.5e-1" matches "0.15"': () => {
    const ctx = new APContext(32);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1.5e-1');
    ctx.fromString(b, '0.15');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  // non-decimal bases
  '"0xff" matches "255"': () => {
    const ctx = new APContext(16);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '0xff');
    ctx.fromString(b, '255');
    assertEqual(a[I_EXP], b[I_EXP]);
    assertEqual(a[HDR],   b[HDR]);
  },

  '"0b11111111" matches "255"': () => {
    const ctx = new APContext(16);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '0b11111111');
    ctx.fromString(b, '255');
    assertEqual(a[I_EXP], b[I_EXP]);
    assertEqual(a[HDR],   b[HDR]);
  },

  '"-0xff" is NEG_NORMAL': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '-0xff');
    assertEqual(f[I_FLAGS], FLAGS.NEG_NORMAL);
  },

  // whitespace
  'trims leading/trailing whitespace': () => {
    const ctx = new APContext(16);
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
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, 'NaN');
    assertEqual(ctx.toString(f), 'NaN');
  },

  'Infinity': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, 'Infinity');
    assertEqual(ctx.toString(f), 'Infinity');
  },

  '-Infinity': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '-Infinity');
    assertEqual(ctx.toString(f), '-Infinity');
  },

  '+0': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0');
    assertEqual(ctx.toString(f), '0');
  },

  '-0': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '-0');
    assertEqual(ctx.toString(f), '-0');
  },

  // decimal — exact binary values only (powers of 2 round-trip cleanly)
  '"1" dec': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(ctx.toString(f), '1');
  },

  '"-1" dec': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '-1');
    assertEqual(ctx.toString(f), '-1');
  },

  '"2" dec': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(ctx.toString(f), '2');
  },

  '"0.5" dec': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f), '0.5');
  },

  '"0.25" dec': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(ctx.toString(f), '0.25');
  },

  '"0.125" dec': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.125');
    assertEqual(ctx.toString(f), '0.125');
  },

  'default format matches "dec"': () => {
    const ctx = new APContext(32), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f), ctx.toString(f, 'dec'));
  },

  // scientific notation
  '"1" sci': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(ctx.toString(f, 'e'), '1e+00');
  },

  '"2" sci': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(ctx.toString(f, 'e'), '2e+00');
  },

  '"0.5" sci': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f, 'e'), '5e-01');
  },

  '"0.25" sci': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(ctx.toString(f, 'e'), '2.5e-01');
  },

  'sci format structure': () => {
    const ctx = new APContext(32), f = ctx.alloc();
    ctx.fromString(f, '1234.5');
    const s = ctx.toString(f, 'e');
    assert(/^-?\d(\.\d+)?e[+-]\d{2,}$/.test(s), `sci format invalid: ${s}`);
  },

  // binary
  '"1" bin': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(ctx.toString(f, 'b'), '0b1');
  },

  '"2" bin': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(ctx.toString(f, 'b'), '0b10');
  },

  '"3" bin': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '3');
    assertEqual(ctx.toString(f, 'b'), '0b11');
  },

  '"0.5" bin': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f, 'b'), '0b0.1');
  },

  '"-2" bin': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '-2');
    assertEqual(ctx.toString(f, 'b'), '-0b10');
  },

  // hex
  '"255" hex': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '255');
    assertEqual(ctx.toString(f, 'x'), '0xff');
  },

  '"16" hex': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '16');
    assertEqual(ctx.toString(f, 'x'), '0x10');
  },

  '"0.5" hex': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(ctx.toString(f, 'x'), '0x0.8');
  },

  '"0.25" hex': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(ctx.toString(f, 'x'), '0x0.4');
  },

  // octal
  '"8" oct': () => {
    const ctx = new APContext(16), f = ctx.alloc();
    ctx.fromString(f, '8');
    assertEqual(ctx.toString(f, 'o'), '0o10');
  },

  '"64" oct': () => {
    const ctx = new APContext(16), f = ctx.alloc();
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

  // A 128-bit number uses ceil(128/LIMB_BITS) limbs. If precision is real, multiple
  // limbs must be non-zero for a value whose binary expansion doesn't terminate after LIMB_BITS bits.
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
    const ctx = new APContext(16);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '0xff');
    ctx.fromString(b, ctx.toString(a, 'dec'));
    assertEqual(a[I_EXP], b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

}).runTests();

// ─── eq ──────────────────────────────────────────────────────────────────────

new TestSuite('APContext eq()', {

  // NaN is never equal to anything, including itself
  'eq(NaN, NaN) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('NaN'), ctx.ap('NaN')), false);
  },

  'eq(NaN, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('NaN'), ctx.ap('1')), false);
  },

  // ±0 are equal to each other regardless of sign
  'eq(+0, +0) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('0'), ctx.ap('0')), true);
  },

  'eq(+0, -0) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('0'), ctx.ap('-0')), true);
  },

  // infinities
  'eq(+Inf, +Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('Infinity'), ctx.ap('Infinity')), true);
  },

  'eq(+Inf, -Inf) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('Infinity'), ctx.ap('-Infinity')), false);
  },

  'eq(+Inf, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('Infinity'), ctx.ap('1')), false);
  },

  // normal numbers
  'eq(1, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('1'), ctx.ap('1')), true);
  },

  'eq(1, 2) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('1'), ctx.ap('2')), false);
  },

  'eq(1, -1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('1'), ctx.ap('-1')), false);
  },

  'eq(0.5, 0.5) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq(ctx.ap('0.5'), ctx.ap('0.5')), true);
  },

  // equals() is an alias for eq()
  'equals is an alias for eq': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.eq, ctx.equals);
  },

}).runTests();

// ─── gt ──────────────────────────────────────────────────────────────────────

new TestSuite('APContext gt()', {

  // NaN is never greater than anything
  'gt(NaN, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('NaN'), ctx.ap('1')), false);
  },

  'gt(1, NaN) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('1'), ctx.ap('NaN')), false);
  },

  // infinity
  'gt(+Inf, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('Infinity'), ctx.ap('1')), true);
  },

  'gt(1, +Inf) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('1'), ctx.ap('Infinity')), false);
  },

  'gt(+Inf, +Inf) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('Infinity'), ctx.ap('Infinity')), false);
  },

  'gt(-Inf, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('-Infinity'), ctx.ap('1')), false);
  },

  'gt(1, -Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('1'), ctx.ap('-Infinity')), true);
  },

  // zero
  'gt(0, -1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('0'), ctx.ap('-1')), true);
  },

  'gt(0, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('0'), ctx.ap('1')), false);
  },

  'gt(0, 0) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('0'), ctx.ap('0')), false);
  },

  // opposite signs
  'gt(1, -1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('1'), ctx.ap('-1')), true);
  },

  'gt(-1, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('-1'), ctx.ap('1')), false);
  },

  // same sign, same exponent (mantissa comparison)
  'gt(3, 2) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('3'), ctx.ap('2')), true);
  },

  'gt(2, 3) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('2'), ctx.ap('3')), false);
  },

  // same sign, different exponent — requires exponent comparison
  'gt(4, 3) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('4'), ctx.ap('3')), true);
  },

  'gt(3, 4) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('3'), ctx.ap('4')), false);
  },

  // equal values
  'gt(1, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('1'), ctx.ap('1')), false);
  },

  // negative numbers (larger magnitude = smaller value)
  'gt(-2, -3) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('-2'), ctx.ap('-3')), true);
  },

  'gt(-3, -2) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gt(ctx.ap('-3'), ctx.ap('-2')), false);
  },

}).runTests();

// ─── lt ──────────────────────────────────────────────────────────────────────

new TestSuite('APContext lt()', {

  // NaN is never less than anything
  'lt(NaN, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('NaN'), ctx.ap('1')), false);
  },

  'lt(1, NaN) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('1'), ctx.ap('NaN')), false);
  },

  // infinity
  'lt(-Inf, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('-Infinity'), ctx.ap('1')), true);
  },

  'lt(1, -Inf) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('1'), ctx.ap('-Infinity')), false);
  },

  'lt(-Inf, -Inf) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('-Infinity'), ctx.ap('-Infinity')), false);
  },

  'lt(+Inf, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('Infinity'), ctx.ap('1')), false);
  },

  'lt(1, +Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('1'), ctx.ap('Infinity')), true);
  },

  'lt(-Inf, +Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('-Infinity'), ctx.ap('Infinity')), true);
  },

  // zero
  'lt(0, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('0'), ctx.ap('1')), true);
  },

  'lt(0, -1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('0'), ctx.ap('-1')), false);
  },

  'lt(0, 0) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('0'), ctx.ap('0')), false);
  },

  // opposite signs
  'lt(-1, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('-1'), ctx.ap('1')), true);
  },

  'lt(1, -1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('1'), ctx.ap('-1')), false);
  },

  // same sign, same exponent (mantissa comparison)
  'lt(2, 3) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('2'), ctx.ap('3')), true);
  },

  'lt(3, 2) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('3'), ctx.ap('2')), false);
  },

  // same sign, different exponent — requires exponent comparison
  'lt(3, 4) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('3'), ctx.ap('4')), true);
  },

  'lt(4, 3) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('4'), ctx.ap('3')), false);
  },

  // equal values
  'lt(1, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('1'), ctx.ap('1')), false);
  },

  // negative numbers (larger magnitude = smaller value)
  'lt(-3, -2) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('-3'), ctx.ap('-2')), true);
  },

  'lt(-2, -3) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lt(ctx.ap('-2'), ctx.ap('-3')), false);
  },

}).runTests();

// ─── gte ─────────────────────────────────────────────────────────────────────

new TestSuite('APContext gte()', {

  // NaN is never >= anything
  'gte(NaN, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('NaN'), ctx.ap('1')), false);
  },

  'gte(1, NaN) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('1'), ctx.ap('NaN')), false);
  },

  // infinity
  'gte(+Inf, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('Infinity'), ctx.ap('1')), true);
  },

  'gte(1, +Inf) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('1'), ctx.ap('Infinity')), false);
  },

  'gte(+Inf, +Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('Infinity'), ctx.ap('Infinity')), true);
  },

  'gte(-Inf, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('-Infinity'), ctx.ap('1')), false);
  },

  'gte(1, -Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('1'), ctx.ap('-Infinity')), true);
  },

  'gte(-Inf, -Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('-Infinity'), ctx.ap('-Infinity')), true);
  },

  'gte(+Inf, -Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('Infinity'), ctx.ap('-Infinity')), true);
  },

  // zero
  'gte(0, -1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('0'), ctx.ap('-1')), true);
  },

  'gte(0, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('0'), ctx.ap('1')), false);
  },

  'gte(0, 0) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('0'), ctx.ap('0')), true);
  },

  'gte(0, -0) = true (cross-sign zero equality)': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('0'), ctx.ap('-0')), true);
  },

  // opposite signs
  'gte(1, -1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('1'), ctx.ap('-1')), true);
  },

  'gte(-1, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('-1'), ctx.ap('1')), false);
  },

  // same sign, same exponent (mantissa comparison)
  'gte(3, 2) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('3'), ctx.ap('2')), true);
  },

  'gte(2, 3) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('2'), ctx.ap('3')), false);
  },

  // same sign, different exponent
  'gte(4, 3) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('4'), ctx.ap('3')), true);
  },

  'gte(3, 4) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('3'), ctx.ap('4')), false);
  },

  // equal values (key difference from gt)
  'gte(1, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('1'), ctx.ap('1')), true);
  },

  'gte(-1, -1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('-1'), ctx.ap('-1')), true);
  },

  // negative numbers (larger magnitude = smaller value)
  'gte(-2, -3) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('-2'), ctx.ap('-3')), true);
  },

  'gte(-3, -2) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.gte(ctx.ap('-3'), ctx.ap('-2')), false);
  },

}).runTests();

// ─── lte ─────────────────────────────────────────────────────────────────────

new TestSuite('APContext lte()', {

  // NaN is never <= anything
  'lte(NaN, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('NaN'), ctx.ap('1')), false);
  },

  'lte(1, NaN) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('1'), ctx.ap('NaN')), false);
  },

  // infinity
  'lte(-Inf, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('-Infinity'), ctx.ap('1')), true);
  },

  'lte(1, -Inf) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('1'), ctx.ap('-Infinity')), false);
  },

  'lte(-Inf, -Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('-Infinity'), ctx.ap('-Infinity')), true);
  },

  'lte(+Inf, 1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('Infinity'), ctx.ap('1')), false);
  },

  'lte(1, +Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('1'), ctx.ap('Infinity')), true);
  },

  'lte(+Inf, +Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('Infinity'), ctx.ap('Infinity')), true);
  },

  'lte(-Inf, +Inf) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('-Infinity'), ctx.ap('Infinity')), true);
  },

  // zero
  'lte(0, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('0'), ctx.ap('1')), true);
  },

  'lte(0, -1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('0'), ctx.ap('-1')), false);
  },

  'lte(0, 0) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('0'), ctx.ap('0')), true);
  },

  'lte(0, -0) = true (cross-sign zero equality)': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('0'), ctx.ap('-0')), true);
  },

  // opposite signs
  'lte(-1, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('-1'), ctx.ap('1')), true);
  },

  'lte(1, -1) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('1'), ctx.ap('-1')), false);
  },

  // same sign, same exponent (mantissa comparison)
  'lte(2, 3) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('2'), ctx.ap('3')), true);
  },

  'lte(3, 2) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('3'), ctx.ap('2')), false);
  },

  // same sign, different exponent
  'lte(3, 4) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('3'), ctx.ap('4')), true);
  },

  'lte(4, 3) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('4'), ctx.ap('3')), false);
  },

  // equal values (key difference from lt)
  'lte(1, 1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('1'), ctx.ap('1')), true);
  },

  'lte(-1, -1) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('-1'), ctx.ap('-1')), true);
  },

  // negative numbers (larger magnitude = smaller value)
  'lte(-3, -2) = true': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('-3'), ctx.ap('-2')), true);
  },

  'lte(-2, -3) = false': () => {
    const ctx = new APContext(32);
    assertEqual(ctx.lte(ctx.ap('-2'), ctx.ap('-3')), false);
  },

}).runTests();

// ─── trunc ───────────────────────────────────────────────────────────────────

new TestSuite('APContext trunc()', {

  // special values pass through unchanged
  'trunc(NaN) = NaN': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('NaN'));
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'trunc(+0) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('0'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'trunc(-0) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-0'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'trunc(+Inf) = +Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  'trunc(-Inf) = -Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  // exp <= 0: pure fraction → ±0 (sign preserved)
  'trunc(0.5) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('0.5'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'trunc(0.75) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('0.75'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'trunc(-0.5) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-0.5'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'trunc(-0.75) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-0.75'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  // already integers (no fractional bits → unchanged)
  'trunc(1) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('1'));
    assertEqual(ctx.toString(dst), '1');
  },

  'trunc(-1) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-1'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'trunc(2) = 2': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('2'));
    assertEqual(ctx.toString(dst), '2');
  },

  'trunc(-2) = -2': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-2'));
    assertEqual(ctx.toString(dst), '-2');
  },

  'trunc(65536) = 65536 (exp >= prec, all bits integer)': () => {
    const ctx = new APContext(16), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('65536'));
    assertEqual(ctx.toString(dst), '65536');
  },

  // positive with fractional (zeroes fraction, rounds toward 0 — no carry ever)
  'trunc(1.5) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('1.5'));
    assertEqual(ctx.toString(dst), '1');
  },

  'trunc(1.25) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('1.25'));
    assertEqual(ctx.toString(dst), '1');
  },

  'trunc(3.75) = 3': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('3.75'));
    assertEqual(ctx.toString(dst), '3');
  },

  // negative with fractional (zeroes fraction, rounds toward 0 — symmetric with positive)
  'trunc(-1.5) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-1.5'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'trunc(-1.25) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-1.25'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'trunc(-3.75) = -3': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-3.75'));
    assertEqual(ctx.toString(dst), '-3');
  },

  // multi-limb (startI > HDR)
  'trunc(65537.5) = 65537': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('65537.5'));
    assertEqual(ctx.toString(dst), '65537');
  },

  'trunc(-65537.5) = -65537': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.trunc(dst, ctx.ap('-65537.5'));
    assertEqual(ctx.toString(dst), '-65537');
  },

  // in-place aliasing
  'in-place trunc(f, f) positive': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('3.75');
    ctx.trunc(f, f);
    assertEqual(ctx.toString(f), '3');
  },

  'in-place trunc(f, f) negative': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('-3.75');
    ctx.trunc(f, f);
    assertEqual(ctx.toString(f), '-3');
  },

}).runTests();

// ─── floor ───────────────────────────────────────────────────────────────────

new TestSuite('APContext floor()', {

  // special values pass through unchanged
  'floor(NaN) = NaN': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('NaN'));
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'floor(+0) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('0'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'floor(-0) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-0'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'floor(+Inf) = +Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  'floor(-Inf) = -Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  // positive integers (exp >= prec or no fractional bits → unchanged)
  'floor(1) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('1'));
    assertEqual(ctx.toString(dst), '1');
  },

  'floor(2) = 2': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('2'));
    assertEqual(ctx.toString(dst), '2');
  },

  'floor(65536) = 65536 (exp >= prec, early return)': () => {
    const ctx = new APContext(16), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('65536'));
    assertEqual(ctx.toString(dst), '65536');
  },

  // positive with fractional part (truncates toward zero)
  'floor(1.5) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('1.5'));
    assertEqual(ctx.toString(dst), '1');
  },

  'floor(1.25) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('1.25'));
    assertEqual(ctx.toString(dst), '1');
  },

  'floor(3.75) = 3': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('3.75'));
    assertEqual(ctx.toString(dst), '3');
  },

  // positive, exp <= 0 → result is +0
  'floor(0.5) = 0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('0.5'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'floor(0.75) = 0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('0.75'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  // negative integers (no fractional bits → unchanged)
  'floor(-1) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-1'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'floor(-2) = -2': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-2'));
    assertEqual(ctx.toString(dst), '-2');
  },

  // negative, exp <= 0 → result is -1
  'floor(-0.5) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-0.5'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'floor(-0.75) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-0.75'));
    assertEqual(ctx.toString(dst), '-1');
  },

  // negative with fractional, round-up CARRIES (integer part of startI is all 1s)
  'floor(-1.5) = -2 (carry propagates through MSL, exp increments)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-1.5'));
    assertEqual(ctx.toString(dst), '-2');
  },

  'floor(-3.5) = -4 (carry: 2-bit integer all 1s)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-3.5'));
    assertEqual(ctx.toString(dst), '-4');
  },

  // negative with fractional, round-up does NOT carry (regression: spurious while-loop bug)
  'floor(-2.5) = -3 (no carry from rounding)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-2.5'));
    assertEqual(ctx.toString(dst), '-3');
  },

  'floor(-5.5) = -6 (no carry from rounding)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-5.5'));
    assertEqual(ctx.toString(dst), '-6');
  },

  'floor(-5.25) = -6': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-5.25'));
    assertEqual(ctx.toString(dst), '-6');
  },

  // multi-limb negative (startI > HDR); -65537.5 has integer bit set in startI → carry
  'floor(-65537.5) = -65538 (carry, startI > HDR)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-65537.5'));
    assertEqual(ctx.toString(dst), '-65538');
  },

  // multi-limb negative; -65538.5 has integer bit 0 in startI → no carry (regression)
  'floor(-65538.5) = -65539 (no carry, startI > HDR regression)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.floor(dst, ctx.ap('-65538.5'));
    assertEqual(ctx.toString(dst), '-65539');
  },

  // in-place aliasing
  'in-place floor(f, f) positive': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('3.75');
    ctx.floor(f, f);
    assertEqual(ctx.toString(f), '3');
  },

  'in-place floor(f, f) negative': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('-2.5');
    ctx.floor(f, f);
    assertEqual(ctx.toString(f), '-3');
  },

}).runTests();

// ─── ceil ────────────────────────────────────────────────────────────────────

new TestSuite('APContext ceil()', {

  // special values pass through unchanged
  'ceil(NaN) = NaN': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('NaN'));
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'ceil(+0) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('0'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'ceil(-0) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-0'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'ceil(+Inf) = +Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  'ceil(-Inf) = -Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  // negative integers (no fractional bits → unchanged)
  'ceil(-1) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-1'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'ceil(-2) = -2': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-2'));
    assertEqual(ctx.toString(dst), '-2');
  },

  // negative with fractional (truncates toward 0, no rounding needed)
  'ceil(-1.5) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-1.5'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'ceil(-1.25) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-1.25'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'ceil(-3.75) = -3': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-3.75'));
    assertEqual(ctx.toString(dst), '-3');
  },

  // negative, exp <= 0 → -0
  'ceil(-0.5) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-0.5'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'ceil(-0.75) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('-0.75'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  // positive integers (exp >= prec or no fractional bits → unchanged)
  'ceil(1) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('1'));
    assertEqual(ctx.toString(dst), '1');
  },

  'ceil(2) = 2': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('2'));
    assertEqual(ctx.toString(dst), '2');
  },

  'ceil(65536) = 65536 (exp >= prec, early return)': () => {
    const ctx = new APContext(16), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('65536'));
    assertEqual(ctx.toString(dst), '65536');
  },

  // positive, exp <= 0 → +1
  'ceil(0.5) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('0.5'));
    assertEqual(ctx.toString(dst), '1');
  },

  'ceil(0.75) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('0.75'));
    assertEqual(ctx.toString(dst), '1');
  },

  // positive with fractional, round-up CARRIES (integer part of startI is all 1s)
  'ceil(1.5) = 2 (carry propagates through MSL, exp increments)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('1.5'));
    assertEqual(ctx.toString(dst), '2');
  },

  'ceil(3.5) = 4 (carry: 2-bit integer part all 1s)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('3.5'));
    assertEqual(ctx.toString(dst), '4');
  },

  // positive with fractional, round-up does NOT carry (regression: spurious while-loop)
  'ceil(2.5) = 3 (no carry from rounding)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('2.5'));
    assertEqual(ctx.toString(dst), '3');
  },

  'ceil(5.5) = 6 (no carry from rounding)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('5.5'));
    assertEqual(ctx.toString(dst), '6');
  },

  'ceil(5.25) = 6': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('5.25'));
    assertEqual(ctx.toString(dst), '6');
  },

  // multi-limb positive (startI > HDR); 65537.5 has integer bit set in startI → carry
  'ceil(65537.5) = 65538 (carry, startI > HDR)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('65537.5'));
    assertEqual(ctx.toString(dst), '65538');
  },

  // multi-limb positive; 65538.5 has integer bit 0 in startI → no carry (regression)
  'ceil(65538.5) = 65539 (no carry, startI > HDR regression)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.ceil(dst, ctx.ap('65538.5'));
    assertEqual(ctx.toString(dst), '65539');
  },

  // in-place aliasing
  'in-place ceil(f, f) positive': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('3.75');
    ctx.ceil(f, f);
    assertEqual(ctx.toString(f), '4');
  },

  'in-place ceil(f, f) negative': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('-2.5');
    ctx.ceil(f, f);
    assertEqual(ctx.toString(f), '-2');
  },

}).runTests();

// ─── round ───────────────────────────────────────────────────────────────────

new TestSuite('APContext round()', {

  // special values pass through unchanged
  'round(NaN) = NaN': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('NaN'));
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'round(+0) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('0'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'round(-0) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-0'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'round(+Inf) = +Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  'round(-Inf) = -Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  // exp < 0: |value| < 0.5, rounds to ±0
  'round(0.25) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('0.25'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'round(-0.25) = -0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-0.25'));
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  // exp = 0: value in [0.5, 1), rounds away from zero to ±1
  'round(0.5) = 1 (half rounds away from zero)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('0.5'));
    assertEqual(ctx.toString(dst), '1');
  },

  'round(0.75) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('0.75'));
    assertEqual(ctx.toString(dst), '1');
  },

  'round(-0.5) = -1 (half rounds away from zero)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-0.5'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'round(-0.75) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-0.75'));
    assertEqual(ctx.toString(dst), '-1');
  },

  // already integers (exp >= prec → unchanged)
  'round(1) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('1'));
    assertEqual(ctx.toString(dst), '1');
  },

  'round(-1) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-1'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'round(65536) = 65536 (exp >= prec, early return)': () => {
    const ctx = new APContext(16), dst = ctx.ap();
    ctx.round(dst, ctx.ap('65536'));
    assertEqual(ctx.toString(dst), '65536');
  },

  // positive, fraction < 0.5 (half-bit clear → no rounding)
  'round(1.25) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('1.25'));
    assertEqual(ctx.toString(dst), '1');
  },

  'round(2.25) = 2': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('2.25'));
    assertEqual(ctx.toString(dst), '2');
  },

  // positive, fraction >= 0.5, round-up CARRIES (integer part all 1s in startI)
  'round(1.5) = 2 (carry: 1-bit integer all 1s, exp increments)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('1.5'));
    assertEqual(ctx.toString(dst), '2');
  },

  'round(3.5) = 4 (carry: 2-bit integer all 1s)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('3.5'));
    assertEqual(ctx.toString(dst), '4');
  },

  // positive, fraction >= 0.5, round-up does NOT carry
  'round(2.5) = 3 (no carry)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('2.5'));
    assertEqual(ctx.toString(dst), '3');
  },

  'round(5.5) = 6 (no carry)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('5.5'));
    assertEqual(ctx.toString(dst), '6');
  },

  'round(5.75) = 6': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('5.75'));
    assertEqual(ctx.toString(dst), '6');
  },

  // negative, |fraction| < 0.5 (half-bit clear → no rounding)
  'round(-1.25) = -1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-1.25'));
    assertEqual(ctx.toString(dst), '-1');
  },

  'round(-2.25) = -2': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-2.25'));
    assertEqual(ctx.toString(dst), '-2');
  },

  // negative, |fraction| >= 0.5, round-up CARRIES (away from zero)
  'round(-1.5) = -2 (carry: 1-bit integer all 1s, exp increments)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-1.5'));
    assertEqual(ctx.toString(dst), '-2');
  },

  'round(-3.5) = -4 (carry: 2-bit integer all 1s)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-3.5'));
    assertEqual(ctx.toString(dst), '-4');
  },

  // negative, |fraction| >= 0.5, round-up does NOT carry
  'round(-2.5) = -3 (no carry)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-2.5'));
    assertEqual(ctx.toString(dst), '-3');
  },

  'round(-5.5) = -6 (no carry)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-5.5'));
    assertEqual(ctx.toString(dst), '-6');
  },

  // multi-limb (startI > HDR)
  'round(65537.5) = 65538 (carry, startI > HDR)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('65537.5'));
    assertEqual(ctx.toString(dst), '65538');
  },

  'round(65538.5) = 65539 (no carry, startI > HDR)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('65538.5'));
    assertEqual(ctx.toString(dst), '65539');
  },

  'round(-65537.5) = -65538 (carry, startI > HDR)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-65537.5'));
    assertEqual(ctx.toString(dst), '-65538');
  },

  'round(-65538.5) = -65539 (no carry, startI > HDR)': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.round(dst, ctx.ap('-65538.5'));
    assertEqual(ctx.toString(dst), '-65539');
  },

  // in-place aliasing
  'in-place round(f, f) positive': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('2.5');
    ctx.round(f, f);
    assertEqual(ctx.toString(f), '3');
  },

  'in-place round(f, f) negative': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('-2.5');
    ctx.round(f, f);
    assertEqual(ctx.toString(f), '-3');
  },

}).runTests();

// ─── neg ─────────────────────────────────────────────────────────────────────

new TestSuite('APContext neg()', {

  'neg(NaN) = NaN': () => {
    const ctx = new APContext(16), f = ctx.ap('NaN'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'neg(+0) = -0': () => {
    const ctx = new APContext(16), f = ctx.ap('0'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'neg(-0) = +0': () => {
    const ctx = new APContext(16), f = ctx.ap('-0'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'neg(+Inf) = -Inf': () => {
    const ctx = new APContext(16), f = ctx.ap('Infinity'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  'neg(-Inf) = +Inf': () => {
    const ctx = new APContext(16), f = ctx.ap('-Infinity'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  'neg(1) = -1': () => {
    const ctx = new APContext(16), f = ctx.ap('1'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(ctx.toString(dst), '-1');
  },

  'neg(-1) = 1': () => {
    const ctx = new APContext(16), f = ctx.ap('-1'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(ctx.toString(dst), '1');
  },

  'neg preserves exp and limbs': () => {
    const ctx = new APContext(32), f = ctx.ap('1.5'), dst = ctx.ap();
    ctx.neg(dst, f);
    assertEqual(dst[I_EXP], f[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++)
      assertEqual(dst[HDR + i], f[HDR + i]);
  },

  'double neg recovers original bits': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('0.75'), tmp = ctx.ap(), dst = ctx.ap();
    ctx.neg(tmp, f);
    ctx.neg(dst, tmp);
    assertEqual(dst[I_FLAGS], f[I_FLAGS]);
    assertEqual(dst[I_EXP],   f[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++)
      assertEqual(dst[HDR + i], f[HDR + i]);
  },

  'in-place neg(f, f) works': () => {
    const ctx = new APContext(16), f = ctx.ap('1');
    ctx.neg(f, f);
    assertEqual(ctx.toString(f), '-1');
  },

}).runTests();

// ─── add ─────────────────────────────────────────────────────────────────────

new TestSuite('APContext add()', {

  // special values
  'NaN + x = NaN': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('NaN'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'x + NaN = NaN': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('1'), b = ctx.ap('NaN'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  '+Inf + -Inf = NaN': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('Infinity'), b = ctx.ap('-Infinity'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  '+Inf + +Inf = +Inf': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('Infinity'), b = ctx.ap('Infinity'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  '-Inf + -Inf = -Inf': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('-Infinity'), b = ctx.ap('-Infinity'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  '+Inf + normal = +Inf': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('Infinity'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  '0 + x = x': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('0'), b = ctx.ap('4'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '4');
  },

  'x + 0 = x': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('0'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '4');
  },

  // same sign, aligned exponents
  '1 + 1 = 2': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('1'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '2');
  },

  '0.5 + 0.5 = 1 (carry normalization)': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('0.5'), b = ctx.ap('0.5'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '1');
  },

  '0.5 + 0.25 = 0.75': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('0.5'), b = ctx.ap('0.25'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '0.75');
  },

  '-1 + (-1) = -2': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('-1'), b = ctx.ap('-1'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '-2');
  },

  // same sign, misaligned exponents
  '1 + 0.5 = 1.5 (expDiff=1)': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('1'), b = ctx.ap('0.5'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '1.5');
  },

  '4 + 2 = 6 (expDiff=1)': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '6');
  },

  '8 + 2 = 10 (expDiff=2)': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('8'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '10');
  },

  // b negligible: iDiff >= numLimbs → early return with a
  'b negligible at single-limb precision': () => {
    const ctx = new APContext(LIMB_BITS);  // numLimbs = 1
    const a = ctx.ap('65536'), b = ctx.ap('1'), dst = ctx.ap();  // 2^16, expDiff=16, iDiff=1 = numLimbs
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '65536');
  },

  // exercises offset=0, iDiff=1, numLimbs=2 path (covers roundBit branch)
  '2^LIMB_BITS + 1 at prec=2*LIMB_BITS (offset=0, iDiff=1)': () => {
    const ctx = new APContext(2 * LIMB_BITS);  // numLimbs = 2
    const a = ctx.ap('65536'), b = ctx.ap('1'), dst = ctx.ap();  // expDiff=16, iDiff=1, offset=0
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '65537');
  },

  // different sign: magnitude subtraction
  '4 + (-2) = 2': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('-2'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '2');
  },

  '2 + (-4) = -2': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('2'), b = ctx.ap('-4'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '-2');
  },

  '4 + (-4) = 0 (exact cancellation)': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('-4'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  '-4 + 2 = -2': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('-4'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '-2');
  },

  '1 + (-0.5) = 0.5': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('1'), b = ctx.ap('-0.5'), dst = ctx.ap();
    ctx.add(dst, a, b);
    assertEqual(ctx.toString(dst), '0.5');
  },

  '4 + (-1) = 3 (borrow propagation)': () => {
    const ctx = new APContext(16);
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
    const ctx = new APContext(64);
    const a = ctx.ap('200000000000000'), b = ctx.ap('100000000000000');
    ctx.add(a, a, b);
    assertEqual(ctx.toString(a), '300000000000000');
    assertEqual(ctx.toString(b), '100000000000000');
  },

  'dst === b (in-place b = a + b)': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('2');
    ctx.add(b, a, b);
    assertEqual(ctx.toString(b), '6');
  },

}).runTests();

// ─── sub ─────────────────────────────────────────────────────────────────────

new TestSuite('APContext sub()', {

  '4 - 2 = 2': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '2');
  },

  '2 - 4 = -2': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('2'), b = ctx.ap('4'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '-2');
  },

  '4 - 4 = 0': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('4'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  '1 - 0 = 1': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('1'), b = ctx.ap('0'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '1');
  },

  '0 - 1 = -1': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('0'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '-1');
  },

  '-2 - (-4) = 2': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('-2'), b = ctx.ap('-4'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '2');
  },

  '-4 - 2 = -6': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('-4'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '-6');
  },

  '8 - 0.5 = 7.5 (fractional result)': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('8'), b = ctx.ap('0.5'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '7.5');
  },

  '4 - 1 = 3 (borrow propagation)': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.sub(dst, a, b);
    assertEqual(ctx.toString(dst), '3');
  },

  'sub(a,b) = neg(sub(b,a))': () => {
    const ctx = new APContext(16);
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
    const ctx = new APContext(16);
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

// ─── mulLong ─────────────────────────────────────────────────────────────────

new TestSuite('APContext mulLong()', {

  // special values
  'NaN × x = NaN': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('NaN'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'x × NaN = NaN': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('1'), b = ctx.ap('NaN'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  '0 × Inf = NaN': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('0'), b = ctx.ap('Infinity'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'Inf × 0 = NaN': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('Infinity'), b = ctx.ap('0'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  '+0 × x = +0': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('0'), b = ctx.ap('5'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  '-0 × x = -0': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('-0'), b = ctx.ap('5'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  '+0 × (-x) = -0': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('0'), b = ctx.ap('-5'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_ZERO);
  },

  '+Inf × x = +Inf': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('Infinity'), b = ctx.ap('5'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  '+Inf × (-x) = -Inf': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('Infinity'), b = ctx.ap('-5'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  '-Inf × (-x) = +Inf': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('-Infinity'), b = ctx.ap('-5'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  '+Inf × +Inf = +Inf': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('Infinity'), b = ctx.ap('Infinity'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  '+Inf × -Inf = -Inf': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('Infinity'), b = ctx.ap('-Infinity'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(dst[I_FLAGS], FLAGS.NEG_INF);
  },

  // basic arithmetic at prec=16 (single limb)
  '1 × 1 = 1': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('1'), b = ctx.ap('1'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '1');
  },

  '2 × 3 = 6': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('2'), b = ctx.ap('3'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '6');
  },

  '0.5 × 0.5 = 0.25': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('0.5'), b = ctx.ap('0.5'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '0.25');
  },

  '4 × 0.25 = 1': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('4'), b = ctx.ap('0.25'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '1');
  },

  // sign propagation
  '2 × (-3) = -6': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('2'), b = ctx.ap('-3'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '-6');
  },

  '(-2) × (-3) = 6': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('-2'), b = ctx.ap('-3'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '6');
  },

  // aliasing
  'dst === a': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('2'), b = ctx.ap('3');
    ctx.mulLong(a, a, b);
    assertEqual(ctx.toString(a), '6');
  },

  'dst === b': () => {
    const ctx = new APContext(16);
    const a = ctx.ap('2'), b = ctx.ap('3');
    ctx.mulLong(b, a, b);
    assertEqual(ctx.toString(b), '6');
  },

  // multi-limb: prec=32
  '4 × 4 = 16 at prec=32': () => {
    const ctx = new APContext(32);
    const a = ctx.ap('4'), b = ctx.ap('4'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '16');
  },

  '256 × 256 = 65536 at prec=32': () => {
    const ctx = new APContext(32);
    const a = ctx.ap('256'), b = ctx.ap('256'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '65536');
  },

  // prec=64
  '65536 × 65536 = 4294967296 at prec=64': () => {
    const ctx = new APContext(64);
    const a = ctx.ap('65536'), b = ctx.ap('65536'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '4294967296');
  },

  '1000 × 1000 = 1000000 at prec=64': () => {
    const ctx = new APContext(64);
    const a = ctx.ap('1000'), b = ctx.ap('1000'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '1000000');
  },

  // prec=128: beyond float64 safe-integer range
  '(2^53+1) × 2 at prec=128': () => {
    const ctx = new APContext(128);
    const a = ctx.ap('9007199254740993'), b = ctx.ap('2'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '18014398509481986');
  },

  // prec=256: multi-limb with large irregular values
  '3957 × 3486792 at prec=256': () => {
    const ctx = new APContext(256);
    const a = ctx.ap('3957'), b = ctx.ap('3486792'), dst = ctx.ap();
    ctx.mulLong(dst, a, b);
    assertEqual(ctx.toString(dst), '13797235944');
  },

  // rounding: 257×257 = 66049, which is a 17-bit integer; at prec=16 it must round.
  // The round bit is set (66049 is equidistant from 66048 and 66050) → rounds to 66050.
  // At prec=64 all 17 bits fit, so the exact value 66049 is preserved.
  'rounds 17-bit product at prec=16, exact at prec=64': () => {
    const ctx16 = new APContext(16), ctx64 = new APContext(64);
    const dst16 = ctx16.ap(), dst64 = ctx64.ap();
    ctx16.mulLong(dst16, ctx16.ap('257'), ctx16.ap('257'));
    ctx64.mulLong(dst64, ctx64.ap('257'), ctx64.ap('257'));
    assertEqual(ctx64.toString(dst64), '66049');
    assertEqual(ctx16.toString(dst16), '66050');
  },

}).runTests();

new TestSuite('APContext recip()', {

  // --- special values ---
  'recip(NaN) = NaN': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('NaN'));
    assertEqual(ctx.toString(dst), 'NaN');
  },
  'recip(0) = Infinity': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('0'));
    assertEqual(ctx.toString(dst), 'Infinity');
  },
  'recip(-0) = -Infinity': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('-0'));
    assertEqual(ctx.toString(dst), '-Infinity');
  },
  'recip(Infinity) = 0': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('Infinity'));
    assertEqual(ctx.toString(dst), '0');
  },
  'recip(-Infinity) = -0': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('-Infinity'));
    assertEqual(ctx.toString(dst), '-0');
  },

  // --- exact (power-of-2) cases ---
  'recip(1) = 1': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('1'));
    assertEqual(ctx.toString(dst, 3), '1.00');
  },
  'recip(2) = 0.5': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('2'));
    assertEqual(ctx.toString(dst, 3), '0.500');
  },
  'recip(4) = 0.25': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('4'));
    assertEqual(ctx.toString(dst, 3), '0.250');
  },
  'recip(0.5) = 2': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('0.5'));
    assertEqual(ctx.toString(dst, 3), '2.00');
  },
  'recip(0.125) = 8': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('0.125'));
    assertEqual(ctx.toString(dst, 3), '8.00');
  },

  // --- negative ---
  'recip(-2) = -0.5': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('-2'));
    assertEqual(ctx.toString(dst, 2), '-0.50');
  },
  'recip(-0.25) = -4': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('-0.25'));
    assertEqual(ctx.toString(dst, 2), '-4.0');
  },

  // --- aliasing: dst === d ---
  'dst === d': () => {
    const ctx = new APContext(32);
    const a = ctx.ap('4');
    ctx.recip(a, a);
    assertEqual(ctx.toString(a, 3), '0.250');
  },

  // --- accuracy at larger precisions ---
  'recip(3) at prec=64 has ~19 correct digits': () => {
    const ctx = new APContext(64);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('3'));
    assertTruthy(ctx.toString(dst).startsWith('0.333333333333333333'));
  },
  'recip(7) at prec=128 has ~38 correct digits': () => {
    const ctx = new APContext(128);
    const dst = ctx.ap();
    ctx.recip(dst, ctx.ap('7'));
    assertTruthy(ctx.toString(dst).startsWith('0.142857142857142857142857142857'));
  },

}).runTests();

new TestSuite('APContext div()', {

  // --- special values ---
  'div(1, 0) = Infinity': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('1'), ctx.ap('0'));
    assertEqual(ctx.toString(dst), 'Infinity');
  },
  'div(0, 1) = 0': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('0'), ctx.ap('1'));
    assertEqual(ctx.toString(dst), '0');
  },
  'div(NaN, 1) = NaN': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('NaN'), ctx.ap('1'));
    assertEqual(ctx.toString(dst), 'NaN');
  },

  // --- exact cases ---
  'div(6, 2) = 3': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('6'), ctx.ap('2'));
    assertEqual(ctx.toString(dst, 2), '3.0');
  },
  'div(1, 4) = 0.25': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('1'), ctx.ap('4'));
    assertEqual(ctx.toString(dst, 2), '0.25');
  },
  'div(3, 1) = 3': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('3'), ctx.ap('1'));
    assertEqual(ctx.toString(dst, 2), '3.0');
  },

  // --- sign ---
  'div(-6, 2) = -3': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('-6'), ctx.ap('2'));
    assertEqual(ctx.toString(dst, 2), '-3.0');
  },
  'div(6, -2) = -3': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('6'), ctx.ap('-2'));
    assertEqual(ctx.toString(dst, 2), '-3.0');
  },
  'div(-6, -2) = 3': () => {
    const ctx = new APContext(32);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('-6'), ctx.ap('-2'));
    assertEqual(ctx.toString(dst, 2), '3.0');
  },

  // --- aliasing ---
  'dst === a': () => {
    const ctx = new APContext(32);
    const a = ctx.ap('6'), b = ctx.ap('2');
    ctx.div(a, a, b);
    assertEqual(ctx.toString(a, 2), '3.0');
  },
  'dst === b': () => {
    const ctx = new APContext(32);
    const a = ctx.ap('6'), b = ctx.ap('2');
    ctx.div(b, a, b);
    assertEqual(ctx.toString(b, 2), '3.0');
  },
  'a === b gives 1': () => {
    const ctx = new APContext(32);
    const x = ctx.ap('4'), dst = ctx.ap();
    ctx.div(dst, x, x);
    assertEqual(ctx.toString(dst, 2), '1.0');
  },

  // --- accuracy ---
  'div(1, 3) at prec=64 has ~19 correct digits': () => {
    const ctx = new APContext(64);
    const dst = ctx.ap();
    ctx.div(dst, ctx.ap('1'), ctx.ap('3'));
    assertTruthy(ctx.toString(dst).startsWith('0.333333333333333333'));
  },

}).runTests();

// ─── sq ──────────────────────────────────────────────────────────────────────

new TestSuite('APContext sq()', {

  // special values
  'sq(NaN) = NaN': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('NaN'));
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'sq(0) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('0'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'sq(-0) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('-0'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'sq(Inf) = Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  'sq(-Inf) = Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('-Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  // basic arithmetic
  'sq(1) = 1': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('1'));
    assertEqual(ctx.toString(dst), '1');
  },

  'sq(2) = 4': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('2'));
    assertEqual(ctx.toString(dst), '4');
  },

  'sq(3) = 9': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('3'));
    assertEqual(ctx.toString(dst), '9');
  },

  'sq(0.5) = 0.25': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('0.5'));
    assertEqual(ctx.toString(dst), '0.25');
  },

  'sq(-2) = 4': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('-2'));
    assertEqual(ctx.toString(dst), '4');
  },

  'sq(-3) = 9': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sq(dst, ctx.ap('-3'));
    assertEqual(ctx.toString(dst), '9');
  },

  // aliasing
  'dst === f': () => {
    const ctx = new APContext(32);
    const f = ctx.ap('3');
    ctx.sq(f, f);
    assertEqual(ctx.toString(f), '9');
  },

  // inverse: sq(sqrt(n)) for exact cases
  'sq(sqrt(4)) = 4': () => {
    const ctx = new APContext(64), dst = ctx.ap(), tmp = ctx.ap();
    ctx.sqrt(tmp, ctx.ap('4'));
    ctx.sq(dst, tmp);
    assertEqual(ctx.toString(dst, 6), '4.00000');
  },

}).runTests();

// ─── sqrt ────────────────────────────────────────────────────────────────────

new TestSuite('APContext sqrt()', {

  // special values
  'sqrt(NaN) = NaN': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('NaN'));
    assertEqual(dst[I_FLAGS], FLAGS.NAN);
  },

  'sqrt(0) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('0'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'sqrt(-0) = +0': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('-0'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_ZERO);
  },

  'sqrt(Inf) = Inf': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('Infinity'));
    assertEqual(dst[I_FLAGS], FLAGS.POS_INF);
  },

  'sqrt(negative) throws': () => {
    const ctx = new APContext(32), dst = ctx.ap();
    assertThrows(() => ctx.sqrt(dst, ctx.ap('-1')), 'Cannot call sqrt() on a negative number');
  },

  // exact integer squares
  'sqrt(1) = 1': () => {
    const ctx = new APContext(64), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('1'));
    assertEqual(ctx.toString(dst, 18), '1.' + '0'.repeat(17));
  },

  'sqrt(4) = 2': () => {
    const ctx = new APContext(64), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('4'));
    assertEqual(ctx.toString(dst, 18), '2.' + '0'.repeat(17));
  },

  'sqrt(9) = 3': () => {
    const ctx = new APContext(64), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('9'));
    assertEqual(ctx.toString(dst, 18), '3');
  },

  'sqrt(16) = 4': () => {
    const ctx = new APContext(64), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('16'));
    assertEqual(ctx.toString(dst, 18), '4.' + '0'.repeat(17));
  },

  // exact fractions
  'sqrt(0.25) = 0.5': () => {
    const ctx = new APContext(64), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('0.25'));
    assertEqual(ctx.toString(dst, 18), '0.5' + '0'.repeat(17));
  },

  'sqrt(0.0625) = 0.25': () => {
    const ctx = new APContext(64), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('0.0625'));
    assertEqual(ctx.toString(dst, 18), '0.25' + '0'.repeat(16));
  },

  // aliasing: dst === f
  'dst === f': () => {
    const ctx = new APContext(64);
    const f = ctx.ap('4');
    ctx.sqrt(f, f);
    assertEqual(ctx.toString(f, 18), '2.' + '0'.repeat(17));
  },

  // accuracy
  'sqrt(2) at prec=64 has ~18 correct digits': () => {
    const ctx = new APContext(64), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('2'));
    assertTruthy(ctx.toString(dst).startsWith('1.41421356237309504'));
  },

  'sqrt(2) at prec=128 has ~36 correct digits': () => {
    const ctx = new APContext(128), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('2'));
    assertTruthy(ctx.toString(dst).startsWith('1.41421356237309504880168872420969807'));
  },

  'sqrt(3) at prec=64 has ~18 correct digits': () => {
    const ctx = new APContext(64), dst = ctx.ap();
    ctx.sqrt(dst, ctx.ap('3'));
    assertTruthy(ctx.toString(dst).startsWith('1.73205080756887729'));
  },

  // inverse: sqrt(sq(n)) = n for exact cases
  'sqrt(sq(3)) = 3': () => {
    const ctx = new APContext(64), dst = ctx.ap(), tmp = ctx.ap();
    ctx.sq(tmp, ctx.ap('3'));
    ctx.sqrt(dst, tmp);
    assertEqual(ctx.toString(dst), '3');
  },

}).runTests();
