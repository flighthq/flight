import type { CanvasRenderState, Matrix3x2 } from '@flighthq/types';

export function setTransform(state: CanvasRenderState, context: CanvasRenderingContext2D, transform: Matrix3x2): void {
  if (state.roundPixels) {
    context.setTransform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      Math.fround(transform.tx),
      Math.fround(transform.ty),
    );
  } else {
    context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);
  }
}
