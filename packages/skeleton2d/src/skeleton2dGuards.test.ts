import type { Skeleton2DCoercedInterpolation, Skeleton2DDeformLengthMismatch } from '@flighthq/types/contract';

import {
  reportSkeleton2DCoercedInterpolation,
  reportSkeleton2DDeformLengthMismatch,
  setSkeleton2DCoercedInterpolationGuard,
  setSkeleton2DDeformLengthGuard,
} from './skeleton2dGuards';

afterEach(() => {
  setSkeleton2DCoercedInterpolationGuard(null);
  setSkeleton2DDeformLengthGuard(null);
});

describe('reportSkeleton2DCoercedInterpolation', () => {
  it('costs a null check when no guard is installed', () => {
    // The whole point of the seam: a shipped build that never opts in pays nothing and never throws.
    expect(() => reportSkeleton2DCoercedInterpolation('Attachment', 'Linear', 'Step')).not.toThrow();
  });

  it('hands the installed guard what was stated and what was applied', () => {
    const seen: Skeleton2DCoercedInterpolation[] = [];
    setSkeleton2DCoercedInterpolationGuard((report) => void seen.push(report));

    reportSkeleton2DCoercedInterpolation('DrawOrder', 'Cubic', 'Step');

    expect(seen).toEqual([{ applied: 'Step', stated: 'Cubic', subject: 'DrawOrder' }]);
  });
});

describe('reportSkeleton2DDeformLengthMismatch', () => {
  it('costs a null check when no guard is installed', () => {
    expect(() => reportSkeleton2DDeformLengthMismatch('torso', 6, 8)).not.toThrow();
  });

  it('hands the installed guard both lengths so a caller can see which way it is wrong', () => {
    const seen: Skeleton2DDeformLengthMismatch[] = [];
    setSkeleton2DDeformLengthGuard((report) => void seen.push(report));

    reportSkeleton2DDeformLengthMismatch('torso', 6, 8);

    expect(seen).toEqual([{ addressed: 8, offsets: 6, subject: 'torso' }]);
  });
});

describe('setSkeleton2DCoercedInterpolationGuard', () => {
  it('replaces rather than accumulates, so enabling twice installs one guard', () => {
    let first = 0;
    let second = 0;
    setSkeleton2DCoercedInterpolationGuard(() => void first++);
    setSkeleton2DCoercedInterpolationGuard(() => void second++);

    reportSkeleton2DCoercedInterpolation('Attachment', 'Linear', 'Step');

    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  it('stops reporting once cleared', () => {
    let calls = 0;
    setSkeleton2DCoercedInterpolationGuard(() => void calls++);
    setSkeleton2DCoercedInterpolationGuard(null);

    reportSkeleton2DCoercedInterpolation('Attachment', 'Linear', 'Step');

    expect(calls).toBe(0);
  });
});

describe('setSkeleton2DDeformLengthGuard', () => {
  it('stops reporting once cleared', () => {
    let calls = 0;
    setSkeleton2DDeformLengthGuard(() => void calls++);
    setSkeleton2DDeformLengthGuard(null);

    reportSkeleton2DDeformLengthMismatch('torso', 1, 2);

    expect(calls).toBe(0);
  });
});
