const LIMB_BITS = 16;
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

const isNeg    = (f) => !!(f[I_FLAGS] & 1);
const isNormal = (f) => f[I_FLAGS] === 2 || f[I_FLAGS] === 3;
const isZero   = (f) => f[I_FLAGS] <= 1;
const isInf    = (f) => f[I_FLAGS] === 4 || f[I_FLAGS] === 5;
const isNaN    = (f) => f[I_FLAGS] === 6;


export class APContext {
  constructor(prec) {
    this.numLimbs = Math.ceil(prec / LIMB_BITS);
    this.prec     = this.numLimbs * LIMB_BITS;
    this.size     = HDR + this.numLimbs;

    // Constants
    this.one = this.alloc(1);
    this.two = this.alloc(2);
    this.negOne = this.alloc(-1);
  }
}

APContext.prototype.alloc =
APContext.prototype.ap = function(input) {
  const f = new Int32Array(this.size);
  f[I_PREC]  = this.prec;
  f[I_FLAGS] = FLAGS.POS_ZERO;
  f[I_EXP]   = 0;
  if (typeof input === 'string') {
    this.fromString(f, input);
  } else if (typeof input === 'number') {
    this.fromString(f, input.toString());
  } else if (input instanceof Int32Array) {
    if (input.length !== this.size) throw new RangeError('source array size mismatch');
    f.set(input);
  }
  return f;
};

APContext.prototype.toString = function(f, format = '', sigFigs = null) {
  if (typeof format === 'number') { sigFigs = format; }

  if (f[I_FLAGS] === FLAGS.NAN)     return 'NaN';
  if (f[I_FLAGS] === FLAGS.POS_INF) return 'Infinity';
  if (f[I_FLAGS] === FLAGS.NEG_INF) return '-Infinity';
  if (f[I_FLAGS] <= 1)              return (f[I_FLAGS] & 1) ? '-0' : '0';

  const sign = (f[I_FLAGS] & 1) ? '-' : '';
  const exp  = f[I_EXP] | 0;

  // Reconstruct mantissa as BigInt from big-endian limbs
  let mantissa = 0n;
  const lbits  = BigInt(LIMB_BITS);
  for (let i = 0; i < this.numLimbs; i++)
    mantissa = (mantissa << lbits) | BigInt(f[HDR + i]);

  // value = mantissa * 2^shift
  const shift = exp - this.prec;

  switch (format) {
    case 'b': return sign + _toBaseStr(mantissa, shift, 1, '0b');
    case 'o': return sign + _toBaseStr(mantissa, shift, 3, '0o');
    case 'x': return sign + _toBaseStr(mantissa, shift, 4, '0x');
    case 'e': return sign + _toSciStr(mantissa, shift, this.prec, sigFigs);
    default:    return sign + _toDecStr(mantissa, shift, this.prec, sigFigs);
  }
};

APContext.prototype.fromString = function(dst, s) {
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
    const denom   = 10n ** BigInt(-decExp);
    const scaled  = (sig << BigInt(this.prec)) / denom;
    const rem     = (sig << BigInt(this.prec)) % denom;
    const twice   = rem * 2n;
    const roundUp = twice > denom || (twice === denom && (scaled & 1n) === 1n);
    _setFromBigInt(dst, roundUp ? scaled + 1n : scaled, neg, this.prec, this.numLimbs);
    dst[I_EXP] -= this.prec;
  }
};

APContext.prototype.toNumber = function(f) {
  return Number(this.toString(f));
};

APContext.prototype.equals =
APContext.prototype.eq = function(a, b) {
  if (a[I_FLAGS] === FLAGS.NAN || b[I_FLAGS] === FLAGS.NAN) return false;
  if (isInf(a) && isInf(b)) { return a[I_FLAGS] === b[I_FLAGS]; }
  if (isInf(a) || isInf(b)) { return false; }
  if (isZero(a) && isZero(b)) { return true; }
  if (isZero(a) || isZero(b)) { return false; }

  if ((a[I_FLAGS] & 1) !== (b[I_FLAGS] & 1)) { return false; }

  if (a[I_EXP] !== b[I_EXP]) { return false; }
  for (let i = HDR; i < this.size; i++) {
    if (a[i] !== b[i]) { return false; }
  }
  return true;
};

