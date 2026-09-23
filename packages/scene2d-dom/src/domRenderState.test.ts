import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createDomRenderState, createDomRenderStateRuntime, getDomRenderStateRuntime } from './domRenderState';

describe('createDomRenderState', () => {
  it('returns a state with the provided element', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div);
    expect(state.element).toBe(div);
  });

  it('sets position:relative and overflow:hidden on the element', () => {
    const div = document.createElement('div');
    createDomRenderState(div);
    expect(div.style.position).toBe('relative');
    expect(div.style.overflow).toBe('hidden');
  });

  it('defaults roundPixels to false', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div);
    expect(state.roundPixels).toBe(false);
  });

  it('sets roundPixels from options', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div, { roundPixels: true });
    expect(state.roundPixels).toBe(true);
  });

  it('defaults the runtime currentBlendMode to null', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div);
    expect(getDomRenderStateRuntime(state).currentBlendMode).toBeNull();
  });

  it('attaches a populated runtime under EntityRuntimeKey', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div);
    const runtime = getDomRenderStateRuntime(state);
    expect(runtime.domClipHooks).toBeNull();
    expect(runtime.domCurrentElement).toBeNull();
    expect(runtime.domOrderLength).toBe(-1);
    expect(runtime.domClipStack).toEqual([]);
    expect(runtime.domOrderList).toEqual([]);
    expect(runtime.domNextOrderList).toEqual([]);
  });

  // ★ DOM HAS NO BACKGROUND OPTION, AND NEEDS NONE. The background of a DOM scene is a CSS property on
  // the element the caller already holds — `element.style.backgroundColor = '#1a1a2e'` — so a render
  // option plus a painting function was a whole seam for one assignment. Passing an option is now a type
  // error, which is why this test asserts only what remains: the element the state was given.
  it('keeps the element the caller passed, and takes no background option', () => {
    const div = document.createElement('div');

    const state = createDomRenderState(div);

    expect(state.element).toBe(div);
  });

  it('sets pixelRatio from options', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div, { pixelRatio: 3 });
    expect(state.pixelRatio).toBe(3);
  });

  it('defaults pixelRatio to 1', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div);
    expect(state.pixelRatio).toBe(1);
  });
});

describe('createDomRenderState registry resolution', () => {
  it('resolves a seeded renderer through the runtime the state carries', () => {
    const renderer = { createData: () => null, submit: () => {} } as never;
    const state = createDomRenderState(document.createElement('div'), {
      nodeRenderers: new Map([['Shape', renderer]]),
    });
    expect(getDomRenderStateRuntime(state).registries.nodeRenderers.get('Shape')).toBe(renderer);
  });

  it('keeps two states built from one fragment independent', () => {
    const shared = new Map([['Shape', { createData: () => null, submit: () => {} } as never]]);
    const first = createDomRenderState(document.createElement('div'), { nodeRenderers: shared });
    const second = createDomRenderState(document.createElement('div'), { nodeRenderers: shared });
    expect(getDomRenderStateRuntime(first).registries.nodeRenderers).not.toBe(
      getDomRenderStateRuntime(second).registries.nodeRenderers,
    );
  });

  it('still honors the scalar options it accepted before registries existed', () => {
    const state = createDomRenderState(document.createElement('div'), { pixelRatio: 3, roundPixels: true });
    expect(state.pixelRatio).toBe(3);
    expect(state.roundPixels).toBe(true);
  });
});

describe('createDomRenderStateRuntime', () => {
  it('allocates an entity runtime with a null binding', () => {
    const runtime = createDomRenderStateRuntime();
    expect(runtime.binding).toBeNull();
    expect(runtime.registries.colorAdjustments).toBeUndefined();
    expect(runtime.registries.shapeRasterizer).toBeNull();
    expect(runtime.registries.textureResolvers).toBeInstanceOf(Map);
    expect(runtime.registries.textureResolvers.size).toBe(0);
  });
});

describe('createDomRenderStateRuntime registry seeding', () => {
  it('preserves every default when options name no registry', () => {
    const runtime = createDomRenderStateRuntime();
    expect(runtime.registries.nodeRenderers).toBeInstanceOf(Map);
    expect(runtime.registries.nodeRenderers.size).toBe(0);
    expect(runtime.registries.textureResolvers).toBeInstanceOf(Map);
    expect(runtime.registries.textureResolvers.size).toBe(0);
    expect(runtime.registries.shapeRasterizer).toBeNull();
    // Absent optional tables stay ABSENT rather than becoming present-and-undefined: field presence is
    // what keeps every registries object one hidden class on the draw path.
    expect('canvasShapeCommands' in runtime.registries).toBe(false);
    expect('effectPaddingResolvers' in runtime.registries).toBe(false);
  });

  it('seeds the runtime registries from the options fragment', () => {
    const renderer = { createData: () => null, submit: () => {} } as never;
    const runtime = createDomRenderStateRuntime({ nodeRenderers: new Map([['Shape', renderer]]) });
    expect(runtime.registries.nodeRenderers.get('Shape')).toBe(renderer);
  });

  it('COPIES each table, so one fragment cannot alias two states together', () => {
    const shared = new Map([['Shape', { createData: () => null, submit: () => {} } as never]]);
    const first = createDomRenderStateRuntime({ nodeRenderers: shared });
    const second = createDomRenderStateRuntime({ nodeRenderers: shared });

    expect(first.registries.nodeRenderers).not.toBe(shared);
    expect(first.registries.nodeRenderers).not.toBe(second.registries.nodeRenderers);
    // Mutating the caller's fragment after construction must not reach either state.
    shared.set('Late', { createData: () => null, submit: () => {} } as never);
    expect(first.registries.nodeRenderers.has('Late')).toBe(false);
    expect(second.registries.nodeRenderers.has('Late')).toBe(false);
  });

  it('seeds the optional tables only when the fragment names them', () => {
    const runtime = createDomRenderStateRuntime({
      canvasShapeCommands: new Map([['beginFill', {} as never]]),
      effectPaddingResolvers: new Map([['blur', {} as never]]),
      textureResolvers: new Map([['Bitmap', {} as never]]),
    });
    expect(runtime.registries.canvasShapeCommands!.has('beginFill')).toBe(true);
    expect(runtime.registries.effectPaddingResolvers!.has('blur')).toBe(true);
    expect(runtime.registries.textureResolvers.has('Bitmap')).toBe(true);
  });
});

describe('getDomRenderStateRuntime', () => {
  it('returns the runtime attached under EntityRuntimeKey', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div);
    expect(getDomRenderStateRuntime(state)).toBe(state[EntityRuntimeKey]);
  });
});
