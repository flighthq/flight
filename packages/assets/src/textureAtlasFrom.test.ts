import { imageSourceFromImageElement } from './imageSourceFrom';
import {
  textureAtlasFromCanvas,
  textureAtlasFromImageBitmap,
  textureAtlasFromImageElement,
  textureAtlasFromImageSource,
} from './textureAtlasFrom';

describe('textureAtlasFromCanvas', () => {
  it('wraps a canvas with correct dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const atlas = textureAtlasFromCanvas(canvas);

    expect(atlas.image?.src).toBe(canvas);
    expect(atlas.image?.width).toBe(320);
    expect(atlas.image?.height).toBe(240);
  });

  it('starts with an empty regions array', () => {
    const canvas = document.createElement('canvas');
    expect(textureAtlasFromCanvas(canvas).regions).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    const canvas = document.createElement('canvas');
    expect(textureAtlasFromCanvas(canvas)).not.toBe(textureAtlasFromCanvas(canvas));
  });
});

describe('textureAtlasFromImageBitmap', () => {
  it('wraps an ImageBitmap with correct dimensions', () => {
    const bitmap = { width: 64, height: 128, close: () => {} } as ImageBitmap;
    const atlas = textureAtlasFromImageBitmap(bitmap);

    expect(atlas.image?.src).toBe(bitmap);
    expect(atlas.image?.width).toBe(64);
    expect(atlas.image?.height).toBe(128);
  });

  it('returns a new object each call', () => {
    const bitmap = { width: 1, height: 1, close: () => {} } as ImageBitmap;
    expect(textureAtlasFromImageBitmap(bitmap)).not.toBe(textureAtlasFromImageBitmap(bitmap));
  });
});

describe('textureAtlasFromImageElement', () => {
  it('wraps an HTMLImageElement with correct dimensions', () => {
    const img = { width: 200, height: 100 } as HTMLImageElement;
    const atlas = textureAtlasFromImageElement(img);

    expect(atlas.image?.src).toBe(img);
    expect(atlas.image?.width).toBe(200);
    expect(atlas.image?.height).toBe(100);
  });

  it('returns a new object each call', () => {
    const img = document.createElement('img');
    expect(textureAtlasFromImageElement(img)).not.toBe(textureAtlasFromImageElement(img));
  });
});

describe('textureAtlasFromImageSource', () => {
  it('uses the provided ImageSource as the atlas image', () => {
    const source = imageSourceFromImageElement({ width: 128, height: 64 } as HTMLImageElement);
    const atlas = textureAtlasFromImageSource(source);

    expect(atlas.image).toBe(source);
    expect(atlas.image?.width).toBe(128);
    expect(atlas.image?.height).toBe(64);
  });

  it('starts with an empty regions array', () => {
    const source = imageSourceFromImageElement({ width: 1, height: 1 } as HTMLImageElement);
    expect(textureAtlasFromImageSource(source).regions).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    const source = imageSourceFromImageElement({ width: 1, height: 1 } as HTMLImageElement);
    expect(textureAtlasFromImageSource(source)).not.toBe(textureAtlasFromImageSource(source));
  });
});
