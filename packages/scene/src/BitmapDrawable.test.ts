import { describe, expect, it } from 'vitest';

import BitmapDrawable, { BitmapDrawableSymbols } from './BitmapDrawable.js';
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

describe('BitmapDrawable module', () => {
  it('exports BitmapDrawableSymbols object', () => {
    expect(BitmapDrawableSymbols).toBeDefined();
    expect(typeof BitmapDrawableSymbols).toBe('object');
  });

  it('BitmapDrawableSymbols contains all expected keys', () => {
    const expectedKeys = [
      '_alpha',
      '_blendMode',
      '_cacheAsBitmap',
      '_cacheAsBitmapMatrix',
      '_filters',
      '_height',
      '_localBounds',
      '_localBoundsID',
      '_localTransform',
      '_localTransformID',
      '_mask',
      '_maskedObject',
      '_name',
      '_opaqueBackground',
      '_parent',
      '_parentTransformID',
      '_root',
      '_rotationAngle',
      '_rotationCosine',
      '_rotationSine',
      '_scale9Grid',
      '_scaleX',
      '_scaleY',
      '_scrollRect',
      '_shader',
      '_stage',
      '_transform',
      '_transformedBounds',
      '_width',
      '_worldTransform',
      '_worldTransformID',
      '_visible',
      '_x',
      '_y',
    ];

    expect(Object.keys(BitmapDrawableSymbols).sort()).toEqual(expectedKeys.sort());
  });

  it('BitmapDrawableSymbols values match the imported symbols', () => {
    expect(BitmapDrawableSymbols._alpha).toBe(_alpha);
    expect(BitmapDrawableSymbols._blendMode).toBe(_blendMode);
    expect(BitmapDrawableSymbols._cacheAsBitmap).toBe(_cacheAsBitmap);
    expect(BitmapDrawableSymbols._cacheAsBitmapMatrix).toBe(_cacheAsBitmapMatrix);
    expect(BitmapDrawableSymbols._filters).toBe(_filters);
    expect(BitmapDrawableSymbols._height).toBe(_height);
    expect(BitmapDrawableSymbols._localBounds).toBe(_localBounds);
    expect(BitmapDrawableSymbols._localBoundsID).toBe(_localBoundsID);
    expect(BitmapDrawableSymbols._localTransform).toBe(_localTransform);
    expect(BitmapDrawableSymbols._localTransformID).toBe(_localTransformID);
    expect(BitmapDrawableSymbols._mask).toBe(_mask);
    expect(BitmapDrawableSymbols._maskedObject).toBe(_maskedObject);
    expect(BitmapDrawableSymbols._name).toBe(_name);
    expect(BitmapDrawableSymbols._opaqueBackground).toBe(_opaqueBackground);
    expect(BitmapDrawableSymbols._parent).toBe(_parent);
    expect(BitmapDrawableSymbols._parentTransformID).toBe(_parentTransformID);
    expect(BitmapDrawableSymbols._root).toBe(_root);
    expect(BitmapDrawableSymbols._rotationAngle).toBe(_rotationAngle);
    expect(BitmapDrawableSymbols._rotationCosine).toBe(_rotationCosine);
    expect(BitmapDrawableSymbols._rotationSine).toBe(_rotationSine);
    expect(BitmapDrawableSymbols._scale9Grid).toBe(_scale9Grid);
    expect(BitmapDrawableSymbols._scaleX).toBe(_scaleX);
    expect(BitmapDrawableSymbols._scaleY).toBe(_scaleY);
    expect(BitmapDrawableSymbols._scrollRect).toBe(_scrollRect);
    expect(BitmapDrawableSymbols._shader).toBe(_shader);
    expect(BitmapDrawableSymbols._stage).toBe(_stage);
    expect(BitmapDrawableSymbols._transform).toBe(_transform);
    expect(BitmapDrawableSymbols._transformedBounds).toBe(_transformedBounds);
    expect(BitmapDrawableSymbols._width).toBe(_width);
    expect(BitmapDrawableSymbols._worldTransform).toBe(_worldTransform);
    expect(BitmapDrawableSymbols._worldTransformID).toBe(_worldTransformID);
    expect(BitmapDrawableSymbols._visible).toBe(_visible);
    expect(BitmapDrawableSymbols._x).toBe(_x);
    expect(BitmapDrawableSymbols._y).toBe(_y);
  });

  it('all BitmapDrawable symbols are unique', () => {
    const values = Object.values(BitmapDrawableSymbols);
    const unique = new Set(values);

    expect(unique.size).toBe(values.length);
  });

  it('symbols can be used as computed property keys', () => {
    const obj: any = {}; // eslint-disable-line

    obj[_x] = 10;
    obj[_y] = 20;
    obj[_visible] = true;

    expect(obj[_x]).toBe(10);
    expect(obj[_y]).toBe(20);
    expect(obj[_visible]).toBe(true);
  });
});
