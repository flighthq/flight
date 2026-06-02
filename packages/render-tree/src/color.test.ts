import { createColorTransform } from '@flighthq/materials';
import { createRenderState, rgbaToHexString, setRenderStateBackgroundColor } from '@flighthq/render-core';
import { addSceneChild } from '@flighthq/scene-core';
import { createDisplayObject } from '@flighthq/scene-display';
import type { DisplayObject, DisplayObjectRenderTreeNode, RenderState } from '@flighthq/types';

import { updateRenderNodeColorTransform } from './color';
import { getOrCreateDisplayObjectRenderNode } from './renderTreeNode2d';

describe('rgbaToHexString', () => {
  it('converts basic RGB colors to CSS hex strings', () => {
    expect(rgbaToHexString(0xff0000)).toBe('#ff0000');
    expect(rgbaToHexString(0x00ff00)).toBe('#00ff00');
    expect(rgbaToHexString(0x0000ff)).toBe('#0000ff');
  });

  it('pads short values with leading zeros', () => {
    expect(rgbaToHexString(0x000001)).toBe('#000001');
    expect(rgbaToHexString(0)).toBe('#000000');
  });

  it('masks out alpha/upper bits', () => {
    expect(rgbaToHexString(0xff112233)).toBe('#112233');
    expect(rgbaToHexString(0xaaff0000)).toBe('#ff0000');
  });
});

describe('setRenderStateBackgroundColor', () => {
  let state: RenderState;

  beforeEach(() => {
    state = createRenderState();
  });

  it('sets 0 (transparent) properly', () => {
    setRenderStateBackgroundColor(state, 0);
    expect(state.backgroundColor).toBe(0);
    expect(state.backgroundColorRGBA).toStrictEqual([0, 0, 0, 0]);
    expect(state.backgroundColorString).toBe('#00000000');
  });

  it('sets 0xFF000000 properly', () => {
    setRenderStateBackgroundColor(state, 0xff000000);
    expect(state.backgroundColor).toBe(0xff000000);
    expect(state.backgroundColorRGBA).toStrictEqual([1, 0, 0, 0]);
    expect(state.backgroundColorString).toBe('#FF000000');
  });

  it('sets 0xFF0000FF properly', () => {
    setRenderStateBackgroundColor(state, 0xff0000ff);
    expect(state.backgroundColor).toBe(0xff0000ff);
    expect(state.backgroundColorRGBA).toStrictEqual([1, 0, 0, 1]);
    expect(state.backgroundColorString).toBe('#FF0000FF');
  });

  it('sets 0x88888888 properly', () => {
    setRenderStateBackgroundColor(state, 0x88888888);
    expect(state.backgroundColor).toBe(0x88888888);
    expect(state.backgroundColorRGBA).toStrictEqual([0x88 / 255, 0x88 / 255, 0x88 / 255, 0x88 / 255]);
    expect(state.backgroundColorString).toBe('#88888888');
  });

  it('sets 0x12345678 properly', () => {
    setRenderStateBackgroundColor(state, 0x12345678);
    expect(state.backgroundColor).toBe(0x12345678);
    expect(state.backgroundColorRGBA).toStrictEqual([0x12 / 255, 0x34 / 255, 0x56 / 255, 0x78 / 255]);
    expect(state.backgroundColorString).toBe('#12345678');
  });
});

describe('updateRenderNodeColorTransform', () => {
  let parent: DisplayObject;
  let parentData: DisplayObjectRenderTreeNode;
  let child: DisplayObject;
  let childData: DisplayObjectRenderTreeNode;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addSceneChild(parent, child);
    state = createRenderState();
    parentData = getOrCreateDisplayObjectRenderNode(state, parent);
    childData = getOrCreateDisplayObjectRenderNode(state, child);
  });

  it('sets useColorTransform to false if source does not use color transform', () => {
    updateRenderNodeColorTransform(state, parentData);
    expect(parentData.useColorTransform).toBe(false);
    updateRenderNodeColorTransform(state, childData, parentData);
    expect(childData.useColorTransform).toBe(false);
  });

  it('sets useColorTransform to false if source has identity color transform', () => {
    parent.colorTransform = createColorTransform();
    updateRenderNodeColorTransform(state, parentData);
    expect(parentData.useColorTransform).toBe(false);
  });

  it('sets useColorTransform to true if source has non-identity color transform', () => {
    parent.colorTransform = createColorTransform();
    parent.colorTransform.redMultiplier = 0.5;
    updateRenderNodeColorTransform(state, parentData);
    expect(parentData.useColorTransform).toBe(true);
  });

  it('propagates to children', () => {
    parent.colorTransform = createColorTransform();
    parent.colorTransform.redMultiplier = 0.5;
    updateRenderNodeColorTransform(state, parentData);
    updateRenderNodeColorTransform(state, childData, parentData);
    expect(childData.useColorTransform).toBe(true);
  });

  it('does not propagate to parents', () => {
    child.colorTransform = createColorTransform();
    child.colorTransform.redMultiplier = 0.5;
    updateRenderNodeColorTransform(state, childData, parentData);
    updateRenderNodeColorTransform(state, parentData);
    expect(parentData.useColorTransform).toBe(false);
  });
});
