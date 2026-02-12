import { Rectangle, Vector2 } from '@flighthq/math';
import type {
  Affine2D,
  BitmapFilter,
  BlendMode,
  DisplayObject as DisplayObjectLike,
  DisplayObjectContainer,
  LoaderInfo,
  Shader,
  Transform,
  Vector2 as Vector2Like,
} from '@flighthq/types';
import { DirtyFlags, DisplayObjectSymbols as $ } from '@flighthq/types';

import * as functions from '../functions/displayObject.js';
import type Stage from './Stage.js';

export default class DisplayObject implements DisplayObjectLike {
  [$.alpha]!: number;
  [$.blendMode]!: BlendMode;
  [$.bounds]!: Rectangle;
  [$.cacheAsBitmap]!: boolean;
  [$.cacheAsBitmapMatrix]!: Affine2D | null;
  [$.children]!: DisplayObjectLike[] | null;
  [$.dirtyFlags]!: DirtyFlags;
  [$.filters]!: BitmapFilter[] | null;
  [$.height]!: number;
  [$.loaderInfo]!: LoaderInfo | null;
  [$.localBounds]!: Rectangle;
  [$.localBoundsID]!: number;
  [$.localTransform]!: Affine2D;
  [$.localTransformID]!: number;
  [$.mask]!: DisplayObjectLike | null;
  [$.maskedObject]!: DisplayObjectLike | null;
  [$.name]!: string | null;
  [$.opaqueBackground]!: number | null;
  [$.parent]!: DisplayObjectContainer | null;
  [$.parentTransformID]!: number;
  [$.root]!: DisplayObjectContainer | null;
  [$.rotationAngle]!: number;
  [$.rotationCosine]!: number;
  [$.rotationSine]!: number;
  [$.scale9Grid]!: Rectangle | null;
  [$.scaleX]!: number;
  [$.scaleY]!: number;
  [$.scrollRect]!: Rectangle | null;
  [$.shader]!: Shader | null;
  [$.stage]!: Stage | null;
  [$.transform]!: Transform | null;
  [$.width]!: number;
  [$.worldBounds]!: Rectangle;
  [$.worldTransform]!: Affine2D;
  [$.worldTransformID]!: number;
  [$.visible]!: boolean;
  [$.x]!: number;
  [$.y]!: number;

  constructor() {
    functions.create(this);
  }

  /**
   * Returns a rectangle that defines the area of the display object relative
   * to the coordinate system of the `targetCoordinateSpace` object.
   *
   * Returns a new Rectangle()
   **/
  getBounds(targetCoordinateSpace: DisplayObject | null): Rectangle {
    const out = new Rectangle();
    functions.getBounds(out, this, targetCoordinateSpace);
    return out;
  }

  /**
   * Returns a rectangle that defines the boundary of the display object, based
   * on the coordinate system defined by the `targetCoordinateSpace`
   * parameter, excluding any strokes on shapes. The values that the
   * `getRect()` method returns are the same or smaller than those
   * returned by the `getBounds()` method.
   *
   * Returns a new Rectangle()
   **/
  getRect(targetCoordinateSpace: DisplayObject | null | undefined): Rectangle {
    const out = new Rectangle();
    functions.getRect(out, this, targetCoordinateSpace);
    return out;
  }

  /**
   * Converts the `point` object from the Stage (global) coordinates
   * to the display object's (local) coordinates.
   **/
  globalToLocal(pos: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    functions.globalToLocal(out, this, pos);
    return out;
  }

  /**
   * Evaluates the bounding box of the display object to see if it overlaps or
   * intersects with the bounding box of the `obj` display object.
   **/
  hitTestObject(other: DisplayObject): boolean {
    return functions.hitTestObject(this, other);
  }

  /**
		Evaluates the display object to see if it overlaps or intersects with the
		point specified by the `x` and `y` parameters in world coordinates.

    @param shapeFlag Whether to check against the actual pixels of the object
						(`true`) or the bounding box
						(`false`).
	**/
  hitTestPoint(x: number, y: number, _shapeFlag: boolean = false): boolean {
    return functions.hitTestPoint(this, x, y, _shapeFlag);
  }

