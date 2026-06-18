import {
  cloneImageSource,
  createImageSource,
  disposeImageSource,
  hasImageSourceElement,
  invalidateImageSource,
  isImageSourceEmpty,
  setImageSourceElement,
} from './imageSource';

describe('cloneImageSource', () => {
  it('copies fields, shares the element, and gives an independent identity', () => {
    const element = { width: 4, height: 5 } as HTMLImageElement;
    const source = createImageSource(element);
    source.version = 3;

    const copy = cloneImageSource(source);

    expect(copy).not.toBe(source);
    expect(copy.src).toBe(element);
    expect(copy.width).toStrictEqual(4);
    expect(copy.height).toStrictEqual(5);
    expect(copy.version).toStrictEqual(3);

    copy.version++;
    expect(source.version).toStrictEqual(3);
  });
});

describe('createImageSource', () => {
  it('returns an object', () => {
    const source = createImageSource();
    expect(source).not.toBeNull();
  });

  it('sets src, width and height if you pass in a src element', () => {
    const element = { width: 100, height: 100 } as HTMLImageElement;
    const source = createImageSource(element);
    expect(source.src).toStrictEqual(element);
    expect(source.width).toStrictEqual(element.width);
    expect(source.height).toStrictEqual(element.height);
  });

  it('starts at version 0', () => {
    expect(createImageSource().version).toBe(0);
  });
});

describe('disposeImageSource', () => {
  it('releases the element and marks the resource changed', () => {
    const source = createImageSource({ width: 4, height: 5 } as HTMLImageElement);
    const before = source.version;

    disposeImageSource(source);

    expect(source.src).toBeNull();
    expect(source.version).toStrictEqual(before + 1);
  });
});

describe('hasImageSourceElement', () => {
  it('is false without an element and true with one', () => {
    expect(hasImageSourceElement(createImageSource())).toStrictEqual(false);
    expect(hasImageSourceElement(createImageSource({ width: 1, height: 1 } as HTMLImageElement))).toStrictEqual(true);
  });
});

describe('invalidateImageSource', () => {
  it('increments the version', () => {
    const source = createImageSource();
    invalidateImageSource(source);
    expect(source.version).toBe(1);
    invalidateImageSource(source);
    expect(source.version).toBe(2);
  });

  it('wraps around with >>> 0', () => {
    const source = createImageSource();
    source.version = 0xffffffff;
    invalidateImageSource(source);
    expect(source.version).toBe(0);
  });
});

describe('isImageSourceEmpty', () => {
  it('is true with no dimensions and false once sized', () => {
    expect(isImageSourceEmpty(createImageSource())).toStrictEqual(true);
    expect(isImageSourceEmpty(createImageSource({ width: 2, height: 2 } as HTMLImageElement))).toStrictEqual(false);
  });
});

describe('setImageSourceElement', () => {
  it('swaps the element, re-reads dimensions, and marks the resource changed', () => {
    const source = createImageSource();
    const before = source.version;
    const element = { width: 8, height: 6 } as HTMLImageElement;

    setImageSourceElement(source, element);

    expect(source.src).toBe(element);
    expect(source.width).toStrictEqual(8);
    expect(source.height).toStrictEqual(6);
    expect(source.version).toStrictEqual(before + 1);
  });

  it('clears the element when passed null', () => {
    const source = createImageSource({ width: 8, height: 6 } as HTMLImageElement);

    setImageSourceElement(source, null);

    expect(source.src).toBeNull();
  });
});
