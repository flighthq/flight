import { addSceneChild, invalidateAppearance, setTransformX } from '@flighthq/scene';
import { setSceneNodeAdapter } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { createSprite } from '@flighthq/scene-sprite';
import type { RenderNodeAdapter } from '@flighthq/types';

import { getOrCreateDefaultDisplayObjectRenderNode } from './renderNode2d';
import { createRenderState } from './renderState';
import { updateDisplayObject, updateSprite } from './update';

describe('updateDisplayObject', () => {
  it('returns true (dirty) on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    expect(updateDisplayObject(state, obj)).toBe(true);
  });

  it('returns false (not dirty) on second call without changes', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObject(state, obj);
    expect(updateDisplayObject(state, obj)).toBe(false);
  });

  it('returns true after appearance changes', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObject(state, obj);
    obj.alpha = 0.5;
    invalidateAppearance(obj);
    expect(updateDisplayObject(state, obj)).toBe(true);
  });

  it('returns true after transform changes', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObject(state, obj);
    setTransformX(obj, 20);
    expect(updateDisplayObject(state, obj)).toBe(true);
  });

  it('skips disabled objects', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    obj.enabled = false;
    expect(updateDisplayObject(state, obj)).toBe(false);
  });

  it('adapter is called when set and node is dirty', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapt = vi.fn().mockReturnValue(null);
    const adapter: RenderNodeAdapter = { adapt };
    setSceneNodeAdapter(obj as any, adapter);
    updateDisplayObject(state, obj);
    expect(adapt).toHaveBeenCalledOnce();
  });

  it('adapter returning false suppresses child traversal', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const child = createDisplayObject();
    addSceneChild(obj, child);
    const adapt = vi.fn().mockReturnValue(false);
    const adapter: RenderNodeAdapter = { adapt };
    setSceneNodeAdapter(obj as any, adapter);
    updateDisplayObject(state, obj);
    const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    expect(data.updateChildren).toBe(false);
  });

  it('adapter is not called when node is not dirty', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapt = vi.fn().mockReturnValue(null);
    const adapter: RenderNodeAdapter = { adapt };
    setSceneNodeAdapter(obj as any, adapter);
    updateDisplayObject(state, obj);
    adapt.mockClear();
    updateDisplayObject(state, obj);
    expect(adapt).not.toHaveBeenCalled();
  });
});

describe('updateSprite', () => {
  it('returns true (dirty) on first call', () => {
    const state = createRenderState();
    const sprite = createSprite();
    expect(updateSprite(state, sprite)).toBe(true);
  });

  it('returns false (not dirty) on second call without changes', () => {
    const state = createRenderState();
    const sprite = createSprite();
    updateSprite(state, sprite);
    expect(updateSprite(state, sprite)).toBe(false);
  });

  it('returns true after transform changes', () => {
    const state = createRenderState();
    const sprite = createSprite();
    updateSprite(state, sprite);
    setTransformX(sprite, 15);
    expect(updateSprite(state, sprite)).toBe(true);
  });

  it('skips disabled sprites', () => {
    const state = createRenderState();
    const sprite = createSprite();
    sprite.enabled = false;
    expect(updateSprite(state, sprite)).toBe(false);
  });
});
