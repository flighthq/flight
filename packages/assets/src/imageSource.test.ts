import { createImageSource } from './imageSource';

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
});
