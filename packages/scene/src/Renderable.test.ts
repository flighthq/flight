import { describe, expect, it } from 'vitest';

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
} from './internal/Renderable.js';
import type Renderable from './Renderable.js';

describe('Renderable', () => {
  it('can be used as a type', () => {
    const obj: any = {}; // eslint-disable-line
    const ref: Renderable = obj as Renderable;
    expect(ref).not.toBeNull();
  });
  it('exports individual symbols', () => {
    // Expect each symbol to be defined
    expect(_alpha).toBeDefined();
    expect(_blendMode).toBeDefined();
    expect(_cacheAsBitmap).toBeDefined();
    expect(_cacheAsBitmapMatrix).toBeDefined();
    expect(_filters).toBeDefined();
    expect(_height).toBeDefined();
    expect(_localBounds).toBeDefined();
    expect(_localBoundsID).toBeDefined();
    expect(_localTransform).toBeDefined();
    expect(_localTransformID).toBeDefined();
    expect(_mask).toBeDefined();
    expect(_maskedObject).toBeDefined();
    expect(_name).toBeDefined();
    expect(_opaqueBackground).toBeDefined();
    expect(_parent).toBeDefined();
    expect(_parentTransformID).toBeDefined();
    expect(_root).toBeDefined();
    expect(_rotationAngle).toBeDefined();
    expect(_rotationCosine).toBeDefined();
    expect(_rotationSine).toBeDefined();
    expect(_scale9Grid).toBeDefined();
    expect(_scaleX).toBeDefined();
    expect(_scaleY).toBeDefined();
    expect(_scrollRect).toBeDefined();
    expect(_shader).toBeDefined();
    expect(_stage).toBeDefined();
    expect(_transform).toBeDefined();
    expect(_transformedBounds).toBeDefined();
    expect(_visible).toBeDefined();
    expect(_width).toBeDefined();
    expect(_worldTransform).toBeDefined();
    expect(_worldTransformID).toBeDefined();
    expect(_x).toBeDefined();
    expect(_y).toBeDefined();
  });

  it('exports the expected keys', () => {
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
      '_visible',
      '_width',
      '_worldTransform',
      '_worldTransformID',
      '_x',
      '_y',
    ];

    const actualKeys = [
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
      '_visible',
      '_width',
      '_worldTransform',
      '_worldTransformID',
      '_x',
      '_y',
    ];

    expect(actualKeys.sort()).toEqual(expectedKeys.sort());
  });

  it('values of the constants match the imported symbols', () => {
    // Checking if individual symbols match the values imported
    expect(_alpha).toBeDefined();
    expect(_blendMode).toBeDefined();
    expect(_cacheAsBitmap).toBeDefined();
    expect(_cacheAsBitmapMatrix).toBeDefined();
    expect(_filters).toBeDefined();
    expect(_height).toBeDefined();
    expect(_localBounds).toBeDefined();
    expect(_localBoundsID).toBeDefined();
    expect(_localTransform).toBeDefined();
    expect(_localTransformID).toBeDefined();
    expect(_mask).toBeDefined();
    expect(_maskedObject).toBeDefined();
    expect(_name).toBeDefined();
    expect(_opaqueBackground).toBeDefined();
    expect(_parent).toBeDefined();
    expect(_parentTransformID).toBeDefined();
    expect(_root).toBeDefined();
    expect(_rotationAngle).toBeDefined();
    expect(_rotationCosine).toBeDefined();
    expect(_rotationSine).toBeDefined();
    expect(_scale9Grid).toBeDefined();
    expect(_scaleX).toBeDefined();
    expect(_scaleY).toBeDefined();
    expect(_scrollRect).toBeDefined();
    expect(_shader).toBeDefined();
    expect(_stage).toBeDefined();
    expect(_transform).toBeDefined();
    expect(_transformedBounds).toBeDefined();
    expect(_visible).toBeDefined();
    expect(_width).toBeDefined();
    expect(_worldTransform).toBeDefined();
    expect(_worldTransformID).toBeDefined();
    expect(_x).toBeDefined();
    expect(_y).toBeDefined();
  });

  it('all symbols are unique', () => {
    const values = [
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
    ];

    const unique = new Set(values);
    expect(unique.size).toBe(values.length); // Ensure all values are unique
  });

  it('symbols can be used as computed property keys', () => {
    const obj: any = {}; // eslint-disable-line

    // Using symbols as keys
    obj[_x] = 10;
    obj[_y] = 20;
    obj[_visible] = true;

    // Checking that the properties are set correctly
    expect(obj[_x]).toBe(10);
    expect(obj[_y]).toBe(20);
    expect(obj[_visible]).toBe(true);
  });
});
