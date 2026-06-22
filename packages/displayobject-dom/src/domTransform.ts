import type { Matrix } from '@flighthq/types';

export function setDomTransform(element: HTMLElement, transform: Readonly<Matrix>, roundPixels: boolean): void {
  const tx = roundPixels ? Math.fround(transform.tx) : transform.tx;
  const ty = roundPixels ? Math.fround(transform.ty) : transform.ty;
  element.style.transform = `matrix(${transform.a},${transform.b},${transform.c},${transform.d},${tx},${ty})`;
}

export function setDomTransformWithOffset(
  element: HTMLElement,
  transform: Readonly<Matrix>,
  offsetX: number,
  offsetY: number,
  roundPixels: boolean,
): void {
  const { a, b, c, d } = transform;
  let tx = a * offsetX + c * offsetY + transform.tx;
  let ty = b * offsetX + d * offsetY + transform.ty;
  if (roundPixels) {
    tx = Math.fround(tx);
    ty = Math.fround(ty);
  }
  element.style.transform = `matrix(${a},${b},${c},${d},${tx},${ty})`;
}
