import { TestSuite } from '../assert-js/test-suite.js';
import { assertEqual, assert, assertInstance } from '../assert-js/assert.js';
import { APContext, FLAGS, I_PREC, I_FLAGS, I_EXP, HDR, LIMB_BITS } from '../ap.js';

const suite = new TestSuite('APContext', {

  // --- constructor ---

  'constructor sets prec': () => {
    assertEqual(new APContext(26).prec, 26);
    assertEqual(new APContext(128).prec, 128);
  },

  'constructor computes numLimbs': () => {
    assertEqual(new APContext(26).numLimbs, 1);
    assertEqual(new APContext(52).numLimbs, 2);
    assertEqual(new APContext(128).numLimbs, Math.ceil(128 / LIMB_BITS));
  },

  'constructor computes size as HDR + numLimbs': () => {
    const ctx = new APContext(52);
    assertEqual(ctx.size, HDR + ctx.numLimbs);
  },

  // --- alloc ---

  'alloc returns Float64Array': () => {
    assertInstance(new APContext(26).alloc(), Float64Array);
  },

  'alloc length matches context size': () => {
    const ctx = new APContext(52);
    assertEqual(ctx.alloc().length, ctx.size);
  },

  'alloc initializes to POS_ZERO': () => {
    assertEqual(new APContext(26).alloc()[I_FLAGS], FLAGS.POS_ZERO);
  },

  'alloc sets prec header': () => {
    const ctx = new APContext(78);
    assertEqual(ctx.alloc()[I_PREC], 78);
  },

  'alloc sets exp to 0': () => {
    assertEqual(new APContext(26).alloc()[I_EXP], 0);
  },

  // --- fromString: special values ---

  'fromString "NaN"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, 'NaN');
    assertEqual(f[I_FLAGS], FLAGS.NAN);
  },

  'fromString "nan" (lowercase)': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, 'nan');
    assertEqual(f[I_FLAGS], FLAGS.NAN);
  },

  'fromString "Infinity"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, 'Infinity');
    assertEqual(f[I_FLAGS], FLAGS.POS_INF);
  },

  'fromString "+inf"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '+inf');
    assertEqual(f[I_FLAGS], FLAGS.POS_INF);
  },

  'fromString "-Infinity"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-Infinity');
    assertEqual(f[I_FLAGS], FLAGS.NEG_INF);
  },

  'fromString "-inf"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-inf');
    assertEqual(f[I_FLAGS], FLAGS.NEG_INF);
  },

  // --- fromString: zero ---

  'fromString "0" is POS_ZERO': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
    assertEqual(f[I_EXP], 0);
  },

  'fromString "-0" is NEG_ZERO': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-0');
    assertEqual(f[I_FLAGS], FLAGS.NEG_ZERO);
  },

  'fromString "0.0" is zero': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.0');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
  },

  'fromString "0e10" is zero': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0e10');
    assertEqual(f[I_FLAGS], FLAGS.POS_ZERO);
  },

  // --- fromString: integer normalization ---
  // value = mantissa_int * 2^(exp - prec), mantissa_int always in [2^(prec-1), 2^prec)
  // For any power-of-two value 2^k: mantissa = 2^(prec-1), exp = k+1

  'fromString "1": flags, exp, mantissa': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '1');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], 1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1)); // 2^25 — normalized MSB
  },

  'fromString "2": exp increments, mantissa unchanged': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '2');
    assertEqual(f[I_EXP], 2);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  'fromString "4": exp increments again': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '4');
    assertEqual(f[I_EXP], 3);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // --- fromString: negative ---

  'fromString "-1": NEG_NORMAL, same mantissa/exp as "1"': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-1');
    assertEqual(f[I_FLAGS], FLAGS.NEG_NORMAL);
    assertEqual(f[I_EXP], 1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // --- fromString: fractions ---
  // 0.5 = 2^-1: exp = 0 (= -1 + 1), mantissa = 2^(prec-1)
  // 0.25 = 2^-2: exp = -1, mantissa = 2^(prec-1)

  'fromString "0.5": exp=0, mantissa=2^(prec-1)': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.5');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], 0);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  'fromString "0.25": exp=-1': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '0.25');
    assertEqual(f[I_FLAGS], FLAGS.POS_NORMAL);
    assertEqual(f[I_EXP], -1);
    assertEqual(f[HDR], 1 << (LIMB_BITS - 1));
  },

  // --- fromString: scientific notation ---
  // These verify consistency, not exact limbs

  'fromString "1e1" matches "10"': () => {
    const ctx = new APContext(52);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1e1');
    ctx.fromString(b, '10');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  'fromString "1.5e2" matches "150"': () => {
    const ctx = new APContext(52);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1.5e2');
    ctx.fromString(b, '150');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  'fromString "1.5e-1" matches "0.15"': () => {
    const ctx = new APContext(52);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '1.5e-1');
    ctx.fromString(b, '0.15');
    assertEqual(a[I_FLAGS], b[I_FLAGS]);
    assertEqual(a[I_EXP],   b[I_EXP]);
    for (let i = 0; i < ctx.numLimbs; i++) assertEqual(a[HDR + i], b[HDR + i]);
  },

  // --- fromString: non-decimal bases ---

  'fromString "0xff" matches "255"': () => {
    const ctx = new APContext(26);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '0xff');
    ctx.fromString(b, '255');
    assertEqual(a[I_EXP], b[I_EXP]);
    assertEqual(a[HDR],   b[HDR]);
  },

  'fromString "0b11111111" matches "255"': () => {
    const ctx = new APContext(26);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '0b11111111');
    ctx.fromString(b, '255');
    assertEqual(a[I_EXP], b[I_EXP]);
    assertEqual(a[HDR],   b[HDR]);
  },

  'fromString "-0xff" is NEG_NORMAL': () => {
    const ctx = new APContext(26), f = ctx.alloc();
    ctx.fromString(f, '-0xff');
    assertEqual(f[I_FLAGS], FLAGS.NEG_NORMAL);
  },

  // --- fromString: whitespace ---

  'fromString trims leading/trailing whitespace': () => {
    const ctx = new APContext(26);
    const a = ctx.alloc(), b = ctx.alloc();
    ctx.fromString(a, '  1  ');
    ctx.fromString(b, '1');
    assertEqual(a[I_EXP], b[I_EXP]);
    assertEqual(a[HDR],   b[HDR]);
  },

});

suite.runTests();