APContext.prototype.gt = function(a, b) {
  if (a[I_FLAGS] === FLAGS.NAN || b[I_FLAGS] === FLAGS.NAN) return false;
  if (a[I_FLAGS] === FLAGS.NEG_INF || b[I_FLAGS] === FLAGS.POS_INF) { return false; }
  if (a[I_FLAGS] === FLAGS.POS_INF) { return b[I_FLAGS] !== FLAGS.POS_INF; }
  if (b[I_FLAGS] === FLAGS.NEG_INF) { return a[I_FLAGS] !== FLAGS.NEG_INF; }
  if (isZero(a)) { return isNeg(b) && !isZero(b); }
  if (isZero(b)) { return !isNeg(a); }
  if (!isNeg(a) && isNeg(b)) { return true; }
  if (isNeg(a) && !isNeg(b)) { return false; }
  let aMantissaLarger = a[I_EXP] > b[I_EXP];
  if (a[I_EXP] === b[I_EXP]) {
    let i;
    for (i = HDR; i < this.size; i++) {
      if (a[i] > b[i]) { aMantissaLarger = true; break; }
      else if (a[i] < b[i]) { break; }
    }

    if (i === this.size) { return false; }
  }

  return isNeg(a) !== aMantissaLarger;
};

APContext.prototype.lt = function(a, b) {
  if (a[I_FLAGS] === FLAGS.NAN || b[I_FLAGS] === FLAGS.NAN) return false;
  if (a[I_FLAGS] === FLAGS.POS_INF || b[I_FLAGS] === FLAGS.NEG_INF) { return false; }
  if (a[I_FLAGS] === FLAGS.NEG_INF) { return b[I_FLAGS] !== FLAGS.NEG_INF; }
  if (b[I_FLAGS] === FLAGS.POS_INF) { return a[I_FLAGS] !== FLAGS.POS_INF; }
  if (isZero(a)) { return !isNeg(b) && !isZero(b); }
  if (isZero(b)) { return isNeg(a); }
  if (isNeg(a) && !isNeg(b)) { return true; }
  if (!isNeg(a) && isNeg(b)) { return false; }
  let aMantissaSmaller = a[I_EXP] < b[I_EXP];
  if (a[I_EXP] === b[I_EXP]) {
    let i;
    for (i = HDR; i < this.size; i++) {
      if (a[i] < b[i]) { aMantissaSmaller = true; break; }
      else if (a[i] > b[i]) { break; }
    }

    if (i === this.size) { return false; }
  }

  return isNeg(a) !== aMantissaSmaller;
};

APContext.prototype.gte = function(a, b) {
  if (a[I_FLAGS] === FLAGS.NAN || b[I_FLAGS] === FLAGS.NAN) return false;
  if (a[I_FLAGS] === b[I_FLAGS]) {
    if (isInf(a)) { return true; }
    if (isZero(a)) { return true; }
  }
  if (a[I_FLAGS] === FLAGS.POS_INF || b[I_FLAGS] === FLAGS.NEG_INF) { return true; }
  if (a[I_FLAGS] === FLAGS.NEG_INF || b[I_FLAGS] === FLAGS.POS_INF) { return false; }
  if (isZero(a)) { return isNeg(b) || isZero(b); }
  if (isZero(b)) { return !isNeg(a); }
  if (!isNeg(a) && isNeg(b)) { return true; }
  if (isNeg(a) && !isNeg(b)) { return false; }

  let aMantissaLarger = a[I_EXP] > b[I_EXP];
  if (a[I_EXP] === b[I_EXP]) {
    let i;
    for (i = HDR; i < this.size; i++) {
      if (a[i] > b[i]) { aMantissaLarger = true; break; }
      else if (a[i] < b[i]) { break; }
    }

    if (i === this.size) { return true; }
  }

  return isNeg(a) !== aMantissaLarger;
};

