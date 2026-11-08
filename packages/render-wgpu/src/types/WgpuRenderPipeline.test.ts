import { describe, expect, it } from 'vitest';

import { WgpuColorWrite } from './WgpuRenderPipeline.ts';

describe('WgpuColorWrite', () => {
  it('carries the WGPU color write bits, with ALL as their union', () => {
    expect(WgpuColorWrite).toEqual({ ALL: 15, ALPHA: 8, BLUE: 4, GREEN: 2, RED: 1 });
    expect(WgpuColorWrite.RED | WgpuColorWrite.GREEN | WgpuColorWrite.BLUE | WgpuColorWrite.ALPHA).toBe(
      WgpuColorWrite.ALL,
    );
  });
});
