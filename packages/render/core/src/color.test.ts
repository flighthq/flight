import { colorTransform } from '@flighthq/materials';
import { addChild } from '@flighthq/scene-graph-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';
import type { DisplayObject, RenderNode, RenderState } from '@flighthq/types';

import { setBackgroundColor, updateColorTransform } from './color';
import { getRenderNode } from './renderNode';
import { createRenderState } from './renderState';

describe('setBackgroundColor', () => {
  let state: RenderState;

  beforeEach(() => {
    state = createRenderState();
  });

  it('sets 0 (transparent) properly', () => {
    setBackgroundColor(state, 0);
    expect(state.backgroundColor).toBe(0);
    expect(state.backgroundColorRGBA).toStrictEqual([0, 0, 0, 0]);
    expect(state.backgroundColorString).toBe('#00000000');
  });

  it('sets 0xFF000000 properly', () => {
    setBackgroundColor(state, 0xff000000);
    expect(state.backgroundColor).toBe(0xff000000);
    expect(state.backgroundColorRGBA).toStrictEqual([1, 0, 0, 0]);
    expect(state.backgroundColorString).toBe('#FF000000');
  });

  it('sets 0xFF0000FF properly', () => {
    setBackgroundColor(state, 0xff0000ff);
    expect(state.backgroundColor).toBe(0xff0000ff);
    expect(state.backgroundColorRGBA).toStrictEqual([1, 0, 0, 1]);
    expect(state.backgroundColorString).toBe('#FF0000FF');
  });

  it('sets 0x88888888 properly', () => {
    setBackgroundColor(state, 0x88888888);
    expect(state.backgroundColor).toBe(0x88888888);
    expect(state.backgroundColorRGBA).toStrictEqual([0x88 / 255, 0x88 / 255, 0x88 / 255, 0x88 / 255]);
    expect(state.backgroundColorString).toBe('#88888888');
  });

  it('sets 0x12345678 properly', () => {
    setBackgroundColor(state, 0x12345678);
    expect(state.backgroundColor).toBe(0x12345678);
    expect(state.backgroundColorRGBA).toStrictEqual([0x12 / 255, 0x34 / 255, 0x56 / 255, 0x78 / 255]);
    expect(state.backgroundColorString).toBe('#12345678');
  });
});

describe('updateColorTransform', () => {
  let parent: DisplayObject;
  let parentData: RenderNode;
  let child: DisplayObject;
  let childData: RenderNode;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addChild(parent, child);
    state = createRenderState();
    parentData = getRenderNode(state, parent);
    childData = getRenderNode(state, child);
  });

  it('sets useColorTransform to false if source does not use color transform', () => {
    updateColorTransform(state, parentData);
    expect(parentData.useColorTransform).toBe(false);
    updateColorTransform(state, childData, parentData);
    expect(childData.useColorTransform).toBe(false);
  });

  it('sets useColorTransform to false if source has identity color transform', () => {
    parent.colorTransform = colorTransform.create();
    updateColorTransform(state, parentData);
    expect(parentData.useColorTransform).toBe(false);
  });

  it('sets useColorTransform to true if source has non-identity color transform', () => {
    parent.colorTransform = colorTransform.create();
    parent.colorTransform.redMultiplier = 0.5;
    updateColorTransform(state, parentData);
    expect(parentData.useColorTransform).toBe(true);
  });

  it('propagates to children', () => {
    parent.colorTransform = colorTransform.create();
    parent.colorTransform.redMultiplier = 0.5;
    updateColorTransform(state, parentData);
    updateColorTransform(state, childData, parentData);
    expect(childData.useColorTransform).toBe(true);
  });

  it('does not propagate to parents', () => {
    child.colorTransform = colorTransform.create();
    child.colorTransform.redMultiplier = 0.5;
    updateColorTransform(state, childData, parentData);
    updateColorTransform(state, parentData);
    expect(parentData.useColorTransform).toBe(false);
  });
});
