import { DirtyFlags } from './DirtyFlags.js';
import DisplayObject from './DisplayObject.js';
import { _parent, _stage } from './internal/DisplayObject.js';

export default class DisplayObjectContainer extends DisplayObject {
  protected __children: DisplayObject[] = [];

  constructor() {
    super();
  }

  /**
   * Adds a child DisplayObject instance to this DisplayObjectContainer
   * instance. The child is added to the front (top) of all other children in
   * this DisplayObjectContainer instance.
   **/
  static addChild(target: DisplayObjectContainer, child: DisplayObject): DisplayObject {
    return this.addChildAt(target, child, target.numChildren);
  }

  /**
   * Adds a child DisplayObject instance to this DisplayObjectContainer
   * instance. The child is added at the index position specified. An index of
   * 0 represents the back (bottom) of the display list for this
   * DisplayObjectContainer object.
   **/
  static addChildAt(target: DisplayObjectContainer, child: DisplayObject, index: number): DisplayObject {
    if (child === null) {
      throw new TypeError('Error #2007: Parameter child must be non-null.');
    } else if (child === target) {
      throw new TypeError('Error #2024: An object cannot be added as a child of itself.');
    } else if (child[_stage] == child) {
      throw new TypeError('Error #3783: A Stage object cannot be added as the child of another object.');
    } else if (index > target.__children.length || index < 0) {
      throw 'Invalid index position ' + index;
    }

    if (child[_parent] == target) {
      const i = target.__children.indexOf(child);
      if (i !== -1) {
        target.__children.splice(i, 1);
      }
    } else {
      if (child[_parent] !== null) {
        this.removeChild(child[_parent], child);
      }
    }

    target.__children.splice(index, 0, child);
    child[_parent] = target;
    this.invalidate(target, DirtyFlags.Children);
    return child;
  }

  /**
   * Removes the specified `child` DisplayObject instance from the
   * child list of the DisplayObjectContainer instance. The `parent`
   * property of the removed child is set to `null` , and the object
   * is garbage collected if no other references to the child exist. The index
   * positions of any display objects above the child in the
   * DisplayObjectContainer are decreased by 1.
   **/
  static removeChild(target: DisplayObjectContainer, child: DisplayObject): DisplayObject {
    if (child !== null && child[_parent] === target) {
      if (target[_stage] !== null) {
        // if (child.__stage !== null && target.__stage.focus == child)
        // {
        // 	stage.focus = null;
        // }
      }

      child[_parent] = null;
      const i = target.__children.indexOf(child);
      if (i !== -1) {
        target.__children.splice(i, 1);
      }
      this.invalidate(child, DirtyFlags.Transform | DirtyFlags.Render);
      this.invalidate(target, DirtyFlags.Children);
    }
    return child;
  }

  /**
   * Removes a child DisplayObject from the specified `index`
   * position in the child list of the DisplayObjectContainer. The
   * `parent` property of the removed child is set to
   * `null`, and the object is garbage collected if no other
   * references to the child exist. The index positions of any display objects
   * above the child in the DisplayObjectContainer are decreased by 1.
   **/
  static removeChildAt(target: DisplayObjectContainer, index: number): DisplayObject | null {
    if (index >= 0 && index < target.__children.length) {
      return this.removeChild(target, target.__children[index]);
    }

    return null;
  }

  /**
   * Removes all `child` DisplayObject instances from the child list of the DisplayObjectContainer
   * instance. The `parent` property of the removed children is set to `null`, and the objects are
   * garbage collected if no other references to the children exist.
   **/
  static removeChildren(target: DisplayObjectContainer, beginIndex: number = 0, endIndex?: number): void {
    if (beginIndex > target.__children.length - 1) return;

    if (endIndex === undefined) {
      endIndex = target.__children.length - 1;
    }

    if (endIndex < beginIndex || beginIndex < 0 || endIndex > target.__children.length) {
      throw new RangeError('The supplied index is out of bounds.');
    }

    let numRemovals = endIndex - beginIndex;
    while (numRemovals >= 0) {
      this.removeChildAt(target, beginIndex);
      numRemovals--;
    }
  }

  /**
   * Changes the position of an existing child in the display object container.
   * This affects the layering of child objects.
   **/
  static setChildIndex(target: DisplayObjectContainer, child: DisplayObject, index: number): void {
    if (index >= 0 && index <= target.__children.length && child[_parent] === target) {
      const i = target.__children.indexOf(child);
      if (i !== -1) {
        target.__children.splice(i, 1);
        target.__children.splice(index, 0, child);
      }
    }
  }

  /**
   * Recursively stops the timeline execution of all MovieClips rooted at this object.
   **/
  // static stopAllMovieClips(): void {}

  /**
   * Swaps the z-order (front-to-back order) of the two specified child
   * objects. All other child objects in the display object container remain in
   * the same index positions.
   **/
  static swapChildren(target: DisplayObjectContainer, child1: DisplayObject, child2: DisplayObject): void {
    if (child1[_parent] == target && child2[_parent] == target) {
      const index1 = target.__children.indexOf(child1);
      const index2 = target.__children.indexOf(child2);

      target.__children[index1] = child2;
      target.__children[index2] = child1;

      this.invalidate(target, DirtyFlags.Children);
    }
  }

  /**
   * Swaps the z-order (front-to-back order) of the child objects at the two
   * specified index positions in the child list. All other child objects in
   * the display object container remain in the same index positions.
   **/
  static swapChildrenAt(target: DisplayObjectContainer, index1: number, index2: number): void {
    const len = target.__children.length;
    if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
      throw new RangeError('The supplied index is out of bounds.');
    }

    if (index1 === index2) return;

    const swap: DisplayObject = target.__children[index1];
    target.__children[index1] = target.__children[index2];
    target.__children[index2] = swap;
    this.invalidate(target, DirtyFlags.Children);
  }

  // Get & Set Methods

  get numChildren() {
    return this.__children.length;
  }

  // Inherited Aliases

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
}
