import {
  beginVelocityFrame,
  contributeVelocity,
  createVelocityField,
  ensureVelocitySample,
  getVelocity,
  hasVelocity,
  suppressVelocity,
} from './velocityField';

describe('beginVelocityFrame', () => {
  it('advances the frame id', () => {
    const field = createVelocityField();
    const before = field.frameId;
    beginVelocityFrame(field);
    expect(field.frameId).toBe(before + 1);
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

describe('createVelocityField', () => {
  it('starts at frame zero and returns zero for unknown sources', () => {
    const field = createVelocityField();
    expect(field.frameId).toBe(0);
    expect(getVelocity(field, {}, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
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

describe('suppressVelocity', () => {
  it('zeroes a previously set velocity', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 9, 9);
    suppressVelocity(field, source);
    expect(getVelocity(field, source, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