APContext.prototype.lte = function(a, b) {
  if (a[I_FLAGS] === FLAGS.NAN || b[I_FLAGS] === FLAGS.NAN) return false;
  if (a[I_FLAGS] === b[I_FLAGS]) {
    if (isInf(a)) { return true; }
    if (isZero(a)) { return true; }
  }
  if (a[I_FLAGS] === FLAGS.NEG_INF || b[I_FLAGS] === FLAGS.POS_INF) { return true; }
  if (a[I_FLAGS] === FLAGS.POS_INF || b[I_FLAGS] === FLAGS.NEG_INF) { return false; }
  if (isZero(a)) { return !isNeg(b) || isZero(b); }
  if (isZero(b)) { return isNeg(a); }
  if (isNeg(a) && !isNeg(b)) { return true; }
  if (!isNeg(a) && isNeg(b)) { return false; }

  let aMantissaSmaller = a[I_EXP] < b[I_EXP];
  if (a[I_EXP] === b[I_EXP]) {
    let i;
    for (i = HDR; i < this.size; i++) {
      if (a[i] < b[i]) { aMantissaSmaller = true; break; }
      else if (a[i] > b[i]) { break; }
    }

    if (i === this.size) { return true; }
  }

  return isNeg(a) !== aMantissaSmaller;
};

APContext.prototype.trunc = function(dst, f) {
  if (dst !== f) { dst.set(f); }

  if (dst[I_FLAGS] !== FLAGS.POS_NORMAL && dst[I_FLAGS] !== FLAGS.NEG_NORMAL) return dst;
  
  if (dst[I_EXP] <= 0) {
    dst[I_FLAGS] = isNeg(dst) ? FLAGS.NEG_ZERO : FLAGS.POS_ZERO;
    return dst;
  }

  const startI = HDR + Math.floor(dst[I_EXP] / LIMB_BITS);
  const invOffset = LIMB_BITS - (dst[I_EXP] % LIMB_BITS);

  dst[startI] = (dst[startI] >>> invOffset) << invOffset;

  for (let i = startI + 1; i < this.size; i++) { dst[i] = 0; }
  return dst;
};

APContext.prototype.floor = function(dst, f) {
  if (dst !== f) { dst.set(f); }

  // NaN, zero, and infinity all remain unaltered
  if (dst[I_FLAGS] !== FLAGS.POS_NORMAL && dst[I_FLAGS] !== FLAGS.NEG_NORMAL) {
    return dst;
  }

  if (dst[I_EXP] <= 0) {
    if (isNeg(dst)) {
      dst.set(this.negOne);
    } else {
      dst[I_FLAGS] = FLAGS.POS_ZERO;
    }
    return dst;
  }

  if (dst[I_EXP] >= this.prec) { return dst; }

  const startI = HDR + Math.floor(dst[I_EXP] / LIMB_BITS);
  const offset = dst[I_EXP] % LIMB_BITS;
  const invOffset = LIMB_BITS - offset;
  
  let roundBit = 0;
  if (isNeg(dst)) {
    roundBit = +Boolean(dst[startI] & ((1 << invOffset) - 1));
    for (let i = startI + 1; i < this.size; i++) {
      if (dst[i]) { roundBit = 1; break; }
    }
  }

  // Zero out everything after the decimal point.
  dst[startI] = (dst[startI] >>> invOffset) << invOffset;
  for (let i = startI + 1; i < this.size; i++) { dst[i] = 0; }

  if (roundBit) {
    dst[startI] += (1 << invOffset);
    if (dst[startI] >= LIMB_BASE) {
      dst[startI] -= LIMB_BASE;
      let i = startI - 1;
      while (i >= HDR && ++dst[i] >= LIMB_BASE) {
        dst[i] = 0;
        i--;
      }
      if (i < HDR) { // overflow
        dst[HDR] = LIMB_BASE >>> 1;
        dst[I_EXP]++;
      }
    }
  }

  return dst;
};

APContext.prototype.ceil = function(dst, f) {
  if (dst !== f) { dst.set(f); }

  // NaN, zero, and infinity all remain unaltered
  if (dst[I_FLAGS] !== FLAGS.POS_NORMAL && dst[I_FLAGS] !== FLAGS.NEG_NORMAL) {
    return dst;
  }

  if (dst[I_EXP] <= 0) {
    if (isNeg(dst)) {
      dst[I_FLAGS] = FLAGS.NEG_ZERO;
    } else {
      dst.set(this.one);
    }
    return dst;
  }

  if (dst[I_EXP] >= this.prec) { return dst; }

  const startI = HDR + Math.floor(dst[I_EXP] / LIMB_BITS);
  const offset = dst[I_EXP] % LIMB_BITS;
  const invOffset = LIMB_BITS - offset;
  
  let roundBit = 0;
  if (!isNeg(dst)) {
    roundBit = +Boolean(dst[startI] & ((1 << invOffset) - 1));
    for (let i = startI + 1; i < this.size; i++) {
      if (dst[i]) { roundBit = 1; break; }
    }
  }

  // Zero out everything after the decimal point.
  dst[startI] = (dst[startI] >>> invOffset) << invOffset;
  for (let i = startI + 1; i < this.size; i++) { dst[i] = 0; }

  if (roundBit) {
    dst[startI] += (1 << invOffset);
    if (dst[startI] >= LIMB_BASE) {
      dst[startI] -= LIMB_BASE;
      let i = startI - 1;
      while (i >= HDR && ++dst[i] >= LIMB_BASE) {
        dst[i] = 0;
        i--;
      }
      if (i < HDR) { // overflow
        dst[HDR] = LIMB_BASE >>> 1;
        dst[I_EXP]++;
      }
    }
  }

  return dst;
};

