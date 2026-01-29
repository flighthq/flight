import DisplayObject from './DisplayObject.js';
import DisplayObjectContainer from './DisplayObjectContainer.js';
import Sprite from './Sprite.js';

describe('Sprite', () => {
  // Constructor

  it('can be instantiated', () => {
    const sprite = new Sprite();
    expect(sprite).toBeInstanceOf(Sprite);
  });

  // Inherited aliases

  it('forwards static methods', () => {
    expect(Sprite.addChild).toBe(DisplayObjectContainer.addChild);
    expect(Sprite.addChildAt).toBe(DisplayObjectContainer.addChildAt);
    expect(Sprite.getBounds).toBe(DisplayObject.getBounds);
    expect(Sprite.getBoundsTo).toBe(DisplayObject.getBoundsTo);
    expect(Sprite.getRect).toBe(DisplayObject.getRect);
    expect(Sprite.getRectTo).toBe(DisplayObject.getRectTo);
    expect(Sprite.globalToLocal).toBe(DisplayObject.globalToLocal);
    expect(Sprite.globalToLocalTo).toBe(DisplayObject.globalToLocalTo);
    expect(Sprite.hitTestObject).toBe(DisplayObject.hitTestObject);
    expect(Sprite.hitTestPoint).toBe(DisplayObject.hitTestPoint);
    expect(Sprite.localToGlobal).toBe(DisplayObject.localToGlobal);
    expect(Sprite.localToGlobalTo).toBe(DisplayObject.localToGlobalTo);
    expect(Sprite.invalidate).toBe(DisplayObject.invalidate);
    expect(Sprite.removeChild).toBe(DisplayObjectContainer.removeChild);
    expect(Sprite.removeChildAt).toBe(DisplayObjectContainer.removeChildAt);
    expect(Sprite.removeChildren).toBe(DisplayObjectContainer.removeChildren);
    expect(Sprite.setChildIndex).toBe(DisplayObjectContainer.setChildIndex);
    expect(Sprite.swapChildren).toBe(DisplayObjectContainer.swapChildren);
    expect(Sprite.swapChildrenAt).toBe(DisplayObjectContainer.swapChildrenAt);
  });
});
