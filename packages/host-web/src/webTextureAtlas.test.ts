import { getTextureSource } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import {
  createTextureAtlasFromCanvas,
  createTextureAtlasFromImageBitmap,
  createTextureAtlasFromImageElement,
} from './webTextureAtlas';

describe('createTextureAtlasFromCanvas', () => {
  it('wraps a canvas with correct dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const atlas = createTextureAtlasFromCanvas(canvas);

    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBe(canvas);
    expect(getTextureSource(atlas.texture!)?.width).toBe(320);
    expect(getTextureSource(atlas.texture!)?.height).toBe(240);
  });

  it('starts with an empty regions array', () => {
    const canvas = document.createElement('canvas');
    expect(createTextureAtlasFromCanvas(canvas).regions).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    const canvas = document.createElement('canvas');
    expect(createTextureAtlasFromCanvas(canvas)).not.toBe(createTextureAtlasFromCanvas(canvas));
  });
});

describe('createTextureAtlasFromImageBitmap', () => {
  it('wraps an ImageBitmap with correct dimensions', () => {
    const bitmap = { width: 64, height: 128, close: () => {} } as ImageBitmap;
    const atlas = createTextureAtlasFromImageBitmap(bitmap);

    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBe(bitmap);
    expect(getTextureSource(atlas.texture!)?.width).toBe(64);
    expect(getTextureSource(atlas.texture!)?.height).toBe(128);
  });

  it('returns a new object each call', () => {
    const bitmap = { width: 1, height: 1, close: () => {} } as ImageBitmap;
    expect(createTextureAtlasFromImageBitmap(bitmap)).not.toBe(createTextureAtlasFromImageBitmap(bitmap));
  });
});

describe('createTextureAtlasFromImageElement', () => {
  it('wraps an HTMLImageElement with correct dimensions', () => {
    const img = { width: 200, height: 100 } as HTMLImageElement;
    const atlas = createTextureAtlasFromImageElement(img);

    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBe(img);
    expect(getTextureSource(atlas.texture!)?.width).toBe(200);
    expect(getTextureSource(atlas.texture!)?.height).toBe(100);
  });

  it('returns a new object each call', () => {
    const img = document.createElement('img');
    expect(createTextureAtlasFromImageElement(img)).not.toBe(createTextureAtlasFromImageElement(img));
  });
});
