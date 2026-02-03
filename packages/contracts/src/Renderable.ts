import type { BitmapFilter, BlendMode, Matrix2D, Rectangle, Shader } from '@flighthq/types';

import { RenderableSymbols as R } from './RenderableSymbols.js';

export interface Renderable {
  readonly [R.alpha]: number;
  readonly [R.blendMode]: BlendMode;
  readonly [R.bounds]: Rectangle;
  readonly [R.cacheAsBitmap]: boolean;
  readonly [R.cacheAsBitmapMatrix]: Matrix2D | null;
  readonly [R.children]: Renderable[] | null;
  readonly [R.filters]: BitmapFilter[] | null;
  readonly [R.height]: number;
  readonly [R.localBounds]: Rectangle;
  readonly [R.localBoundsID]: number;
  readonly [R.localTransform]: Matrix2D;
  readonly [R.localTransformID]: number;
  readonly [R.mask]: Renderable | null;
  readonly [R.maskedObject]: Renderable | null;
  readonly [R.name]: string | null;
  readonly [R.opaqueBackground]: number | null;
  readonly [R.parent]: Renderable | null;
  readonly [R.parentTransformID]: number;
  readonly [R.rotationAngle]: number;
  readonly [R.rotationCosine]: number;
  readonly [R.rotationSine]: number;
  readonly [R.scale9Grid]: Rectangle | null;
  readonly [R.scaleX]: number;
  readonly [R.scaleY]: number;
  readonly [R.scrollRect]: Rectangle | null;
  readonly [R.shader]: Shader | null;
  readonly [R.width]: number;
  readonly [R.worldBounds]: Rectangle;
  readonly [R.worldTransform]: Matrix2D;
  readonly [R.worldTransformID]: number;
  readonly [R.visible]: boolean;
  readonly [R.x]: number;
  readonly [R.y]: number;

  [R.update](): void;
  [R.updateLocalBounds](): void;
  [R.updateLocalTransform](): void;
  [R.updateWorldBounds](): void;
  [R.updateWorldTransform](): void;
}

export default Renderable;
