import { matrix3x2 } from '@flighthq/geometry';
import type { CanvasRendererState, Matrix3x2 } from '@flighthq/types';

import { createCanvasRendererState } from './createCanvasRendererState';
import { setTransform } from './transform';

describe('setTransform', () => {
  let canvas: HTMLCanvasElement;
  let state: CanvasRendererState;
  let transform: Matrix3x2;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    state = createCanvasRendererState(canvas);
    transform = matrix3x2.create(1, 2, 3, 4, 5.6789, 9.1011);
  });

  it('should call setTransform with correct values when roundPixels is false', () => {
    setTransform(state, state.context, transform);
    expect(state.context.setTransform).toHaveBeenCalledWith(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.tx,
      transform.ty,
    );
  });

  it('should call setTransform with frounded tx and ty when roundPixels is true', () => {
    state.roundPixels = true;
    setTransform(state, state.context, transform);
    expect(state.context.setTransform).toHaveBeenCalledWith(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      Math.fround(transform.tx),
      Math.fround(transform.ty),
    );
  });
});
