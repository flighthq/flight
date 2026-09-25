import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { endCanvasRenderPass, getCanvasActiveRenderPass } from '@flighthq/scene2d-canvas/contract';
import type { CanvasEffectRunner, Effect } from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing.ts';
import { registerCanvasEffect } from './canvasEffectRegistry.ts';
import {
  acquireCanvasRenderTarget,
  beginCanvasEffectPass,
  createCanvasEffectState,
  createCanvasTextureRenderTargetPool,
  destroyCanvasEffectState,
  endCanvasEffectPass,
  initializeCanvasRenderTargetPool,
  releaseCanvasRenderTarget,
} from './canvasEffectState.ts';
import { canvasTestHost, createCanvasRenderState } from './canvasEffectTestSupport.ts';

describe('acquireCanvasRenderTarget', () => {
  it('is a function', () => {
    expect(typeof acquireCanvasRenderTarget).toBe('function');
  });
});

describe('beginCanvasEffectPass', () => {
  it('is a function', () => {
    expect(typeof beginCanvasEffectPass).toBe('function');
  });
});

describe('createCanvasEffectState', () => {
  it('is a function', () => {
    expect(typeof createCanvasEffectState).toBe('function');
  });
});

describe('createCanvasTextureRenderTargetPool', () => {
  it('is a function', () => {
    expect(typeof createCanvasTextureRenderTargetPool).toBe('function');
  });

  it('returns a pool with empty free and inUse lists', () => {
    const pool = createCanvasTextureRenderTargetPool(canvasTestHost);
    expect(pool.free).toEqual([]);
    expect(pool.inUse).toEqual([]);
  });
});

describe('destroyCanvasEffectState', () => {
  it('is a function', () => {
    expect(typeof destroyCanvasEffectState).toBe('function');
  });
});

describe('endCanvasEffectPass', () => {
  it('is a function', () => {
    expect(typeof endCanvasEffectPass).toBe('function');
  });

  // Ending the scene pass restores whatever was installed before it, which is nothing when the chain ran
  // outside any pass. Presenting there used to reach through the state and draw into a null context; the
  // pipeline names the mistake instead.
  it('refuses to present when no enclosing pass is open', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const state = createCanvasRenderState(canvas);
    const pipeline = createCanvasEffectState(state);
    const screenPass = getCanvasActiveRenderPass(state)!;
    // Closing the screen pass before the chain opens leaves the scene pass alone on the stack, so ending
    // it inside endCanvasEffectPass leaves nothing to present into.
    endCanvasRenderPass(screenPass);
    const scenePass = beginCanvasEffectPass(screenPass, pipeline);

    expect(() => endCanvasEffectPass(scenePass, pipeline, [])).toThrow(/no enclosing pass/u);
  });

  it('writes an unregistered effect destination before chaining and presenting it', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const state = createCanvasRenderState(canvas);
    const pipeline = createCanvasEffectState(state);
    const scenePass = beginCanvasEffectPass(getCanvasActiveRenderPass(state)!, pipeline);
    const scene = pipeline.sceneTarget!;
    scene.context.fillStyle = '#ff0000';
    scene.context.fillRect(0, 0, 4, 4);

    const realizedRunner = vi.fn<CanvasEffectRunner>((ctx) => {
      drawCanvasEffectPass(ctx.dest, ctx.source, 'none');
    });
    registerCanvasEffect(state, 'RealizedEffect', realizedRunner);

    endCanvasEffectPass(scenePass, pipeline, [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'UnregisteredEffect';
        return finishEntity(out);
      })(),
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'RealizedEffect';
        return finishEntity(out);
      })(),
    ] as Effect[]);

    const [unregisteredDest, realizedDest] = pipeline.pool.free;
    expect(unregisteredDest).toBeDefined();
    expect(realizedDest).toBeDefined();
    expect(unregisteredDest!.context.drawImage).toHaveBeenCalledWith(scene.canvas, 0, 0);
    expect(realizedRunner).toHaveBeenCalledWith(
      expect.objectContaining({ source: unregisteredDest, dest: realizedDest }),
      expect.objectContaining({ kind: 'RealizedEffect' }),
    );
    expect(realizedDest!.context.drawImage).toHaveBeenCalledWith(unregisteredDest!.canvas, 0, 0);
    expect(state.context.drawImage).toHaveBeenCalledWith(realizedDest!.canvas, 0, 0);
  });
});

describe('initializeCanvasRenderTargetPool', () => {
  it('is the construction initializer of createCanvasTextureRenderTargetPool', () => {
    expect(typeof initializeCanvasRenderTargetPool).toBe('function');
  });
});

describe('releaseCanvasRenderTarget', () => {
  it('is a function', () => {
    expect(typeof releaseCanvasRenderTarget).toBe('function');
  });

  it('moves an acquired target back to the free list', () => {
    const pool = createCanvasTextureRenderTargetPool(canvasTestHost);
    const target = acquireCanvasRenderTarget(pool, 16, 16);
    expect(pool.inUse).toContain(target);
    releaseCanvasRenderTarget(pool, target);
    expect(pool.inUse).not.toContain(target);
    expect(pool.free).toContain(target);
  });
});
