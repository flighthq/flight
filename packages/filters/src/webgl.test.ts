import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import {
  applyBlitOffsetPass,
  applyBlitPass,
  applyTintPass,
  applyWebGLBevelFilter,
  applyWebGLBlurFilter,
  applyWebGLColorMatrixFilter,
  applyWebGLConvolutionFilter,
  applyWebGLDropShadowFilter,
  applyWebGLFilter,
  applyWebGLGlowFilter,
  clearWebGLFilterTarget,
  compileWebGLFilterProgram,
  drawWebGLFilterPass,
} from './webgl';

// Re-export smoke tests — full coverage is in the individual filter test files.

describe('applyBlitOffsetPass', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyBlitOffsetPass(state, makeRenderTarget(), makeRenderTarget(), 0, 0);
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyBlitPass', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyBlitPass(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyTintPass', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1);
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyWebGLBevelFilter', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBevelFilter(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyWebGLBlurFilter', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyWebGLColorMatrixFilter', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLColorMatrixFilter(state, makeRenderTarget(), makeRenderTarget(), {
      matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    });
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyWebGLConvolutionFilter', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLConvolutionFilter(state, makeRenderTarget(), makeRenderTarget(), {
      matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      matrixX: 3,
      matrixY: 3,
    });
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyWebGLDropShadowFilter', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyWebGLFilter', () => {
  it('dispatches to the blur implementation', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLFilter(state, makeRenderTarget(), makeRenderTarget(), { type: 'blur', blurX: 4, blurY: 4 });
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('dispatches to the colorMatrix implementation', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLFilter(state, makeRenderTarget(), makeRenderTarget(), {
      type: 'colorMatrix',
      matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    });
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('dispatches to the convolution implementation', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLFilter(state, makeRenderTarget(), makeRenderTarget(), {
      type: 'convolution',
      matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      matrixX: 3,
      matrixY: 3,
    });
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('dispatches to the dropShadow implementation', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLFilter(state, makeRenderTarget(), makeRenderTarget(), { type: 'dropShadow' });
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('dispatches to the glow implementation', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLFilter(state, makeRenderTarget(), makeRenderTarget(), { type: 'glow' });
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('dispatches to the bevel implementation', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLFilter(state, makeRenderTarget(), makeRenderTarget(), { type: 'bevel' });
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('applyWebGLGlowFilter', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLGlowFilter(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('clearWebGLFilterTarget', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    clearWebGLFilterTarget(state, makeRenderTarget());
    expect(gl.clear).toHaveBeenCalled();
  });
});

describe('compileWebGLFilterProgram', () => {
  it('is re-exported and callable', () => {
    const { gl } = makeWebGLState();
    const loc = compileWebGLFilterProgram(gl, '#version 300 es\nvoid main() {}');
    expect(loc.program).toBeDefined();
  });
});

describe('drawWebGLFilterPass', () => {
  it('is re-exported and callable', () => {
    const { state, gl } = makeWebGLState();
    const loc = compileWebGLFilterProgram(gl, '#version 300 es\nvoid main() {}');
    drawWebGLFilterPass(state, makeRenderTarget(), makeRenderTarget(), loc, () => {});
    expect(gl.drawElements).toHaveBeenCalled();
  });
});
