import { describe, expect, it } from 'vitest';

import { parseSpineSkeletonBinary } from './spineBinaryFull.ts';

describe('parseSpineSkeletonBinary', () => {
  it('keeps unreadable input on the established null-return path', () => {
    expect(parseSpineSkeletonBinary(new Uint8Array())).toBeNull();
  });
});
