import { createMatrix } from '@flighthq/geometry/contract';
import { BlendMode } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';
import {
  beginCanvasRenderPass,
  beginCanvasScreenRenderPassForTest,
  createCanvasRenderStateWithoutPass,
  createCanvasTextureRenderTarget,
  endCanvasRenderPass,
  getCanvasActiveRenderPass,
  setCanvasRenderTransform2D,
} from './canvasTestSupport';

function makeScreenPass() {
  const state = createCanvasRenderStateWithoutPass();
  const pass = beginCanvasScreenRenderPassForTest(state, document.createElement('canvas'));
  return { pass, state };
}

describe('beginCanvasRenderPass', () => {
  it('binds the target by installing its context on the state', () => {
    // On this backend binding IS the context swap: each canvas element carries its own, so a target is
    // not reachable until the state is drawing through it.
    const { state } = makeScreenPass();
    const target = createCanvasTextureRenderTarget(64, 48);

    const pass = beginCanvasRenderPass(state, target);

    expect(state.canvas).toBe(target.canvas);
    expect(state.context).toBe(target.context);
    expect(pass.target).toBe(target);
    expect(pass.viewport).toEqual({ height: 48, width: 64 });
    endCanvasRenderPass(pass);
  });

  it('resets compositing so a reused context does not inherit the last draw into it', () => {
    const { state } = makeScreenPass();
    const target = createCanvasTextureRenderTarget(64, 48);
    target.context.globalAlpha = 0.25;
    target.context.globalCompositeOperation = 'multiply';
    const runtime = getCanvasRenderStateRuntime(state);

    const pass = beginCanvasRenderPass(state, target);

    expect(target.context.globalAlpha).toBe(1);
    expect(target.context.globalCompositeOperation).toBe('source-over');
    expect(runtime.currentAlpha).toBe(1);
    expect(runtime.currentBlendMode).toBe(BlendMode.Normal);
    endCanvasRenderPass(pass);
  });

  it('erases on a transparent clear and fills on an opaque one', () => {
    // Canvas has one colour attachment and no depth: the clear descriptor every backend takes lands here
    // as a fill or an erase, chosen by the alpha the caller asked for.
    const { state } = makeScreenPass();
    const target = createCanvasTextureRenderTarget(64, 48);
    const clearRect = vi.spyOn(target.context, 'clearRect');
    const fillRect = vi.spyOn(target.context, 'fillRect');

    endCanvasRenderPass(beginCanvasRenderPass(state, target, { color: [0, 0, 0, 0] }));
    expect(clearRect).toHaveBeenCalledWith(0, 0, 64, 48);
    expect(fillRect).not.toHaveBeenCalled();

    clearRect.mockClear();
    endCanvasRenderPass(beginCanvasRenderPass(state, target, { color: [1, 0.5, 0, 1] }));
    expect(fillRect).toHaveBeenCalledWith(0, 0, 64, 48);
    // The canvas implementation normalizes the CSS colour it was given; the assertion is on the colour
    // that survived, not on the spelling handed in.
    expect(target.context.fillStyle).toBe('#ff8000');
    expect(clearRect).not.toHaveBeenCalled();
  });

  it('preserves the target when no clear is given', () => {
    const { state } = makeScreenPass();
    const target = createCanvasTextureRenderTarget(64, 48);
    const clearRect = vi.spyOn(target.context, 'clearRect');
    const fillRect = vi.spyOn(target.context, 'fillRect');

    endCanvasRenderPass(beginCanvasRenderPass(state, target));

    expect(clearRect).not.toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
  });

  it('nests, and each end restores the canvas its begin found', () => {
    const { pass: screenPass, state } = makeScreenPass();
    const screenCanvas = state.canvas;
    const targetA = createCanvasTextureRenderTarget(64, 48);
    const targetB = createCanvasTextureRenderTarget(32, 32);

    const passA = beginCanvasRenderPass(state, targetA);
    expect(state.canvas).toBe(targetA.canvas);
    const passB = beginCanvasRenderPass(state, targetB);
    expect(state.canvas).toBe(targetB.canvas);

    endCanvasRenderPass(passB);
    expect(state.canvas).toBe(targetA.canvas);
    endCanvasRenderPass(passA);
    expect(state.canvas).toBe(screenCanvas);
    endCanvasRenderPass(screenPass);
  });
});

describe('endCanvasRenderPass', () => {
  it('restores the compositing shadow the enclosing pass was drawing with', () => {
    const { pass: screenPass, state } = makeScreenPass();
    const runtime = getCanvasRenderStateRuntime(state);
    runtime.currentAlpha = 0.5;
    runtime.currentBlendMode = BlendMode.Multiply;

    endCanvasRenderPass(beginCanvasRenderPass(state, createCanvasTextureRenderTarget(16, 16)));

    expect(runtime.currentAlpha).toBe(0.5);
    expect(runtime.currentBlendMode).toBe(BlendMode.Multiply);
    endCanvasRenderPass(screenPass);
  });

  // ★ A NO-OP WOULD HIDE THE LEAK. An unbalanced bracket leaves later draws going to whichever canvas
  // happened to be installed, and the picture that comes out is wrong somewhere else entirely.
  it('refuses a pass that is not the innermost open one', () => {
    const { pass: screenPass, state } = makeScreenPass();
    const inner = beginCanvasRenderPass(state, createCanvasTextureRenderTarget(16, 16));

    expect(() => endCanvasRenderPass(screenPass)).toThrow(/innermost open pass/);

    endCanvasRenderPass(inner);
    endCanvasRenderPass(screenPass);
  });
});

describe('getCanvasActiveRenderPass', () => {
  it('names the innermost open pass and nothing outside a bracket', () => {
    const state = createCanvasRenderStateWithoutPass();
    expect(getCanvasActiveRenderPass(state)).toBeNull();

    const screenPass = beginCanvasScreenRenderPassForTest(state, document.createElement('canvas'));
    expect(getCanvasActiveRenderPass(state)).toBe(screenPass);
    const inner = beginCanvasRenderPass(state, createCanvasTextureRenderTarget(16, 16));
    expect(getCanvasActiveRenderPass(state)).toBe(inner);

    endCanvasRenderPass(inner);
    expect(getCanvasActiveRenderPass(state)).toBe(screenPass);
    endCanvasRenderPass(screenPass);
    expect(getCanvasActiveRenderPass(state)).toBeNull();
  });
});

describe('setCanvasRenderTransform2D', () => {
  it('installs a copy of the transform, restored by the enclosing pass', () => {
    const { pass: screenPass, state } = makeScreenPass();
    const original = state.renderTransform2D;
    const transform = createMatrix();
    transform.tx = 99;

    const pass = beginCanvasRenderPass(state, createCanvasTextureRenderTarget(64, 48));
    setCanvasRenderTransform2D(pass, transform);
    expect(state.renderTransform2D?.tx).toBe(99);
    expect(state.renderTransform2D).not.toBe(transform);
    endCanvasRenderPass(pass);

    expect(state.renderTransform2D).toBe(original);
    endCanvasRenderPass(screenPass);
  });

  it('does not mutate the outer transform matrix', () => {
    const { pass: screenPass, state } = makeScreenPass();
    const outer = state.renderTransform2D!;
    const transform = createMatrix();
    transform.tx = 50;

    const pass = beginCanvasRenderPass(state, createCanvasTextureRenderTarget(64, 48));
    setCanvasRenderTransform2D(pass, transform);
    endCanvasRenderPass(pass);

    expect(state.renderTransform2D).toBe(outer);
    expect(outer.tx).not.toBe(50);
    endCanvasRenderPass(screenPass);
  });
});
