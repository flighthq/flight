import type { ImageResource } from '@flighthq/types';

import { uploadGlTextureData, uploadGlTextureElement, uploadGlTextureImageResource } from './glTextureUpload';

// The GL enums the primitives read; texImage2D is a spy so a test can assert which overload was driven.
function makeGl(): WebGL2RenderingContext {
  return {
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_2D: 0x0de1,
    texImage2D: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

describe('uploadGlTextureData', () => {
  it('drives the raw-pixel overload with width/height/border and the data buffer', () => {
    const gl = makeGl();
    const data = new Uint8ClampedArray(2 * 2 * 4);
    uploadGlTextureData(gl, gl.TEXTURE_2D, 2, 2, data);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  });
});

describe('uploadGlTextureElement', () => {
  it('drives the element overload with the TexImageSource', () => {
    const gl = makeGl();
    const source = {} as TexImageSource;
    uploadGlTextureElement(gl, gl.TEXTURE_2D, source);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  });
});

describe('uploadGlTextureImageResource', () => {
  it('takes the element path when the resource carries a source', () => {
    const gl = makeGl();
    const source = {} as TexImageSource;
    const image = { source, data: null, width: 4, height: 4 } as ImageResource;
    uploadGlTextureImageResource(gl, gl.TEXTURE_2D, image);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  });

  it('takes the raw-pixel path when the resource is data-only', () => {
    const gl = makeGl();
    const data = new Uint8ClampedArray(4 * 4 * 4);
    const image = { source: null, data, width: 4, height: 4 } as ImageResource;
    uploadGlTextureImageResource(gl, gl.TEXTURE_2D, image);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  });
});
