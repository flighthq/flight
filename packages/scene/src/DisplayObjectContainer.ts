import { DirtyFlags } from './DirtyFlags';
import DisplayObject from './DisplayObject';

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
    } else if (child.stage == child) {
      throw new TypeError('Error #3783: A Stage object cannot be added as the child of another object.');
    } else if (index > target.__children.length || index < 0) {
      throw 'Invalid index position ' + index;
    }

    if (child.parent == target) {
      const i = target.__children.indexOf(child);
      if (i !== -1) {
        target.__children.splice(i, 1);
      }
    } else {
      if (child.parent !== null) {
        this.removeChild(child.parent, child);
      }
    }

    target.__children.splice(index, 0, child);
    child.__parent = target;
    DisplayObject.invalidate(target, DirtyFlags.Children);
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
    if (child !== null && child.parent === target) {
      if (target.__stage !== null) {
        // if (child.__stage !== null && target.__stage.focus == child)
        // {
        // 	stage.focus = null;
        // }
      }

      child.__parent = null;
      const i = target.__children.indexOf(child);
      if (i !== -1) {
        target.__children.splice(i, 1);
      }
      DisplayObject.invalidate(child, DirtyFlags.Transform | DirtyFlags.Render);
      DisplayObject.invalidate(target, DirtyFlags.Children);
    }
    return child;
  }

  // Get & Set Methods

  get numChildren() {
    return this.__children.length;
  }
}