APContext.prototype.round = function(dst, f) {
  if (dst !== f) { dst.set(f); }

  if (dst[I_FLAGS] !== FLAGS.POS_NORMAL && dst[I_FLAGS] !== FLAGS.NEG_NORMAL) { return dst; }

  if (dst[I_EXP] <= 0) {
    if (dst[I_EXP] === 0) {
      dst.set(isNeg(dst) ? this.negOne : this.one); // round away from zero
    } else {
      dst[I_FLAGS] = isNeg(dst) ? FLAGS.NEG_ZERO : FLAGS.POS_ZERO; // round to zero
    }
    return dst;
  }

  if (dst[I_EXP] >= this.prec) { return dst; }

  const startI = HDR + Math.floor(dst[I_EXP] / LIMB_BITS);
  const invOffset = LIMB_BITS - (dst[I_EXP] % LIMB_BITS);
  
  let roundBit = dst[startI] & (1 << (invOffset - 1));

  // Zero out after dp
  dst[startI] = (dst[startI] >>> invOffset) << invOffset;
  for (let i = startI + 1; i < this.size; i++) { dst[i] = 0; }

  if (roundBit) {
    dst[startI] += (1 << invOffset);
    if (dst[startI] >= LIMB_BASE) {
      dst[startI] -= LIMB_BASE;
      let i = startI - 1;
      while (i >= HDR && ++dst[i] >= LIMB_BASE) {
        dst[i] = 0;
        i--;
      }
      if (i < HDR) { // overflow
        dst[HDR] = LIMB_BASE >>> 1;
        dst[I_EXP]++;
      }
    }
  }

  return dst;
};

APContext.prototype.neg = function(dst, f) {
  if (f[I_FLAGS] === FLAGS.NAN) { dst[I_FLAGS] = FLAGS.NAN;  return; }
  dst.set(f);
  dst[I_FLAGS] ^= 1;
  return dst;
};

