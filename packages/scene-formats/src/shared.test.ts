import type { ExternalSceneResourceRef } from '@flighthq/types';
import { ResourceResolutionState } from '@flighthq/types';

import {
  convertPositionsZUpToYUp,
  convertQuaternionsZUpToYUp,
  convertTransformLhToRh,
  createExternalTextureRef,
  negateVec3Z,
  packSkinInfluences,
  reverseTriangleWinding,
  swapPositionsYZ,
} from './shared';

describe('convertPositionsZUpToYUp', () => {
  it('converts (x, y, z) to (x, z, -y) for packed vec3 data', () => {
    const values = [1, 2, 3, 4, 5, 6];
    convertPositionsZUpToYUp(values);
    expect(values).toEqual([1, 3, -2, 4, 6, -5]);
  });

  it('handles interleaved data with stride and offset', () => {
    // Interleaved: [px, py, pz, nx, ny, nz] per vertex, stride=6, offset=0 for positions
    const values = [1, 2, 3, 10, 20, 30, 4, 5, 6, 40, 50, 60];
    convertPositionsZUpToYUp(values, 6, 0);
    expect(values).toEqual([1, 3, -2, 10, 20, 30, 4, 6, -5, 40, 50, 60]);
  });

  it('avoids producing negative zero', () => {
    const values = [1, 0, 3];
    convertPositionsZUpToYUp(values);
    expect(Object.is(values[2], -0)).toBe(false);
    expect(values[2]).toBe(0);
  });

  it('handles an empty array', () => {
    const values: number[] = [];
    convertPositionsZUpToYUp(values);
    expect(values).toEqual([]);
  });
});

describe('convertQuaternionsZUpToYUp', () => {
  it('converts (qx, qy, qz, qw) to (qx, qz, -qy, qw) for packed quaternion data', () => {
    const values = [0.5, 0.5, 0.5, -0.5];
    convertQuaternionsZUpToYUp(values);
    expect(values).toEqual([0.5, 0.5, -0.5, -0.5]);
  });

  it('handles multiple quaternions', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    convertQuaternionsZUpToYUp(values);
    expect(values).toEqual([1, 3, -2, 4, 5, 7, -6, 8]);
  });

  it('avoids producing negative zero', () => {
    const values = [0, 0, 1, 1];
    convertQuaternionsZUpToYUp(values);
    expect(Object.is(values[2], -0)).toBe(false);
    expect(values[2]).toBe(0);
  });
});

describe('convertTransformLhToRh', () => {
  it('negates S·M·S indices (2, 5, 6, 7, 11) of a 4×3 column-major transform', () => {
    const transform = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30]);
    convertTransformLhToRh(transform);
    // Identity rotation stays identity (negated zeros); only tz flips.
    expect(transform[9]).toBe(10);
    expect(transform[10]).toBe(20);
    expect(transform[11]).toBe(-30);
    expect(transform[0]).toBe(1);
    expect(transform[4]).toBe(1);
    expect(transform[8]).toBe(1);
  });

  it('negates the correct off-diagonal and translation elements', () => {
    const transform = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    convertTransformLhToRh(transform);
    expect(transform[0]).toBe(1);
    expect(transform[1]).toBe(2);
    expect(transform[2]).toBe(-3);
    expect(transform[3]).toBe(4);
    expect(transform[4]).toBe(5);
    expect(transform[5]).toBe(-6);
    expect(transform[6]).toBe(-7);
    expect(transform[7]).toBe(-8);
    expect(transform[8]).toBe(9);
    expect(transform[9]).toBe(10);
    expect(transform[10]).toBe(11);
    expect(transform[11]).toBe(-12);
  });
});

describe('createExternalTextureRef', () => {
  it('wraps a filename as an Unresolved External resource ref without loading it', () => {
    const texture = createExternalTextureRef('models/hero.png');
    expect(texture.image).toBeNull();
    const ref = texture.resource as ExternalSceneResourceRef;
    expect(ref.kind).toBe('External');
    expect(ref.uri).toBe('models/hero.png');
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
  });
});

describe('negateVec3Z', () => {
  it('negates the Z component of every xyz triple', () => {
    const values = [1, 2, 3, 4, 5, 6];
    negateVec3Z(values);
    expect(values).toEqual([1, 2, -3, 4, 5, -6]);
  });

  it('avoids producing negative zero', () => {
    const values = [1, 2, 0];
    negateVec3Z(values);
    expect(Object.is(values[2], -0)).toBe(false);
    expect(values[2]).toBe(0);
  });
});

describe('packSkinInfluences', () => {
  it('keeps the four highest-weight influences and renormalizes them to sum 1', () => {
    const joints: number[] = [];
    const weights: number[] = [];
    packSkinInfluences(
      [
        { jointIndex: 5, weight: 0.1 },
        { jointIndex: 2, weight: 0.4 },
        { jointIndex: 9, weight: 0.05 },
        { jointIndex: 1, weight: 0.3 },
        { jointIndex: 7, weight: 0.15 },
      ],
      joints,
      weights,
    );
    // Top four by weight: joints 2 (0.4), 1 (0.3), 7 (0.15), 5 (0.1); joint 9 (0.05) dropped.
    expect(joints).toEqual([2, 1, 7, 5]);
    expect(weights[0] + weights[1] + weights[2] + weights[3]).toBeCloseTo(1);
    expect(weights[0]).toBeCloseTo(0.4 / 0.95);
  });

  it('zero-fills unused slots for fewer than four influences', () => {
    const joints: number[] = [];
    const weights: number[] = [];
    packSkinInfluences([{ jointIndex: 3, weight: 0.5 }], joints, weights);
    expect(joints).toEqual([3, 0, 0, 0]);
    expect(weights).toEqual([1, 0, 0, 0]);
  });

  it('leaves all weights zero for a vertex with no influence', () => {
    const joints: number[] = [];
    const weights: number[] = [];
    packSkinInfluences([], joints, weights);
    expect(joints).toEqual([0, 0, 0, 0]);
    expect(weights).toEqual([0, 0, 0, 0]);
  });
});

describe('reverseTriangleWinding', () => {
  it('swaps second and third index of each triangle', () => {
    const indices = [0, 1, 2, 3, 4, 5];
    reverseTriangleWinding(indices);
    expect(indices).toEqual([0, 2, 1, 3, 5, 4]);
  });

  it('handles a single triangle', () => {
    const indices = [10, 20, 30];
    reverseTriangleWinding(indices);
    expect(indices).toEqual([10, 30, 20]);
  });
});

describe('swapPositionsYZ', () => {
  it('swaps Y and Z components for packed vec3 data', () => {
    const values = [1, 2, 3, 4, 5, 6];
    swapPositionsYZ(values);
    expect(values).toEqual([1, 3, 2, 4, 6, 5]);
  });

  it('handles interleaved data with stride and offset', () => {
    const values = [1, 2, 3, 10, 20, 30];
    swapPositionsYZ(values, 6, 0);
    expect(values).toEqual([1, 3, 2, 10, 20, 30]);
  });

  it('handles an empty array', () => {
    const values: number[] = [];
    swapPositionsYZ(values);
    expect(values).toEqual([]);
  });
});
