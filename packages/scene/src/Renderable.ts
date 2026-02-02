import type { Matrix2D, Rectangle } from '@flighthq/math';

import type { BlendMode } from './BlendMode';
import type DisplayObject from './DisplayObject';
import type DisplayObjectContainer from './DisplayObjectContainer';
import type BitmapFilter from './filters/BitmapFilter';
import type Shader from './Shader';
import type Transform from './Transform';

export const alpha: unique symbol = Symbol('alpha');
export const blendMode: unique symbol = Symbol('blendMode');
export const bounds: unique symbol = Symbol('bounds');
export const cacheAsBitmap: unique symbol = Symbol('cacheAsBitmap');
export const cacheAsBitmapMatrix: unique symbol = Symbol('cacheAsBitmapMatrix');
export const children: unique symbol = Symbol('children');
export const filters: unique symbol = Symbol('filters');
export const height: unique symbol = Symbol('height');
export const localBounds: unique symbol = Symbol('localBounds');
export const localBoundsID: unique symbol = Symbol('localBoundsID');
export const localTransform: unique symbol = Symbol('localTransform');
export const localTransformID: unique symbol = Symbol('localTransformID');
export const mask: unique symbol = Symbol('mask');
export const maskedObject: unique symbol = Symbol('maskedObject');
export const name: unique symbol = Symbol('name');
export const opaqueBackground: unique symbol = Symbol('opaqueBackground');
export const parent: unique symbol = Symbol('parent');
export const parentTransformID: unique symbol = Symbol('parentTransformID');
export const rotationAngle: unique symbol = Symbol('rotationAngle');
export const rotationCosine: unique symbol = Symbol('rotationCosine');
export const rotationSine: unique symbol = Symbol('rotationSine');
export const scale9Grid: unique symbol = Symbol('scale9Grid');
export const scaleX: unique symbol = Symbol('scaleX');
export const scaleY: unique symbol = Symbol('scaleY');
export const scrollRect: unique symbol = Symbol('scrollRect');
export const shader: unique symbol = Symbol('shader');
export const transform: unique symbol = Symbol('transform');
export const width: unique symbol = Symbol('width');
export const worldBounds: unique symbol = Symbol('worldBounds');
export const worldTransform: unique symbol = Symbol('worldTransform');
export const worldTransformID: unique symbol = Symbol('worldTransformID');
export const visible: unique symbol = Symbol('visible');
export const x: unique symbol = Symbol('x');
export const y: unique symbol = Symbol('y');

export const update: unique symbol = Symbol('update');
export const updateBounds: unique symbol = Symbol('updateBounds');
export const updateLocalBounds: unique symbol = Symbol('updateLocalBounds');
export const updateLocalTransform: unique symbol = Symbol('updateLocalTransform');
export const updateWorldBounds: unique symbol = Symbol('updateWorldBounds');
export const updateWorldTransform: unique symbol = Symbol('updateWorldTransform');

export const Renderable = {
  alpha,
  blendMode,
  bounds,
  cacheAsBitmap,
  cacheAsBitmapMatrix,
  children,
  filters,
  height,
  localBounds,
  localBoundsID,
  localTransform,
  localTransformID,
  mask,
  maskedObject,
  name,
  opaqueBackground,
  parent,
  parentTransformID,
  rotationAngle,
  rotationCosine,
  rotationSine,
  scale9Grid,
  scaleX,
  scaleY,
  scrollRect,
  shader,
  transform,
  visible,
  width,
  worldBounds,
  worldTransform,
  worldTransformID,
  x,
  y,

  update,
  updateBounds,
  updateLocalBounds,
  updateLocalTransform,
  updateWorldBounds,
  updateWorldTransform,
} as const;

export interface Renderable {
  readonly [alpha]: number;
  readonly [blendMode]: BlendMode;
  readonly [bounds]: Rectangle;
  readonly [cacheAsBitmap]: boolean;
  readonly [cacheAsBitmapMatrix]: Matrix2D | null;
  readonly [children]: DisplayObject[] | null;
  readonly [filters]: BitmapFilter[] | null;
  readonly [height]: number;
  readonly [localBounds]: Rectangle;
  readonly [localBoundsID]: number;
  readonly [localTransform]: Matrix2D;
  readonly [localTransformID]: number;
  readonly [mask]: DisplayObject | null;
  readonly [maskedObject]: DisplayObject | null;
  readonly [name]: string | null;
  readonly [opaqueBackground]: number | null;
  readonly [parent]: DisplayObjectContainer | null;
  readonly [parentTransformID]: number;
  readonly [rotationAngle]: number;
  readonly [rotationCosine]: number;
  readonly [rotationSine]: number;
  readonly [scale9Grid]: Rectangle | null;
  readonly [scaleX]: number;
  readonly [scaleY]: number;
  readonly [scrollRect]: Rectangle | null;
  readonly [shader]: Shader | null;
  readonly [transform]: Transform | null;
  readonly [width]: number;
  readonly [worldBounds]: Rectangle;
  readonly [worldTransform]: Matrix2D;
  readonly [worldTransformID]: number;
  readonly [visible]: boolean;
  readonly [x]: number;
  readonly [y]: number;

  [update](): void;
  [updateLocalBounds](): void;
  [updateLocalTransform](): void;
  [updateWorldBounds](): void;
  [updateWorldTransform](): void;
}

export default Renderable;