APContext.prototype.add = function(dst, a, b) {
  if (isZero(a)) { dst.set(b); return; }
  if (isZero(b)) { dst.set(a); return; }
  if (
    isNaN(a) || isNaN(b) ||
    (isInf(a) && isInf(b) && ((a[I_FLAGS] ^ b[I_FLAGS]) & 1))
  ) {
    dst[I_FLAGS] = FLAGS.NAN;
    return;
  }

  if (isInf(a)) { dst[I_FLAGS] = a[I_FLAGS]; return; }
  if (isInf(b)) { dst[I_FLAGS] = b[I_FLAGS]; return; }

  if (a[I_EXP] < b[I_EXP]) { let temp = a; a = b; b = temp; }

  const expDiff = a[I_EXP] - b[I_EXP];
  const iDiff = Math.floor(expDiff / LIMB_BITS);
  if (iDiff >= this.numLimbs) { // b is too small in comparison to a
    dst.set(a);
    return;
  }

  // expDiff = iDiff * LIMB_BITS + offset
  const offset = expDiff % LIMB_BITS;
  const invOffset = LIMB_BITS - offset;

  // rounding
  let roundBit = 0;
  const lastBLimb = this.numLimbs - 1 - iDiff;
  if (offset > 0 && lastBLimb >= 0) {
    roundBit = (b[HDR + lastBLimb] >> (offset - 1)) & 1;
  } else if (lastBLimb + 1 < this.numLimbs) {
    roundBit = (b[HDR + lastBLimb + 1] >> (LIMB_BITS - 1)) & 1;
  }

  // Copy leading limbs of a down to first limb intersecting with b
  for (let i = 0; i < iDiff; i++) {
    dst[HDR + i] = a[HDR + i];
  }


  if ((a[I_FLAGS] & 1) === (b[I_FLAGS] & 1)) {
  // Same sign; add normally

    dst[I_FLAGS] = a[I_FLAGS];
    dst[I_EXP]   = a[I_EXP];

    let carry = 0;

    // Start adding to all fully-intersecting a limbs
    for (let i = this.size - 1; i > HDR + iDiff; i--) {
      dst[i] = a[i] +
                (b[i - iDiff] >>> offset) +
                ((b[i - iDiff - 1] & ((1 << offset) - 1)) << invOffset) +
                carry;
      if (dst[i] >= LIMB_BASE) {
        dst[i] -= LIMB_BASE;
        carry = 1;
      } else { carry = 0; }
    }

    // Process left-most intersection
    dst[HDR + iDiff] = a[HDR + iDiff] + (b[HDR] >>> offset) + carry;
    if (dst[HDR + iDiff] >= LIMB_BASE) { dst[HDR + iDiff] -= LIMB_BASE; carry = 1; }
    else { carry = 0; }

    // Apply carry to rest of a's limbs
    for (let i = HDR + iDiff - 1; i >= HDR; i--) {
      dst[i] = a[i] + carry;
      if (dst[i] >= LIMB_BASE) { dst[i] -= LIMB_BASE; carry = 1; } else { carry = 0; }
    }

    // Add back round bit
    if (roundBit) {
      for (let i = this.size - 1; i >= HDR; i--) {
        dst[i]++;
        if (dst[i] < LIMB_BASE) break;
        dst[i] = 0;
        if (i === HDR) { carry = 1; break; }  // rounding itself caused overflow
      }
    }

    if (carry) {
    // Final carry; shift everything down 1 bit
      const shiftRound = dst[this.size - 1] & 1; // LSB about to be dropped
      let bit = dst[HDR] & 1, tempBit;
      dst[HDR] = (dst[HDR] + LIMB_BASE) >> 1;
      for (let i = HDR + 1; i < this.size; i++) {
        tempBit = bit;
        bit = dst[i] & 1;
        dst[i] = (-tempBit & (LIMB_BASE >> 1)) + (dst[i] >> 1);
      }
      dst[I_EXP]++;
      
      // Add back shift round bit
      if (shiftRound) {
        for (let i = this.size - 1; i >= HDR; i--) {
          dst[i]++;
          if (dst[i] < LIMB_BASE) break;
          dst[i] = 0;
          // at this point, all lower limbs have been zeroed out by the carry propagation,
          // so just set the MSL to 1 and increase the exponent
          if (i === HDR) { dst[HDR] = LIMB_BASE >> 1; dst[I_EXP]++; break; }
        }
      }
    }

  } else {
  // Different sign: subtract
    if (expDiff === 0) {
    // Ensure a is larger
      let i;
      for (i = HDR; i < this.size; i++) {
        if (a[i] > b[i]) { break; }
        if (a[i] < b[i]) {
          let temp = a;  a = b;  b = temp;
          break;
        }
      }
      if (i === this.size) {
      // a == b; return 0
        dst[I_FLAGS] = FLAGS.POS_ZERO;
        return;
      }
    }
    dst[I_FLAGS] = a[I_FLAGS];
    dst[I_EXP]   = a[I_EXP];

    let borrow = roundBit;

    // Process all intersecting limbs
    for (let i = this.size - 1; i > HDR + iDiff; i--) {
      dst[i] = a[i] -
                (b[i - iDiff] >>> offset) -
                ((b[i - iDiff - 1] & ((1 << offset) - 1)) << invOffset) -
                borrow;
      if (dst[i] < 0) {
        dst[i] += LIMB_BASE;
        borrow = 1;
      } else { borrow = 0; }
    }

    // Process left-most intersection / final borrow
    dst[HDR + iDiff] = a[HDR + iDiff] - (b[HDR] >>> offset) - borrow;
    let i = HDR + iDiff;
    while (dst[i] < 0) {
      dst[i] += LIMB_BASE;
      dst[i - 1]--;
      borrow = 1;
      i--;
      dst[i] = a[i] - borrow;
    }

    // Shift out leading zeroes
    i = HDR;
    let shiftI = 0, shiftOffset = 0;
    while (i < this.size && dst[i] === 0) { shiftI++;  i++; }
    let r = dst[i];
    while (r < (LIMB_BASE >> 1)) { shiftOffset++;  r <<= 1; }
    const invShiftOffset = LIMB_BITS - shiftOffset;
    for (i = HDR; i < this.size - shiftI - 1; i++) {
      dst[i] = ((dst[i + shiftI] << shiftOffset) & LIMB_MASK) + (dst[i + shiftI + 1] >>> invShiftOffset);
    }
    dst[this.size - shiftI - 1] = (dst[this.size - 1] << shiftOffset) & LIMB_MASK;
    i++;
    // Clear out rest of limbs after shifting
    for (; i < this.size; i++) {
      dst[i] = 0;
    }
    // Update exponent based on zero-shifting
    dst[I_EXP] -= shiftI * LIMB_BITS + shiftOffset;
  }
  return dst;
};

