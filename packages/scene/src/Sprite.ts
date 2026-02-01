import type BitmapDrawable from './BitmapDrawable.js';
import DisplayObject from './DisplayObject.js';
import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Sprite extends DisplayObjectContainer implements BitmapDrawable {
  constructor() {
    super();
  }

  // Inherited Aliases

  /** @inheritdoc */
  static override addChild = DisplayObjectContainer.addChild;

  /** @inheritdoc */
  static override addChildAt = DisplayObjectContainer.addChildAt;

  /** @inheritdoc */
  static override getBounds = DisplayObject.getBounds;

  /** @inheritdoc */
  static override getBoundsTo = DisplayObject.getBoundsTo;

  /** @inheritdoc */
  static override getRect = DisplayObject.getRect;

  /** @inheritdoc */
  static override getRectTo = DisplayObject.getRectTo;

  /** @inheritdoc */
  static override globalToLocal = DisplayObject.globalToLocal;

  /** @inheritdoc */
  static override globalToLocalTo = DisplayObject.globalToLocalTo;

  /** @inheritdoc */
  static override localToGlobal = DisplayObject.localToGlobal;

  /** @inheritdoc */
  static override localToGlobalTo = DisplayObject.localToGlobalTo;

  /** @inheritdoc */
  static override hitTestObject = DisplayObject.hitTestObject;

  /** @inheritdoc */
  static override hitTestPoint = DisplayObject.hitTestPoint;

  /** @inheritdoc */
  static override invalidate = DisplayObject.invalidate;

  /** @inheritdoc */
  static override removeChild = DisplayObjectContainer.removeChild;

  /** @inheritdoc */
  static override removeChildAt = DisplayObjectContainer.removeChildAt;

  /** @inheritdoc */
  static override removeChildren = DisplayObjectContainer.removeChildren;

  /** @inheritdoc */
  static override setChildIndex = DisplayObjectContainer.setChildIndex;

  /** @inheritdoc */
  static override swapChildren = DisplayObjectContainer.swapChildren;

  /** @inheritdoc */
  static override swapChildrenAt = DisplayObjectContainer.swapChildrenAt;
}
