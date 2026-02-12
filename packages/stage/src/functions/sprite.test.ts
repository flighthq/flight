import * as displayObjectFunctions from './displayObject.js';
import * as displayObjectContainerFunctions from './displayObjectContainer.js';
import * as functions from './sprite.js';

describe('sprite', () => {
  // Constructor

  it('can be instantiated', () => {
    const sprite = functions.create();
    // expect(sprite).toBeInstanceOf(Sprite);
  });

  // Inherited aliases

  it('forwards static methods', () => {
    expect(functions.addChild).toBe(displayObjectContainerFunctions.addChild);
    expect(functions.addChildAt).toBe(displayObjectContainerFunctions.addChildAt);
    expect(functions.getBounds).toBe(displayObjectFunctions.getBounds);
    expect(functions.getRect).toBe(displayObjectFunctions.getRect);
    expect(functions.globalToLocal).toBe(displayObjectFunctions.globalToLocal);
    expect(functions.hitTestObject).toBe(displayObjectFunctions.hitTestObject);
    expect(functions.hitTestPoint).toBe(displayObjectFunctions.hitTestPoint);
    expect(functions.localToGlobal).toBe(displayObjectFunctions.localToGlobal);
    expect(functions.invalidate).toBe(displayObjectFunctions.invalidate);
    expect(functions.removeChild).toBe(displayObjectContainerFunctions.removeChild);
    expect(functions.removeChildAt).toBe(displayObjectContainerFunctions.removeChildAt);
    expect(functions.removeChildren).toBe(displayObjectContainerFunctions.removeChildren);
    expect(functions.setChildIndex).toBe(displayObjectContainerFunctions.setChildIndex);
    expect(functions.swapChildren).toBe(displayObjectContainerFunctions.swapChildren);
    expect(functions.swapChildrenAt).toBe(displayObjectContainerFunctions.swapChildrenAt);
  });
});