APContext.prototype.sub = function(dst, a, b) {
  b[I_FLAGS] ^= 1;
  this.add(dst, a, b);
  if (dst !== b) b[I_FLAGS] ^= 1;
  return dst;
};

APContext.prototype.mul =
APContext.prototype.mulLong = function(dst, a, b) {
  // if any operand is also the destination, copy it first
  if (dst === a) { a = this.alloc(dst); }
  if (dst === b) { b = this.alloc(dst); }

  let aInf = isInf(a), bInf = isInf(b), aZero = isZero(a), bZero = isZero(b);

  if (isNaN(a) || isNaN(b) || (aZero && bInf) || (bZero && aInf)) {
    dst[I_FLAGS] = FLAGS.NAN;
    return;
  }

  let diffSign = (a[I_FLAGS] & 1) ^ (b[I_FLAGS] & 1);

  if (aZero) { dst[I_FLAGS] = FLAGS.POS_ZERO + diffSign; return dst; }
  if (bZero) { dst[I_FLAGS] = FLAGS.POS_ZERO + diffSign; return dst; }
  if (aInf && !bInf) { dst[I_FLAGS] = FLAGS.POS_INF + diffSign; return dst; }
  if (bInf && !aInf) { dst[I_FLAGS] = FLAGS.POS_INF + diffSign; return dst; }
  if (aInf && bInf) {
    dst[I_FLAGS] = FLAGS.POS_INF + diffSign;
    return dst;
  }


  dst[I_EXP] = a[I_EXP] + b[I_EXP] - LIMB_BITS;
  dst[I_FLAGS] = FLAGS.POS_NORMAL;
  if (((a[I_FLAGS] & 1) ^ (b[I_FLAGS] & 1))) dst[I_FLAGS] = FLAGS.NEG_NORMAL;

  // Start by calculating an extra limb (numLimbs + 1)
  let carry = 0;
  let rem = 0;
  let term;

  for (let i = 1; i < this.numLimbs; i++) {
    term = a[HDR + i] * b[this.size - i];
    carry += term >>> LIMB_BITS;
    rem += term & LIMB_MASK;
  }
  carry += rem >>> LIMB_BITS;
  rem &= LIMB_MASK;

  // Set smallest result limb to (initial carry + round bit)
  dst[this.size - 1] = carry + (rem >>> (LIMB_BITS - 1));

  // Main limb computations
  let n = this.numLimbs;
  for (let i = this.size - 1; i > HDR; i--, n--) {
    carry = 0;
    for (let j = 0; j < n; j++) {
      term = a[HDR + j] * b[i - j];
      carry += term >>> LIMB_BITS;
      dst[i] += term & LIMB_MASK;
    }
    dst[i - 1] = carry + (dst[i] >>> LIMB_BITS); // Carry into previous limb
    dst[i] &= LIMB_MASK;
  }

  // First limb
  term = a[HDR] * b[HDR];
  dst[HDR] += term & LIMB_MASK;
  carry = (term >>> LIMB_BITS) + (dst[HDR] >>> LIMB_BITS);
  dst[HDR] &= LIMB_MASK;


  if (!carry) return dst;

  // Shift all limbs down to accomodate carry
  let offset = 1;
  let c = carry;
  while (c >>>= 1) {
    offset++;
  }

  dst[I_EXP] += offset;

  let mask = (1 << offset) - 1,
      invOffset = LIMB_BITS - offset,
      shiftIn = carry,
      tmp;
  
  for (let i = HDR; i < this.size; i++) {
    tmp = shiftIn;
    shiftIn = dst[i] & mask;
    dst[i] >>>= offset;
    dst[i] += (tmp << invOffset);
  }
  
  let roundBit = shiftIn >>> (offset - 1);
  if (roundBit) {
    let i = this.size - 1;
    while (i >= HDR && ++dst[i] >= LIMB_BASE) {
      dst[i] = 0;
      i--;
    }
    if (i < HDR) { // Carry reached past MSL; set first bit of first limb to 1; all else is 0'ed out
      dst[HDR] = LIMB_BASE >>> 1;
      dst[I_EXP]++;
    }
  }

  return dst;
};

