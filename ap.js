const LIMB_BITS = 26;
const LIMB_BASE = 1 << LIMB_BITS;
const LIMB_MASK = (1 << LIMB_BITS) - 1;

const I_PREC  = 0;
const I_FLAGS = 1;
const I_EXP   = 2;
const HDR     = 3; // Header size

const FLAGS = {
  POS_ZERO:   0,
  NEG_ZERO:   1,
  POS_NORMAL: 2,
  NEG_NORMAL: 3,
  POS_INF:    4,
  NEG_INF:    5,
  NAN:        6,
};

const isNeg    = (f) => f[I_FLAGS] & 1;
const isNormal = (f) => f[I_FLAGS] === 2 || f[I_FLAGS] === 3;
const isZero   = (f) => f[I_FLAGS] <= 1;
const isInf    = (f) => f[I_FLAGS] === 4 || f[I_FLAGS] === 5;
const isNaN    = (f) => f[I_FLAGS] === 6;


export class APContext {
  constructor(prec, guard = 4) {
    this.prec     = prec;
    this.guard    = guard;
    this.numLimbs = Math.ceil(prec / LIMB_BITS);
    this.size     = HDR + this.numLimbs;
  }

  alloc() {
    const f = new Float64Array(this.size);
    f[I_PREC]  = this.prec;
    f[I_FLAGS] = FLAGS.POS_ZERO;
    f[I_EXP]   = 0;
    return f;
  }

  fromString(dst, s) {
    s = s.trim();
    const sl = s.toLowerCase();

    // Special values
    if (sl === 'nan')                                             { dst[I_FLAGS] = FLAGS.NAN;     return; }
    if (sl === 'infinity' || sl === 'inf' || sl === '+infinity' || sl === '+inf') { dst[I_FLAGS] = FLAGS.POS_INF; return; }
    if (sl === '-infinity' || sl === '-inf')                      { dst[I_FLAGS] = FLAGS.NEG_INF; return; }

    // Sign
    let neg = false;
    if      (s[0] === '-') { neg = true; s = s.slice(1); }
    else if (s[0] === '+') {             s = s.slice(1); }

    // Hex / binary / octal integers (BigInt handles these prefixes natively)
    if (/^0[xXbBoO]/.test(s)) {
      _setFromBigInt(dst, BigInt(s), neg, this.prec, this.numLimbs);
      return;
    }

    // Decimal: [digits][.digits][e[+-]digits]
    let fracStr = '', decExp = 0;

    const eIdx = s.search(/[eE]/);
    if (eIdx !== -1) {
      decExp = parseInt(s.slice(eIdx + 1), 10);
      s = s.slice(0, eIdx);
    }

    let intStr = s;
    const dotIdx = s.indexOf('.');
    if (dotIdx !== -1) {
      intStr  = s.slice(0, dotIdx);
      fracStr = s.slice(dotIdx + 1);
    }

    let sig = BigInt((intStr || '0') + fracStr);
    decExp -= fracStr.length;

    if (sig === 0n) {
      dst[I_FLAGS] = neg ? FLAGS.NEG_ZERO : FLAGS.POS_ZERO;
      dst[I_EXP]   = 0;
      return;
    }

    if (decExp >= 0) {
      // Exact: multiply sig by the decimal shift
      _setFromBigInt(dst, sig * (10n ** BigInt(decExp)), neg, this.prec, this.numLimbs);
    } else {
      // Scale up by 2^(prec+guard) before integer division to preserve binary bits
      const shift  = this.prec + this.guard;
      const scaled = (sig << BigInt(shift)) / (10n ** BigInt(-decExp));
      _setFromBigInt(dst, scaled, neg, this.prec, this.numLimbs);
      dst[I_EXP] -= shift;
    }
  }
}

// Converts a non-negative BigInt into the flat-array float format.
// value = val * 2^adjExp (adjExp applied by caller after this returns, default 0)
function _setFromBigInt(dst, val, neg, prec, numLimbs) {
  if (val === 0n) {
    dst[I_FLAGS] = neg ? FLAGS.NEG_ZERO : FLAGS.POS_ZERO;
    dst[I_EXP]   = 0;
    for (let i = 0; i < numLimbs; i++) dst[HDR + i] = 0;
    return;
  }

  const bits = val.toString(2).length;
  let exp = bits, mantissa;

  if (bits > prec) {
  // Drop extra bits and round to nearest, ties to even
    const shift = BigInt(bits - prec);        // how many extra bits to drop
    const half  = 1n << (shift - 1n);         // midpoint of dropped region
    const frac  = val & ((1n << shift) - 1n); // dropped bits, as an int
    mantissa = val >> shift;
    if (frac > half || (frac === half && (mantissa & 1n))) { // round the mantissa
      mantissa++;
      if (mantissa >> BigInt(prec)) { // overflow into prec+1 bits
        mantissa >>= 1n;
        exp++;
      }
    }
  } else {
    // Shift left to fill all prec bits
    mantissa = val << BigInt(prec - bits);
  }

  dst[I_FLAGS] = neg ? FLAGS.NEG_NORMAL : FLAGS.POS_NORMAL;
  dst[I_EXP]   = exp;

  // Store limbs big-endian: limb 0 is most significant
  const mask  = BigInt(LIMB_MASK);
  const lbits = BigInt(LIMB_BITS);
  for (let i = numLimbs - 1; i >= 0; i--) {
    dst[HDR + i] = Number(mantissa & mask);
    mantissa >>= lbits;
  }
}

export { FLAGS, I_PREC, I_FLAGS, I_EXP, HDR, LIMB_BITS, LIMB_BASE, LIMB_MASK, isNeg, isNormal, isZero, isInf, isNaN };
