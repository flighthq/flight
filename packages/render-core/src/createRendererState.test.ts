import { matrix3x2 } from '@flighthq/math';
import type { RendererState } from '@flighthq/types';

import { createRendererState } from './createRendererState';

describe('createRendererState', () => {
  let state: RendererState;

  beforeEach(() => {
    state = createRendererState();
  });

  it('initializes default values', () => {
    expect(state.backgroundColor).toStrictEqual(0);
    expect(state.backgroundColorRGBA).toStrictEqual([]);
    expect(state.backgroundColorString).toStrictEqual('');
    expect(state.currentBlendMode).toStrictEqual(null);
    expect(state.pixelRatio).toStrictEqual(1);
    expect(state.renderableStack).toStrictEqual([]);
    expect(state.renderableDataMap).toStrictEqual(new WeakMap());
    expect(state.renderTransform).toStrictEqual(matrix3x2.create());
    expect(state.renderQueue).toStrictEqual([]);
    expect(state.renderQueueLength).toStrictEqual(0);
    expect(state.roundPixels).toStrictEqual(false);
  });

  it('allows pre-defined values', () => {
    const base = {
      backgroundColor: 0xff,
      backgroundColorRGBA: [1, 0, 0, 0],
      backgroundColorString: '#FF000000',
      currentBlendMode: null,
      pixelRatio: 5,
      renderableStack: [],
      renderableDataMap: new WeakMap(),
      renderTransform: matrix3x2.create(),
      renderQueue: [],
      renderQueueLength: 100,
      roundPixels: true,
    };
    const obj = createRendererState(base);
    expect(obj.backgroundColor).toStrictEqual(base.backgroundColor);
    expect(obj.backgroundColorRGBA).toStrictEqual(base.backgroundColorRGBA);
    expect(obj.backgroundColorString).toStrictEqual(base.backgroundColorString);
    expect(obj.currentBlendMode).toStrictEqual(base.currentBlendMode);
    expect(obj.pixelRatio).toStrictEqual(base.pixelRatio);
    expect(obj.renderableStack).toStrictEqual(base.renderableStack);
    expect(obj.renderableDataMap).toStrictEqual(base.renderableDataMap);
    expect(obj.renderTransform).toStrictEqual(base.renderTransform);
    expect(obj.renderQueue).toStrictEqual(base.renderQueue);
    expect(obj.renderQueueLength).toStrictEqual(base.renderQueueLength);
    expect(obj.roundPixels).toStrictEqual(base.roundPixels);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createRendererState(base);
    expect(obj).not.toStrictEqual(base);
  });
});
