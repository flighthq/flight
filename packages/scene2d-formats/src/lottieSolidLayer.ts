import { addNodeChild } from '@flighthq/node/contract';
import { appendPathRectangle, createPath } from '@flighthq/path/contract';
import { appendShapeBeginFill, appendShapeEndFill, appendShapePath, createShape } from '@flighthq/shape/contract';
import type { DisplayObject, LottieLayer, LottieLayerContext } from '@flighthq/types/contract';

/**
 * The solid layer: one opaque rectangle the size the layer declares.
 *
 * Its colour is a CSS hex string rather than the component array every other Lottie colour uses, which is why the
 * parse lives here and not beside `lottieRgba` in the core.
 */
export function lottieSolidLayerHandler(context: LottieLayerContext): void {
  appendLottieSolid(context.container, context.layer);
}

function appendLottieSolid(parent: DisplayObject, layer: Readonly<LottieLayer>): void {
  const shape = createShape();
  const color = parseHexColor(layer.sc ?? '#000000');
  appendShapeBeginFill(shape, color, 1);
  const path = createPath();
  appendPathRectangle(path, 0, 0, layer.sw ?? 0, layer.sh ?? 0);
  appendShapePath(shape, path.commands.slice(), path.data.slice(), path.winding);
  appendShapeEndFill(shape);
  addNodeChild(parent, shape);
}

function parseHexColor(value: string): number {
  const parsed = Number.parseInt(value.replace(/^#/, ''), 16);
  return Number.isFinite(parsed) ? (((parsed & 0xffffff) << 8) | 0xff) >>> 0 : 0x000000ff;
}
