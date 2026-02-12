import DisplayObjectContainer from './DisplayObjectContainer.js';

describe('DisplayObjectContainer', () => {
  // Constructor

  it('can be instantiated', () => {
    const doc = new DisplayObjectContainer();
    expect(doc).toBeInstanceOf(DisplayObjectContainer);
  });
});
