import DisplayObject from './DisplayObject.js';

describe('DisplayObject', () => {
  // Constructor

  it('can be instantiated', () => {
    const obj = new DisplayObject();
    expect(obj).toBeInstanceOf(DisplayObject);
  });
});