  /**
   * Calling `invalidate()` signals that the current object has changed and
   * should be redrawn the next time it is eligible to be rendered.
   */
  invalidate(flags: DirtyFlags = DirtyFlags.Render): void {
    functions.invalidate(this, flags);
  }

  /**
   * Converts the `point` object from the display object's (local)
   * coordinates to world coordinates.
   **/
  localToGlobal(point: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    functions.localToGlobal(out, this, point);
    return out;
  }

  // Get & Set Methods

  get alpha(): number {
    return functions.getAlpha(this);
  }

  set alpha(value: number) {
    functions.setAlpha(this, value);
  }

  get blendMode(): BlendMode {
    return functions.getBlendMode(this);
  }

  set blendMode(value: BlendMode) {
    functions.setBlendMode(this, value);
  }

  get cacheAsBitmap(): boolean {
    return functions.getCacheAsBitmap(this);
  }

  set cacheAsBitmap(value: boolean) {
    functions.setCacheAsBitmap(this, value);
  }

  get cacheAsBitmapMatrix(): Affine2D | null {
    return functions.getCacheAsBitmapMatrix(this);
  }

  set cacheAsBitmapMatrix(value: Affine2D | null) {
    functions.setCacheAsBitmapMatrix(this, value);
  }

  get filters(): BitmapFilter[] {
    return functions.getFilters(this);
  }

  set filters(value: BitmapFilter[] | null) {
    functions.setFilters(this, value);
  }

  get height(): number {
    return functions.getHeight(this);
  }

  set height(value: number) {
    functions.setHeight(this, value);
  }

  get loaderInfo(): LoaderInfo | null {
    return functions.getLoaderInfo(this);
  }

  get mask(): DisplayObjectLike | null {
    return functions.getMask(this);
  }

  set mask(value: DisplayObject | null) {
    functions.setMask(this, value);
  }

  get name(): string | null {
    return functions.getName(this);
  }

  set name(value: string | null) {
    functions.setName(this, value);
  }

  get opaqueBackground(): number | null {
    return functions.getOpaqueBackground(this);
  }

  set opaqueBackground(value: number | null) {
    functions.setOpaqueBackground(this, value);
  }

  get parent(): DisplayObjectContainer | null {
    return functions.getParent(this);
  }

  get root(): DisplayObjectContainer | null {
    return functions.getRoot(this);
  }

  get rotation(): number {
    return functions.getRotation(this);
  }

  set rotation(value: number) {
    functions.setRotation(this, value);
  }

  get scale9Grid(): Rectangle | null {
    return functions.getScale9Grid(this);
  }

  set scroll9Grid(value: Rectangle | null) {
    functions.setScale9Grid(this, value);
  }

  get scaleX(): number {
    return functions.getScaleX(this);
  }

  set scaleX(value: number) {
    functions.setScaleX(this, value);
  }

  get scaleY(): number {
    return functions.getScaleY(this);
  }

  set scaleY(value: number) {
    functions.setScaleY(this, value);
  }

  get scrollRect(): Rectangle | null {
    return functions.getScrollRect(this);
  }

  set scrollRect(value: Rectangle | null) {
    functions.setScrollRect(this, value);
  }

  get shader(): Shader | null {
    return functions.getShader(this);
  }

  set shader(value: Shader | null) {
    functions.setShader(this, value);
  }

  get stage(): Stage | null {
    return functions.getStage(this) as Stage;
  }

  get transform(): Transform {
    return functions.getTransform(this);
  }

  set transform(value: Transform) {
    functions.setTransform(this, value);
  }

  get visible(): boolean {
    return functions.getVisible(this);
  }

  set visible(value: boolean) {
    functions.setVisible(this, value);
  }

  get width(): number {
    return functions.getWidth(this);
  }

  set width(value: number) {
    functions.setWidth(this, value);
  }

  get x(): number {
    return functions.getX(this);
  }

  set x(value: number) {
    functions.setX(this, value);
  }

  get y(): number {
    return functions.getY(this);
  }

  set y(value: number) {
    functions.setY(this, value);
  }
}
