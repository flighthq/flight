import { createImageSource } from '@flighthq/assets';
import { describe, expect, it } from 'vitest';

import { createImageData } from './imageData';
import {
  createImageDataFromCanvas,
  createImageDataFromImageSource,
  createImageSourceFromImageData,
} from './imageDataFrom';

describe('createImageDataFromCanvas', () => {
  it('returns ImageData matching the canvas size', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const data = createImageDataFromCanvas(canvas);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
  });

  it('returns an ImageData instance', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const data = createImageDataFromCanvas(canvas);
    expect(data).toBeInstanceOf(ImageData);
  });
});

describe('createImageDataFromImageSource', () => {
  it('returns ImageData matching the source dimensions', () => {
    const source = createImageSource();
    source.width = 4;
    source.height = 4;
    source.src = null;
    const data = createImageDataFromImageSource(source);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
  });
});

describe('createImageSourceFromImageData', () => {
  it('returns an ImageSource with matching dimensions', () => {
    const img = createImageData(4, 4, 0xff112233);
    const source = createImageSourceFromImageData(img);
    expect(source.width).toBe(4);
    expect(source.height).toBe(4);
    expect(source.src).not.toBeNull();
  });
});
