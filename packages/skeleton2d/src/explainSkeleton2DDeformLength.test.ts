import type { Skin2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainSkeleton2DDeformLength } from './explainSkeleton2DDeformLength';
import { createSkin2D } from './skin2D';

// One vertex bound to two bones: eight floats of influence data, so the deform stream it parallels is
// FOUR floats — twice what a per-vertex reading predicts.
const twoBoneSkin: Skin2D = createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5]));

describe('explainSkeleton2DDeformLength', () => {
  it('addresses a weighted attachment per INFLUENCE, which is the count that surprises', () => {
    expect(explainSkeleton2DDeformLength(twoBoneSkin, null, new Float32Array(2))).toEqual({
      accepted: false,
      addressed: 4,
      addressing: 'weighted',
      offsets: 2,
    });
  });

  it('accepts a weighted stream sized from the influence count', () => {
    expect(explainSkeleton2DDeformLength(twoBoneSkin, null, new Float32Array(4)).accepted).toBe(true);
  });

  it('addresses a rigid attachment per vertex', () => {
    expect(explainSkeleton2DDeformLength(null, new Float32Array(6), new Float32Array(6))).toEqual({
      accepted: true,
      addressed: 6,
      addressing: 'rigid',
      offsets: 6,
    });
  });

  it('reports a null stream as the undeformed case rather than a mismatch', () => {
    const explanation = explainSkeleton2DDeformLength(twoBoneSkin, null, null);

    expect(explanation.accepted).toBe(false);
    expect(explanation.offsets).toBe(0);
  });

  it('agrees with the deformer at the exact boundary, which is the only thing that makes it useful', () => {
    // The skinning primitive ignores a 3-float stream for this skin and applies a 4-float one; an
    // explanation that disagreed at the boundary would send a caller to fix the wrong thing.
    expect(explainSkeleton2DDeformLength(twoBoneSkin, null, new Float32Array(3)).accepted).toBe(false);
    expect(explainSkeleton2DDeformLength(twoBoneSkin, null, new Float32Array(4)).accepted).toBe(true);
  });

  it('rejects a stream longer than the exact expected length', () => {
    // The deformer uses strict equality (deform.length * 2 === inf.length for weighted,
    // deform.length === vertices.length for rigid). An oversized stream means the offsets were
    // sized against a different attachment — the same authoring defect arriving from the other side.
    expect(explainSkeleton2DDeformLength(twoBoneSkin, null, new Float32Array(5)).accepted).toBe(false);
    expect(explainSkeleton2DDeformLength(null, new Float32Array(6), new Float32Array(8)).accepted).toBe(false);
  });

  it('prefers the skin when an attachment carries both, matching the primitive dispatch', () => {
    // skinSkeleton2DAttachmentPoints takes the weighted branch whenever a skin is present, so a stale
    // `vertices` alongside it must not change the answer.
    expect(explainSkeleton2DDeformLength(twoBoneSkin, new Float32Array(99), null).addressing).toBe('weighted');
  });
});
