import { createMatrix } from '@flighthq/geometry';
import { BlendMode, type RenderState } from '@flighthq/types';

import { createRenderState } from './renderState';

describe('createRenderState', () => {
  let state: RenderState;

  beforeEach(() => {
    state = createRenderState();
  });

  it('initializes default values', () => {
    expect(state.allowSmoothing).toStrictEqual(true);
    expect(state.backgroundColor).toStrictEqual(0);
    expect(state.backgroundColorRGBA).toStrictEqual([]);
    expect(state.backgroundColorString).toStrictEqual('');
    expect(state.currentFrameID).toStrictEqual(0);
    expect(state.pixelRatio).toStrictEqual(1);
    expect(state.renderProxyMap).toStrictEqual(new WeakMap());
    expect(state.renderAlpha).toStrictEqual(1);
    expect(state.renderBlendMode).toStrictEqual(BlendMode.Normal);
    expect(state.displayObjectMaskPass).toStrictEqual(null);
    expect(state.renderTransform2D).toStrictEqual(null);
    expect(state.roundPixels).toStrictEqual(false);
    expect(state.tempStack).toStrictEqual([]);
  });

  it('allows pre-defined values', () => {
    const base = {
      allowSmoothing: false,
      backgroundColor: 0xff,
      backgroundColorRGBA: [1, 0, 0, 0],
      backgroundColorString: '#FF000000',
      currentFrameID: 10,
      pixelRatio: 5,
      renderProxyMap: new WeakMap(),
      renderAlpha: 0.5,
      renderBlendMode: BlendMode.Multiply,
      renderTransform2D: createMatrix(),
      roundPixels: true,
      tempStack: [],
    };
    const obj = createRenderState(base);
    expect(obj.allowSmoothing).toStrictEqual(base.allowSmoothing);
    expect(obj.backgroundColor).toStrictEqual(base.backgroundColor);
    expect(obj.backgroundColorRGBA).toStrictEqual(base.backgroundColorRGBA);
    expect(obj.backgroundColorString).toStrictEqual(base.backgroundColorString);
    expect(obj.currentFrameID).toStrictEqual(base.currentFrameID);
    expect(obj.pixelRatio).toStrictEqual(base.pixelRatio);
    expect(obj.renderProxyMap).toStrictEqual(base.renderProxyMap);
    expect(obj.renderAlpha).toStrictEqual(base.renderAlpha);
    expect(obj.renderBlendMode).toStrictEqual(base.renderBlendMode);
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
