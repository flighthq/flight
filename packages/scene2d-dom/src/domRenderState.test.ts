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
  // the element the caller already holds — `element.style.backgroundColor = '#1a1a2e'` — so carrying it
  // through a render option and a renderDomBackground call was a whole seam for one assignment.
  // The background of a DOM scene is a CSS property on the element the caller already holds —
  // `element.style.backgroundColor = '#1a1a2e'` — so carrying it through a render option and a
  // renderDomBackground call was a whole seam for one assignment. The option is gone; passing one is a
  // type error, which is why this test asserts only what remains: the element the state was given.
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

describe('createDomRenderStateRuntime', () => {
  it('allocates an entity runtime with a null binding', () => {
    const runtime = createDomRenderStateRuntime();
    expect(runtime.binding).toBeNull();
    expect(runtime.registries.colorAdjustments).toBeUndefined();
    expect(runtime.registries.shapeRasterizer).toMatchObject({
      entry: null,
      onMiss: 'Unregistered',
      registry: 'DomShapeRasterizer',
      shape: 'slot',
    });
    expect(runtime.registries.textureResolvers).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'DomTextureResolver',
      shape: 'keyed',
    });
    expect(runtime.registries.textureResolvers.entries.size).toBe(0);
  });
});

describe('getDomRenderStateRuntime', () => {
  it('returns the runtime attached under EntityRuntimeKey', () => {
    const div = document.createElement('div');
    const state = createDomRenderState(div);
    expect(getDomRenderStateRuntime(state)).toBe(state[EntityRuntimeKey]);
  });
});