APContext.prototype.recip = function(dst, d, tmp = null) {
  if (isNaN(d)) { dst[I_FLAGS] = FLAGS.NAN; return dst }
  if (isZero(d)) { dst[I_FLAGS] = isNeg(d) ? FLAGS.NEG_INF : FLAGS.POS_INF; return dst; }
  if (isInf(d)) { dst[I_FLAGS] = isNeg(d) ? FLAGS.NEG_ZERO : FLAGS.POS_ZERO; return dst; }

  if (dst === d) {
    d = new Int32Array(d);
  }

  dst[I_PREC]  = this.prec;
  dst[I_FLAGS] = isNeg(d) ? FLAGS.NEG_NORMAL : FLAGS.POS_NORMAL;
  const x0Top  = 3 * (LIMB_BASE >> 1) - d[HDR];  // 3×2^15 - d_top
  if (x0Top >= LIMB_BASE) {          // only happens when d_top = 0x8000 exactly
    dst[HDR]   = LIMB_BASE >> 1;
    dst[I_EXP] = -d[I_EXP] + 1;
  } else {
    dst[HDR]   = x0Top;
    dst[I_EXP] = -d[I_EXP];
  }
  for (let i = HDR + 1; i < this.size; i++) dst[i] = 0;

  if (!tmp) {
    tmp = this.alloc();
  }

  for (let i = 0; i < Math.floor(Math.log2(this.prec)) + 2; i++) {
    this.mulLong(tmp, dst, this.sub(tmp, this.two, this.mulLong(tmp, d, dst)));
    dst.set(tmp);
  }
  return dst;
};

APContext.prototype.div = function(dst, a, b, tmp = null) {
  if (!tmp) { tmp = this.alloc(); }
  return this.mulLong(dst, a, this.recip(tmp, b));
};

APContext.prototype.sq = function(dst, f, tmp = null) {
  return this.mulLong(dst, f, f, tmp);
}

