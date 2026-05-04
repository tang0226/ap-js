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


class APContext {
  constructor(prec) {
    this.prec     = prec;
    this.numLimbs = Math.ceil(prec / LIMB_BITS);
    this.size     = HDR + this.numLimbs;
  }

  alloc() {
    const f = new Float64Array(this.size);
    f[I_PREC] = prec;
    f[I_FLAGS] = FLAGS.POS_ZERO;
    f[I_EXP] = 0;
    return f;
  }
}
