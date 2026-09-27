import { describe, expect, it } from 'vitest';

import { isReadableLottie, parseLottieRequirements } from './lottieRequirements.ts';

describe('isReadableLottie', () => {
  it('returns false for non-Lottie JSON', () => {
    expect(isReadableLottie(JSON.stringify({ armature: [] }))).toBe(false);
    expect(isReadableLottie('not json')).toBe(false);
  });

  it('returns true for a valid Lottie document', () => {
    const doc = { fr: 30, ip: 0, layers: [], op: 60 };
    expect(isReadableLottie(JSON.stringify(doc))).toBe(true);
  });
});

describe('parseLottieRequirements', () => {
  it('emits a requirement for each counted kind', () => {
    const doc = {
      fr: 30,
      ip: 0,
      layers: [{ shapes: [{ ty: 'sh' }, { ty: 'fl' }], ty: 4 }],
      op: 60,
    };
    const result = parseLottieRequirements(JSON.stringify(doc));
    const keys = result.requirements.map((r) => r.key);
    expect(keys).toContain('lottie.layer.shape');
    expect(keys).toContain('lottie.shape.path');
    expect(keys).toContain('lottie.shape.fill');
  });
});