APContext.prototype.sqrt = function(dst, f, tmp = null) {
  if (isNaN(f)) { dst[I_FLAGS] = FLAGS.NAN; return dst }
  if (isZero(f)) { dst[I_FLAGS] = FLAGS.POS_ZERO; return dst; }
  if (isInf(f)) { dst[I_FLAGS] = isNeg(f) ? FLAGS.NEG_INF : FLAGS.POS_INF; return dst; }

  if (dst === f) {
    f = new Int32Array(dst);
  }

  if (isNeg(f)) throw new Error('Cannot call sqrt() on a negative number');

  dst[I_FLAGS] = FLAGS.POS_NORMAL;

  dst.set(f);
  // halve exponent to create initial estimate
  dst[I_EXP] = Math.floor(dst[I_EXP] / 2);

  if (!tmp) { tmp = this.alloc(); }

  for (let i = 0; i < Math.floor(Math.log2(this.prec)) + 1; i++) {
    this.add(tmp, dst, this.div(tmp, f, dst));
    tmp[I_EXP]--; // divide by 2
    dst.set(tmp);
  }
  return dst;
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

// Convert mantissa*2^shift to a decimal string with enough digits for `prec` bits.
function _toDecStr(mantissa, shift, prec, sigFigs = null) {
  if (shift >= 0) return (mantissa << BigInt(shift)).toString(10);

  const negShift = BigInt(-shift);
  const intPart  = mantissa >> negShift;
  const fracBits = mantissa & ((1n << negShift) - 1n);

  if (fracBits === 0n) return intPart.toString(10);

  // Multiply frac by 10^numDig then integer-divide by 2^negShift to get decimal digits
  const numDig = Math.ceil(prec * Math.log10(2)) + 2;
  const scaled  = (fracBits * (10n ** BigInt(numDig))) >> negShift;
  const fracStr = scaled.toString(10).padStart(numDig, '0').replace(/0+$/, '');
  const intStr = intPart.toString(10);
  
  if (sigFigs === null) {
    return intPart.toString(10) + '.' + fracStr;
  }

  const d = (intStr + fracStr).split('').map(Number);
  let dp = intStr.length; // number of digs in d before decimal point
  let found = false;
  let sf = 0, i;
  for (i = 0; i < d.length; i++) {
    if (d[i]) { found = true; }
    if (found) {
      sf++;
      if (sf === sigFigs) { break; }
    }
  }

  if (sf === sigFigs) { // found cutoff point for correct number of sig figs
    let roundDig = d[i + 1];
    d.splice(i + 1);

    if (roundDig >= 5) {
      while (i >= 0 && ++d[i] >= 10) { d[i] = 0; i--; }
    }
    if (i < 0) { d.unshift(1); dp++; } // overflow
    // if carry reached to first dig and incremented the leading dec. 0 to 1
    // OR if an overflow digit was added, pop from d to preserve the proper number of sf.
    if (i < 0 || (i === 0 && d[0] === 1)) { d.pop() }

    let int, frac;
    if (dp >= d.length) { int = d.join('') + '0'.repeat(dp - d.length); frac = ''; }
    else { int = d.slice(0, dp).join(''); frac = d.slice(dp).join(''); }

    return int + (frac ? '.' + frac : '');
  }

  // otherwise, loop end reached without enough sf; we need to add 0's\
  let int = d.slice(0, dp).join('');
  let frac = d.slice(dp).join('');
  return int + (frac ? '.' + frac : '') + '0'.repeat(sigFigs - sf);
}

// Convert to scientific notation: d.dddde±XX
function _toSciStr(mantissa, shift, prec, sigFigs = null) {
  const dec     = _toDecStr(mantissa, shift, prec, sigFigs);
  const dotIdx  = dec.indexOf('.');
  const intStr  = dotIdx === -1 ? dec : dec.slice(0, dotIdx);
  const fracStr = dotIdx === -1 ? '' : dec.slice(dotIdx + 1);
  const allDig  = intStr + fracStr;

  let decExp, sigDig;
  if (intStr !== '0') {
    decExp = intStr.length - 1;
    sigDig = allDig;
  } else {
    const nz = fracStr.search(/[1-9]/);
    decExp   = -(nz + 1);
    sigDig   = fracStr.slice(nz);
  }

  const body    = sigDig.length > 1 ? sigDig[0] + '.' + sigDig.slice(1) : sigDig[0];
  const expSign = decExp >= 0 ? '+' : '-';
  const expStr  = String(Math.abs(decExp)).padStart(2, '0');
  return body + 'e' + expSign + expStr;
}

// Convert to hex/oct/bin, including fractional notation (e.g. "0b1.1" for 1.5).
// bitsPerDigit: 4=hex, 3=oct, 1=bin
function _toBaseStr(mantissa, shift, bitsPerDigit, prefix) {
  const radix = 2 ** bitsPerDigit;

  if (shift >= 0) return prefix + (mantissa << BigInt(shift)).toString(radix);

  const negShift = BigInt(-shift);
  const intPart  = mantissa >> negShift;
  const fracBits = mantissa & ((1n << negShift) - 1n);

  if (fracBits === 0n) return prefix + intPart.toString(radix);

  // Pad frac bits up to a multiple of bitsPerDigit so each digit is complete
  const rem     = Number(negShift) % bitsPerDigit;
  const padBits = rem === 0 ? 0 : bitsPerDigit - rem;
  const fracLen = (Number(negShift) + padBits) / bitsPerDigit;
  const fracStr = (fracBits << BigInt(padBits)).toString(radix)
    .padStart(fracLen, '0').replace(/0+$/, '');

  return prefix + intPart.toString(radix) + '.' + fracStr;
}

export {
  FLAGS, I_PREC, I_FLAGS, I_EXP, HDR, LIMB_BITS, LIMB_BASE, LIMB_MASK,
  isNeg, isNormal, isZero, isInf, isNaN
};
