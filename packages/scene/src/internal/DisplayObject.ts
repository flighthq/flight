export const _dirtyFlags: unique symbol = Symbol('dirtyFlags');
export const _loaderInfo: unique symbol = Symbol('loaderInfo');
export const _root: unique symbol = Symbol('root');
export const _stage: unique symbol = Symbol('stage');
export const _transform: unique symbol = Symbol('transform');

export const internal = {
  _dirtyFlags,
  _loaderInfo,
  _root,
  _stage,
  _transform,
} as const;
