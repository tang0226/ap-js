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
  constructor(prec, guard = 16) {
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

  toString(f, format = '') {
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
      case 'e': return sign + _toSciStr(mantissa, shift, this.prec);
      default:    return sign + _toDecStr(mantissa, shift, this.prec);
    }
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

  neg(dst, f) {
    if (f[I_FLAGS] === FLAGS.NAN) { dst[I_FLAGS] = FLAGS.NAN;  return; }
    dst.set(f);
    dst[I_FLAGS] ^= 1;
  }

  add(dst, a, b) {
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
  }

  sub(dst, a, b) {
    b[I_FLAGS] ^= 1;
    this.add(dst, a, b);
    if (dst !== b) b[I_FLAGS] ^= 1;
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

// Convert mantissa*2^shift to a decimal string with enough digits for `prec` bits.
function _toDecStr(mantissa, shift, prec) {
  if (shift >= 0) return (mantissa << BigInt(shift)).toString(10);

  const negShift = BigInt(-shift);
  const intPart  = mantissa >> negShift;
  const fracBits = mantissa & ((1n << negShift) - 1n);

  if (fracBits === 0n) return intPart.toString(10);

  // Multiply frac by 10^numDig then integer-divide by 2^negShift to get decimal digits
  const numDig = Math.ceil(prec * Math.log10(2)) + 2;
  const scaled  = (fracBits * (10n ** BigInt(numDig))) >> negShift;
  const fracStr = scaled.toString(10).padStart(numDig, '0').replace(/0+$/, '');

  return intPart.toString(10) + '.' + fracStr;
}

// Convert to scientific notation: d.dddde±XX
function _toSciStr(mantissa, shift, prec) {
  const dec     = _toDecStr(mantissa, shift, prec);
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
