import type { CanvasRenderState, Matrix } from '@flighthq/types';

export function setCanvasTransform(
  state: CanvasRenderState,
  context: CanvasRenderingContext2D,
  transform: Readonly<Matrix>,
): void {
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
