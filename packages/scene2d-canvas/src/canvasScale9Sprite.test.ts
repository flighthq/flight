import { createRectangle } from '@flighthq/geometry/contract';
import { createImageResource } from '@flighthq/image/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import { createScale9Sprite, createSprite } from '@flighthq/scene2d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Kind, Renderer } from '@flighthq/types/contract';
import { RegistryEntryState, Scale9SpriteKind, SpriteKind } from '@flighthq/types/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { getCanvasPipelineRegistries } from './canvasPipeline';
import { defaultCanvasScale9SpriteRenderer, drawCanvasScale9Sprite } from './canvasScale9Sprite';
import { defaultCanvasSpriteRenderer } from './canvasSprite';
import { createCanvasRenderState, getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { scene2dCanvasPipeline } from './scene2dCanvasPipeline';

// The registry deliberately makes a tombstone unreachable without narrowing, so the helper narrows once
// here rather than at four call sites. A missing or tombstoned entry reads as null, which is what the
// coupling assertions want to distinguish from a bound renderer.
function pipelineRenderer(kind: Kind): Renderer | null {
  const entry = getCanvasPipelineRegistries(scene2dCanvasPipeline).renderers.entries.get(kind);
  return entry !== undefined && entry.state === RegistryEntryState.Bound ? entry.value : null;
}

function makeState() {
  const state = createCanvasRenderState(document.createElement('canvas'));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  registerRenderer(state, Scale9SpriteKind, defaultCanvasScale9SpriteRenderer);
  return state;
}

function makeTexture() {
  const image = createImageResource(globalThis.document.createElement('img'));
  image.width = 64;
  image.height = 64;
  return createTexture({ dimension: '2d', source: image });
}

describe('defaultCanvasScale9SpriteRenderer', () => {
  it('carries submit, renderer data, and the sprite identity dirty hook', () => {
    expect(typeof defaultCanvasScale9SpriteRenderer.submit).toBe('function');
    expect(typeof defaultCanvasScale9SpriteRenderer.createData).toBe('function');
    expect(typeof defaultCanvasScale9SpriteRenderer.isDirty).toBe('function');
  });

  it('is registered on the canvas pipeline as its own Scale9SpriteKind entry', () => {
    expect(pipelineRenderer(Scale9SpriteKind)).toBe(defaultCanvasScale9SpriteRenderer);
  });

  // The renderer arm exists so a Scale9Sprite draws WITHOUT plain Sprite growing a grid branch. Two
  // halves, because either one alone would pass while the coupling existed: the kinds must resolve to
  // DIFFERENT renderers, and SpriteKind must still resolve to the plain sprite renderer after the
  // scale9 entry is registered.
  it('leaves plain SpriteKind resolving to the untouched sprite renderer', () => {
    expect(pipelineRenderer(SpriteKind)).toBe(defaultCanvasSpriteRenderer);
    expect(pipelineRenderer(SpriteKind)).not.toBe(pipelineRenderer(Scale9SpriteKind));
  });

  it('draws a plain Sprite through the sprite renderer in exactly one blit', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
    const draw = vi.spyOn(state.context, 'drawImage');
    const sprite = createSprite({ data: { texture: makeTexture() } });
    defaultCanvasSpriteRenderer.submit(state, getOrCreateRenderProxy2D(state, sprite));
    // A plain Sprite is unsliced whatever this file registers — the proof that the grid did not leak
    // into the shared path is that the sprite still costs one drawImage.
    expect(draw).toHaveBeenCalledOnce();
  });
});

describe('drawCanvasScale9Sprite', () => {
  it('blits the texture in nine pieces when the grid applies', () => {
    const state = makeState();
    const sprite = createScale9Sprite(createRectangle(16, 16, 32, 32), { data: { texture: makeTexture() } });
    sprite.scaleX = 2;
    sprite.scaleY = 2;
    const draw = vi.spyOn(state.context, 'drawImage');
    drawCanvasScale9Sprite(state, getOrCreateRenderProxy2D(state, sprite));
    expect(draw).toHaveBeenCalledTimes(9);
  });

  it('keeps the corner blits at their source size rather than scaling them', () => {
    const state = makeState();
    const sprite = createScale9Sprite(createRectangle(16, 16, 32, 32), { data: { texture: makeTexture() } });
    sprite.scaleX = 2;
    sprite.scaleY = 2;
    const draw = vi.spyOn(state.context, 'drawImage');
    drawCanvasScale9Sprite(state, getOrCreateRenderProxy2D(state, sprite));
    // First slice is the top-left corner: 16x16 of source drawn 16x16 at the origin, unaffected by the
    // node's scale. That is the whole point of nine-slicing — a scaled corner is the defect.
    expect(draw.mock.calls[0].slice(1)).toEqual([0, 0, 16, 16, 0, 0, 16, 16]);
  });

  // The slices are laid out at the node's SCALED size in unscaled space, so the canvas transform must
  // have the node's own scale removed or the whole thing is scaled twice. Nothing about the drawImage
  // arguments can catch that — they are local-space numbers either way — so the transform itself is what
  // has to be asserted.
  it('strips the node scale from the canvas transform so the slices are not scaled twice', () => {
    const state = makeState();
    const sprite = createScale9Sprite(createRectangle(16, 16, 32, 32), { data: { texture: makeTexture() } });
    sprite.scaleX = 2;
    sprite.scaleY = 4;
    // The update pass is what puts the node's scale on the proxy transform; without it the renderer
    // strips a scale that was never applied and the assertion would be about nothing.
    prepareScene2DRender(state, sprite);
    const setTransform = vi.spyOn(state.context, 'setTransform');
    drawCanvasScale9Sprite(state, getOrCreateRenderProxy2D(state, sprite));
    expect(setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('keeps the unsliced fallback at the node scale, which it must not strip', () => {
    const state = makeState();
    const sprite = createScale9Sprite(createRectangle(0, 0, 999, 999), { data: { texture: makeTexture() } });
    sprite.scaleX = 2;
    sprite.scaleY = 4;
    prepareScene2DRender(state, sprite);
    const setTransform = vi.spyOn(state.context, 'setTransform');
    drawCanvasScale9Sprite(state, getOrCreateRenderProxy2D(state, sprite));
    // The fallback draws the texture whole at its source size, so it needs the node's scale left ON to
    // reach the same painted size. Stripping in both branches would silently shrink the fallback.
    expect(setTransform).toHaveBeenLastCalledWith(2, 0, 0, 4, 0, 0);
  });

  it('falls back to one unsliced blit when the grid cannot be applied', () => {
    const state = makeState();
    // A grid wider than the texture cannot be applied; the contract is to draw the texture whole, not to
    // draw nothing, so a bad grid degrades to a plain sprite rather than to an invisible node.
    const sprite = createScale9Sprite(createRectangle(0, 0, 999, 999), { data: { texture: makeTexture() } });
    const draw = vi.spyOn(state.context, 'drawImage');
    drawCanvasScale9Sprite(state, getOrCreateRenderProxy2D(state, sprite));
    expect(draw).toHaveBeenCalledOnce();
    expect(draw.mock.calls[0].slice(1, 5)).toEqual([0, 0, 64, 64]);
  });

  it('draws nothing when the node carries no texture', () => {
    const state = makeState();
    const sprite = createScale9Sprite(createRectangle(16, 16, 32, 32));
    const draw = vi.spyOn(state.context, 'drawImage');
    drawCanvasScale9Sprite(state, getOrCreateRenderProxy2D(state, sprite));
    expect(draw).not.toHaveBeenCalled();
  });
});
