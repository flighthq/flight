import {
  addVelocity,
  beginVelocityFrame,
  clampVelocity,
  contributeVelocity,
  copyVelocity,
  createVelocityField,
  dampVelocity,
  ensureVelocitySample,
  getVelocity,
  hasVelocity,
  isVelocityZero,
  lengthOfVelocity,
  lerpVelocity,
  normalizeVelocity,
  scaleVelocity,
  subtractVelocity,
  suppressVelocity,
  zeroVelocity,
} from './velocityField';

describe('addVelocity', () => {
  it('adds two velocity vectors', () => {
    const out = { x: 0, y: 0 };
    addVelocity(out, { x: 1, y: 2 }, { x: 3, y: 4 });
    expect(out).toEqual({ x: 4, y: 6 });
  });

  it('is alias-safe when out equals a', () => {
    const a = { x: 5, y: 3 };
    addVelocity(a, a, { x: 1, y: 1 });
    expect(a).toEqual({ x: 6, y: 4 });
  });
});

describe('beginVelocityFrame', () => {
  it('advances the frame id', () => {
    const field = createVelocityField();
    const before = field.frameId;
    beginVelocityFrame(field);
    expect(field.frameId).toBe(before + 1);
  });
});

describe('clampVelocity', () => {
  it('returns velocity unchanged when length is within maxLength', () => {
    const out = { x: 0, y: 0 };
    clampVelocity(out, { x: 3, y: 0 }, 5);
    expect(out).toEqual({ x: 3, y: 0 });
  });

  it('clamps to maxLength when length exceeds maxLength', () => {
    const out = { x: 0, y: 0 };
    clampVelocity(out, { x: 10, y: 0 }, 5);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(0);
  });

  it('clamps a diagonal velocity to maxLength', () => {
    const out = { x: 0, y: 0 };
    clampVelocity(out, { x: 3, y: 4 }, 2.5);
    expect(lengthOfVelocity(out)).toBeCloseTo(2.5);
  });

  it('is alias-safe when out equals velocity', () => {
    const v = { x: 10, y: 0 };
    clampVelocity(v, v, 5);
    expect(v.x).toBeCloseTo(5);
    expect(v.y).toBeCloseTo(0);
  });

  it('handles zero-length velocity without division error', () => {
    const out = { x: 0, y: 0 };
    clampVelocity(out, { x: 0, y: 0 }, 5);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe('contributeVelocity', () => {
  it('records an explicit velocity readable this frame', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 3, -4);
    expect(getVelocity(field, source, { x: 0, y: 0 })).toEqual({ x: 3, y: -4 });
  });

  it('accepts any object source, not only nodes', () => {
    const field = createVelocityField();
    const batchLike = { instances: 12 };
    contributeVelocity(field, batchLike, 1, 2);
    expect(getVelocity(field, batchLike, { x: 0, y: 0 })).toEqual({ x: 1, y: 2 });
  });
});

describe('copyVelocity', () => {
  it('copies x and y', () => {
    const out = { x: 0, y: 0 };
    copyVelocity(out, { x: 5, y: -3 });
    expect(out).toEqual({ x: 5, y: -3 });
  });

  it('is alias-safe when out equals source', () => {
    const v = { x: 7, y: 2 };
    copyVelocity(v, v);
    expect(v).toEqual({ x: 7, y: 2 });
  });
});

describe('createVelocityField', () => {
  it('starts at frame zero and returns zero for unknown sources', () => {
    const field = createVelocityField();
    expect(field.frameId).toBe(0);
    expect(getVelocity(field, {}, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('dampVelocity', () => {
  it('returns current at factor=1 (no smoothing)', () => {
    const out = { x: 0, y: 0 };
    dampVelocity(out, { x: 10, y: 5 }, { x: 0, y: 0 }, 1);
    expect(out).toEqual({ x: 10, y: 5 });
  });

  it('returns previous at factor=0 (full smoothing)', () => {
    const out = { x: 0, y: 0 };
    dampVelocity(out, { x: 10, y: 5 }, { x: 2, y: 3 }, 0);
    expect(out).toEqual({ x: 2, y: 3 });
  });

  it('blends at factor=0.5', () => {
    const out = { x: 0, y: 0 };
    dampVelocity(out, { x: 10, y: 0 }, { x: 0, y: 0 }, 0.5);
    expect(out).toEqual({ x: 5, y: 0 });
  });

  it('is alias-safe when out equals current', () => {
    const current = { x: 10, y: 0 };
    dampVelocity(current, current, { x: 0, y: 0 }, 0.5);
    expect(current).toEqual({ x: 5, y: 0 });
  });
});

describe('ensureVelocitySample', () => {
  it('returns the same sample on repeat calls', () => {
    const field = createVelocityField();
    const source = {};
    expect(ensureVelocitySample(field, source)).toBe(ensureVelocitySample(field, source));
  });
});

describe('getVelocity', () => {
  it('returns zero once the sample is stale after the frame advances', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 5, 5);
    beginVelocityFrame(field);
    expect(getVelocity(field, source, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('hasVelocity', () => {
  it('is true for nonzero velocity this frame and false for suppressed', () => {
    const field = createVelocityField();
    const moving = {};
    const still = {};
    contributeVelocity(field, moving, 1, 0);
    suppressVelocity(field, still);
    expect(hasVelocity(field, moving)).toBe(true);
    expect(hasVelocity(field, still)).toBe(false);
  });
});

describe('isVelocityZero', () => {
  it('returns true for exact zero', () => {
    expect(isVelocityZero({ x: 0, y: 0 })).toBe(true);
  });

  it('returns false for nonzero', () => {
    expect(isVelocityZero({ x: 0.001, y: 0 })).toBe(false);
  });

  it('respects epsilon', () => {
    expect(isVelocityZero({ x: 0.001, y: 0 }, 0.01)).toBe(true);
    expect(isVelocityZero({ x: 0.1, y: 0 }, 0.01)).toBe(false);
  });
});

describe('lengthOfVelocity', () => {
  it('returns the magnitude of the velocity vector', () => {
    expect(lengthOfVelocity({ x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('returns 0 for zero vector', () => {
    expect(lengthOfVelocity({ x: 0, y: 0 })).toBe(0);
  });
});

describe('lerpVelocity', () => {
  it('returns a at t=0', () => {
    const out = { x: 0, y: 0 };
    lerpVelocity(out, { x: 1, y: 2 }, { x: 9, y: 8 }, 0);
    expect(out).toEqual({ x: 1, y: 2 });
  });

  it('returns b at t=1', () => {
    const out = { x: 0, y: 0 };
    lerpVelocity(out, { x: 1, y: 2 }, { x: 9, y: 8 }, 1);
    expect(out).toEqual({ x: 9, y: 8 });
  });

  it('interpolates at t=0.5', () => {
    const out = { x: 0, y: 0 };
    lerpVelocity(out, { x: 0, y: 0 }, { x: 10, y: 4 }, 0.5);
    expect(out).toEqual({ x: 5, y: 2 });
  });

  it('is alias-safe when out equals a', () => {
    const a = { x: 0, y: 0 };
    lerpVelocity(a, a, { x: 10, y: 0 }, 0.5);
    expect(a).toEqual({ x: 5, y: 0 });
  });
});

describe('normalizeVelocity', () => {
  it('returns unit vector for nonzero input', () => {
    const out = { x: 0, y: 0 };
    normalizeVelocity(out, { x: 3, y: 4 });
    expect(lengthOfVelocity(out)).toBeCloseTo(1);
    expect(out.x).toBeCloseTo(0.6);
    expect(out.y).toBeCloseTo(0.8);
  });

  it('returns zero vector for zero input', () => {
    const out = { x: 0, y: 0 };
    normalizeVelocity(out, { x: 0, y: 0 });
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('is alias-safe when out equals source', () => {
    const v = { x: 5, y: 0 };
    normalizeVelocity(v, v);
    expect(v).toEqual({ x: 1, y: 0 });
  });
});

describe('scaleVelocity', () => {
  it('scales by a factor', () => {
    const out = { x: 0, y: 0 };
    scaleVelocity(out, { x: 3, y: -2 }, 2);
    expect(out).toEqual({ x: 6, y: -4 });
  });

  it('is alias-safe when out equals velocity', () => {
    const v = { x: 4, y: 2 };
    scaleVelocity(v, v, 0.5);
    expect(v).toEqual({ x: 2, y: 1 });
  });
});

describe('subtractVelocity', () => {
  it('subtracts b from a', () => {
    const out = { x: 0, y: 0 };
    subtractVelocity(out, { x: 5, y: 3 }, { x: 2, y: 1 });
    expect(out).toEqual({ x: 3, y: 2 });
  });

  it('is alias-safe when out equals a', () => {
    const a = { x: 5, y: 3 };
    subtractVelocity(a, a, { x: 2, y: 1 });
    expect(a).toEqual({ x: 3, y: 2 });
  });
});

describe('suppressVelocity', () => {
  it('zeroes a previously set velocity', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 9, 9);
    suppressVelocity(field, source);
    expect(getVelocity(field, source, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('zeroVelocity', () => {
  it('sets both components to zero', () => {
    const v = { x: 5, y: -3 };
    zeroVelocity(v);
    expect(v).toEqual({ x: 0, y: 0 });
  });

  it('returns the out reference', () => {
    const v = { x: 1, y: 1 };
    expect(zeroVelocity(v)).toBe(v);
  });
});
