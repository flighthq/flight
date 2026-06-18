import { createImageSource, invalidateImageSource } from './imageSource';

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
