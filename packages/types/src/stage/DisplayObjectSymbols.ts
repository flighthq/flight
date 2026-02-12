export const alpha: unique symbol = Symbol('alpha');
export const blendMode: unique symbol = Symbol('blendMode');
export const bounds: unique symbol = Symbol('bounds');
export const cacheAsBitmap: unique symbol = Symbol('cacheAsBitmap');
export const cacheAsBitmapMatrix: unique symbol = Symbol('cacheAsBitmapMatrix');
export const children: unique symbol = Symbol('children');
export const dirtyFlags: unique symbol = Symbol('dirtyFlags');
export const filters: unique symbol = Symbol('filters');
export const height: unique symbol = Symbol('height');
export const loaderInfo: unique symbol = Symbol('loaderInfo');
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
export const root: unique symbol = Symbol('root');
export const rotationAngle: unique symbol = Symbol('rotationAngle');
export const rotationCosine: unique symbol = Symbol('rotationCosine');
export const rotationSine: unique symbol = Symbol('rotationSine');
export const scale9Grid: unique symbol = Symbol('scale9Grid');
export const scaleX: unique symbol = Symbol('scaleX');
export const scaleY: unique symbol = Symbol('scaleY');
export const scrollRect: unique symbol = Symbol('scrollRect');
export const shader: unique symbol = Symbol('shader');
export const stage: unique symbol = Symbol('stage');
export const transform: unique symbol = Symbol('transform');
export const width: unique symbol = Symbol('width');
export const worldBounds: unique symbol = Symbol('worldBounds');
export const worldTransform: unique symbol = Symbol('worldTransform');
export const worldTransformID: unique symbol = Symbol('worldTransformID');
export const visible: unique symbol = Symbol('visible');
export const x: unique symbol = Symbol('x');
export const y: unique symbol = Symbol('y');

export const DisplayObjectSymbols = {
  alpha,
  blendMode,
  bounds,
  cacheAsBitmap,
  cacheAsBitmapMatrix,
  children,
  dirtyFlags,
  filters,
  height,
  loaderInfo,
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
  root,
  rotationAngle,
  rotationCosine,
  rotationSine,
  scale9Grid,
  scaleX,
  scaleY,
  scrollRect,
  shader,
  stage,
  transform,
  visible,
  width,
  worldBounds,
  worldTransform,
  worldTransformID,
  x,
  y,
} as const;

export default DisplayObjectSymbols;
