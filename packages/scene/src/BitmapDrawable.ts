import type { Matrix2D, Rectangle } from '@flighthq/math';

import type { BlendMode } from './BlendMode';
import type DisplayObject from './DisplayObject';
import type DisplayObjectContainer from './DisplayObjectContainer';
import type BitmapFilter from './filters/BitmapFilter';
import {
  _alpha,
  _blendMode,
  _cacheAsBitmap,
  _cacheAsBitmapMatrix,
  _filters,
  _height,
  _localBounds,
  _localBoundsID,
  _localTransform,
  _localTransformID,
  _mask,
  _maskedObject,
  _name,
  _opaqueBackground,
  _parent,
  _parentTransformID,
  _root,
  _rotationAngle,
  _rotationCosine,
  _rotationSine,
  _scale9Grid,
  _scaleX,
  _scaleY,
  _scrollRect,
  _shader,
  _stage,
  _transform,
  _transformedBounds,
  _visible,
  _width,
  _worldTransform,
  _worldTransformID,
  _x,
  _y,
} from './internal/DisplayObject.js';
import type Shader from './Shader';
import type Stage from './Stage';
import type Transform from './Transform';

export interface BitmapDrawable {
  readonly [_alpha]: number;
  readonly [_blendMode]: BlendMode;
  readonly [_cacheAsBitmap]: boolean;
  readonly [_cacheAsBitmapMatrix]: Matrix2D | null;
  readonly [_filters]: BitmapFilter[] | null;
  readonly [_height]: number;
  readonly [_localBounds]: Rectangle;
  readonly [_localBoundsID]: number;
  readonly [_localTransform]: Matrix2D;
  readonly [_localTransformID]: number;
  readonly [_mask]: DisplayObject | null;
  readonly [_maskedObject]: DisplayObject | null;
  readonly [_name]: string | null;
  readonly [_opaqueBackground]: number | null;
  readonly [_parent]: DisplayObjectContainer | null;
  readonly [_parentTransformID]: number;
  readonly [_root]: DisplayObjectContainer | null;
  readonly [_rotationAngle]: number;
  readonly [_rotationCosine]: number;
  readonly [_rotationSine]: number;
  readonly [_scale9Grid]: Rectangle | null;
  readonly [_scaleX]: number;
  readonly [_scaleY]: number;
  readonly [_scrollRect]: Rectangle | null;
  readonly [_shader]: Shader | null;
  readonly [_stage]: Stage | null;
  readonly [_transform]: Transform | null;
  readonly [_transformedBounds]: Rectangle;
  readonly [_width]: number;
  readonly [_worldTransform]: Matrix2D;
  readonly [_worldTransformID]: number;
  readonly [_visible]: boolean;
  readonly [_x]: number;
  readonly [_y]: number;
}

export const BitmapDrawableSymbols = {
  _alpha,
  _blendMode,
  _cacheAsBitmap,
  _cacheAsBitmapMatrix,
  _filters,
  _height,
  _localBounds,
  _localBoundsID,
  _localTransform,
  _localTransformID,
  _mask,
  _maskedObject,
  _name,
  _opaqueBackground,
  _parent,
  _parentTransformID,
  _root,
  _rotationAngle,
  _rotationCosine,
  _rotationSine,
  _scale9Grid,
  _scaleX,
  _scaleY,
  _scrollRect,
  _shader,
  _stage,
  _transform,
  _transformedBounds,
  _width,
  _worldTransform,
  _worldTransformID,
  _visible,
  _x,
  _y,
};

export default BitmapDrawable;
