import { matrix3x2 } from '@flighthq/geometry';
import { colorTransform } from '@flighthq/materials';
import { BlendMode, type RenderState } from '@flighthq/types';

import { createRenderState } from './renderState';

describe('createRenderState', () => {
  let state: RenderState;

  beforeEach(() => {
    state = createRenderState();
  });

  it('initializes default values', () => {
    expect(state.allowCacheAsBitmap).toStrictEqual(true);
    expect(state.allowFilters).toStrictEqual(true);
    expect(state.allowSmoothing).toStrictEqual(true);
    expect(state.backgroundColor).toStrictEqual(0);
    expect(state.backgroundColorRGBA).toStrictEqual([]);
    expect(state.backgroundColorString).toStrictEqual('');
    expect(state.currentFrameID).toStrictEqual(0);
    expect(state.currentQueue).toStrictEqual([]);
    expect(state.currentQueueLength).toStrictEqual(0);
    expect(state.pixelRatio).toStrictEqual(1);
    expect(state.renderNodeMap).toStrictEqual(new WeakMap());
    expect(state.renderAlpha).toStrictEqual(1);
    expect(state.renderBlendMode).toStrictEqual(BlendMode.Normal);
    expect(state.renderColorTransform).toStrictEqual(null);
    expect(state.renderShader).toStrictEqual(null);
    expect(state.renderTransform2D).toStrictEqual(null);
    expect(state.roundPixels).toStrictEqual(false);
    expect(state.tempStack).toStrictEqual([]);
  });

  it('allows pre-defined values', () => {
    const base = {
      allowCacheAsBitmap: false,
      allowFilters: false,
      allowSmoothing: false,
      backgroundColor: 0xff,
      backgroundColorRGBA: [1, 0, 0, 0],
      backgroundColorString: '#FF000000',
      currentFrameID: 10,
      currentQueue: [],
      currentQueueLength: 100,
      pixelRatio: 5,
      renderNodeMap: new WeakMap(),
      renderAlpha: 0.5,
      renderBlendMode: BlendMode.Multiply,
      renderColorTransform: colorTransform.create(),
      renderShader: null,
      renderTransform2D: matrix3x2.create(),
      roundPixels: true,
      tempStack: [],
    };
    const obj = createRenderState(base);
    expect(obj.allowCacheAsBitmap).toStrictEqual(base.allowCacheAsBitmap);
    expect(obj.allowFilters).toStrictEqual(base.allowFilters);
    expect(obj.allowSmoothing).toStrictEqual(base.allowSmoothing);
    expect(obj.backgroundColor).toStrictEqual(base.backgroundColor);
    expect(obj.backgroundColorRGBA).toStrictEqual(base.backgroundColorRGBA);
    expect(obj.backgroundColorString).toStrictEqual(base.backgroundColorString);
    expect(obj.currentFrameID).toStrictEqual(base.currentFrameID);
    expect(obj.currentQueue).toStrictEqual(base.currentQueue);
    expect(obj.currentQueueLength).toStrictEqual(base.currentQueueLength);
    expect(obj.pixelRatio).toStrictEqual(base.pixelRatio);
    expect(obj.renderNodeMap).toStrictEqual(base.renderNodeMap);
    expect(obj.renderAlpha).toStrictEqual(base.renderAlpha);
    expect(obj.renderBlendMode).toStrictEqual(base.renderBlendMode);
    expect(obj.renderColorTransform).toStrictEqual(base.renderColorTransform);
    expect(obj.renderShader).toStrictEqual(base.renderShader);
    expect(obj.renderTransform2D).toStrictEqual(base.renderTransform2D);
    expect(obj.roundPixels).toStrictEqual(base.roundPixels);
    expect(obj.tempStack).toStrictEqual(base.tempStack);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createRenderState(base);
    expect(obj).not.toStrictEqual(base);
  });
});
