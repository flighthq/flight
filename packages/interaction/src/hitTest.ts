import { matrix3x2, rectangle, rectanglePool } from '@flighthq/math';
import { calculateBoundsRect, getLocalBoundsRect } from '@flighthq/stage/bounds';
import { getWorldTransform } from '@flighthq/stage/transform';
import type { DisplayObject } from '@flighthq/types';

/**
 * Returns an array of objects that lie under the specified point (in world
 * coordinates and are children (or grandchildren, and so on) of the source
 * instance.
 **/
// export function getObjectsUnderPoint(out: DisplayObject[], source: Readonly<DisplayObject>, point: Vector2): void {
//   var stack = new Array<DisplayObject>();
//   __hitTest(point.x, point.y, false, stack, false, this);
//   stack.reverse();
//   return stack;
// }

// // function do hitTest () {
// //   @:noCompletion private function __hitTest(x:Float, y:Float, shapeFlag:Bool, stack:Array<DisplayObject>, interactiveOnly:Bool, hitObject:DisplayObject):Bool
// // 	{
// // 		if (__graphics != null)
// // 		{
// // 			if (!hitObject.__visible || __isMask) return false;
// // 			if (mask != null && !mask.__hitTestMask(x, y)) return false;

// // 			if (__graphics.__hitTest(x, y, shapeFlag, __getRenderTransform()))
// // 			{
// // 				if (stack != null && !interactiveOnly)
// // 				{
// // 					stack.push(hitObject);
// // 				}

// // 				return true;
// // 			}
// // 		}

// // 		return false;
// // 	}
// // }

// // function doc hitTest() {
// //   @:noCompletion private override function __hitTest(x:Float, y:Float, shapeFlag:Bool, stack:Array<DisplayObject>, interactiveOnly:Bool,
// // 			hitObject:DisplayObject):Bool
// // 	{
// // 		if (!hitObject.visible || __isMask || (interactiveOnly && !mouseEnabled && !mouseChildren)) return false;
// // 		if (mask != null && !mask.__hitTestMask(x, y)) return false;

// // 		if (__scrollRect != null)
// // 		{
// // 			var point = Point.__pool.get();
// // 			point.setTo(x, y);
// // 			__getRenderTransform().__transformInversePoint(point);

// // 			if (!__scrollRect.containsPoint(point))
// // 			{
// // 				Point.__pool.release(point);
// // 				return false;
// // 			}

// // 			Point.__pool.release(point);
// // 		}

// // 		var i = __children.length;
// // 		if (interactiveOnly)
// // 		{
// // 			if (stack == null || !mouseChildren)
// // 			{
// // 				while (--i >= 0)
// // 				{
// // 					if (__children[i].__hitTest(x, y, shapeFlag, null, true, cast __children[i]))
// // 					{
// // 						if (stack != null)
// // 						{
// // 							stack.push(hitObject);
// // 						}

// // 						return true;
// // 					}
// // 				}
// // 			}
// // 			else if (stack != null)
// // 			{
// // 				var length = stack.length;

// // 				var interactive = false;
// // 				var hitTest = false;

// // 				while (--i >= 0)
// // 				{
// // 					interactive = __children[i].__getInteractive(null);

// // 					if (interactive || (mouseEnabled && !hitTest))
// // 					{
// // 						if (__children[i].__hitTest(x, y, shapeFlag, stack, true, cast __children[i]))
// // 						{
// // 							hitTest = true;

// // 							if (interactive && stack.length > length)
// // 							{
// // 								break;
// // 							}
// // 						}
// // 					}
// // 				}

// // 				if (hitTest)
// // 				{
// // 					stack.insert(length, hitObject);
// // 					return true;
// // 				}
// // 			}
// // 		}
// // 		else
// // 		{
// // 			var hitTest = false;

// // 			while (--i >= 0)
// // 			{
// // 				if (__children[i].__hitTest(x, y, shapeFlag, stack, false, cast __children[i]))
// // 				{
// // 					hitTest = true;
// // 					if (stack == null) break;
// // 				}
// // 			}

// // 			return hitTest;
// // 		}

// // 		return false;
// // 	}
// // }

// // function io hitTest() {
// //   @:noCompletion private override function __hitTest(x:Float, y:Float, shapeFlag:Bool, stack:Array<DisplayObject>, interactiveOnly:Bool,
// // 			hitObject:DisplayObject):Bool
// // 	{
// // 		if (!hitObject.visible || __isMask || (interactiveOnly && !mouseEnabled)) return false;
// // 		return super.__hitTest(x, y, shapeFlag, stack, interactiveOnly, hitObject);
// // 	}
// // }

// // function sprite hitTest() {
// //   @:noCompletion private override function __hitTest(x:Float, y:Float, shapeFlag:Bool, stack:Array<DisplayObject>, interactiveOnly:Bool,
// // 			hitObject:DisplayObject):Bool
// // 	{
// // 		if (interactiveOnly && !mouseEnabled && !mouseChildren) return false;
// // 		if (!hitObject.visible || __isMask) return __hitTestHitArea(x, y, shapeFlag, stack, interactiveOnly, hitObject);
// // 		if (mask != null && !mask.__hitTestMask(x, y)) return __hitTestHitArea(x, y, shapeFlag, stack, interactiveOnly, hitObject);

// // 		if (__scrollRect != null)
// // 		{
// // 			var point = Point.__pool.get();
// // 			point.setTo(x, y);
// // 			__getRenderTransform().__transformInversePoint(point);

// // 			if (!__scrollRect.containsPoint(point))
// // 			{
// // 				Point.__pool.release(point);
// // 				return __hitTestHitArea(x, y, shapeFlag, stack, true, hitObject);
// // 			}

// // 			Point.__pool.release(point);
// // 		}

// // 		if (super.__hitTest(x, y, shapeFlag, stack, interactiveOnly, hitObject))
// // 		{
// // 			return (stack == null || interactiveOnly);
// // 		}
// // 		else if (hitArea == null && __graphics != null && __graphics.__hitTest(x, y, shapeFlag, __getRenderTransform()))
// // 		{
// // 			if (stack != null && (!interactiveOnly || mouseEnabled))
// // 			{
// // 				stack.push(hitObject);
// // 			}

// // 			return true;
// // 		}

// // 		return __hitTestHitArea(x, y, shapeFlag, stack, interactiveOnly, hitObject);
// // 	}
// // }

/**
 * Evaluates the bounding box of the display object to see if it overlaps or
 * intersects with the bounding box of the `obj` display object.
 **/
export function hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
  if (other.parent !== null && source.parent !== null) {
    const sourceBounds = getLocalBoundsRect(source);
    const otherBounds = rectanglePool.get();
    // compare other in source's coordinate space
    calculateBoundsRect(otherBounds, other, source);
    const result = rectangle.intersects(sourceBounds, otherBounds);
    rectanglePool.release(otherBounds);
    return result;
  }
  return false;
}

let _tempPoint = { x: 0, y: 0 };

/**
  Evaluates the display object to see if it overlaps or intersects with the
  point specified by the `x` and `y` parameters in world coordinates.

  @param shapeFlag Whether to check against the actual pixels of the object
          (`true`) or the bounding box
          (`false`).
**/
export function hitTestPoint(source: DisplayObject, x: number, y: number, _shapeFlag: boolean = false): boolean {
  if (!source.visible || source.opaqueBackground === null) return false;
  matrix3x2.inverseTransformPointXY(_tempPoint, getWorldTransform(source), x, y);
  return rectangle.contains(getLocalBoundsRect(source), _tempPoint.x, _tempPoint.y);
}
