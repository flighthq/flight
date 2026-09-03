import type { ImageResource } from '@flighthq/types/contract';

import { uploadGlTextureVideoFrame } from './glTextureVideoUpload';

function makeGl(): WebGL2RenderingContext {
  return {
    RGBA: 0x1908,
    SRGB8_ALPHA8: 0x8c43,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_2D: 0x0de1,
    texImage2D: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

// A video ImageResource whose only relevant fields are version and the borrowed host element.
function makeVideoImage(version: number, readyState = 4, videoWidth = 320, videoHeight = 240): ImageResource {
  return {
    source: { readyState, videoWidth, videoHeight } as unknown as HTMLVideoElement,
    version,
  } as unknown as ImageResource;
}

describe('uploadGlTextureVideoFrame', () => {
  it('uploads the element and returns the new frame id when the frame advanced', () => {
    const gl = makeGl();
    const image = makeVideoImage(3);
    const uploaded = uploadGlTextureVideoFrame(gl, image, -1);
    expect(uploaded).toBe(3);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image.source);
  });

  it('threads an explicit sRGB internal format to the video upload', () => {
    const gl = makeGl();
    const image = makeVideoImage(3);
    uploadGlTextureVideoFrame(gl, image, -1, gl.SRGB8_ALPHA8);
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.SRGB8_ALPHA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image.source,
    );
  });

  it('skips the upload and returns the same id when the frame has not advanced', () => {
    const gl = makeGl();
    const image = makeVideoImage(5);
    const uploaded = uploadGlTextureVideoFrame(gl, image, 5);
    expect(uploaded).toBe(5);
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('skips and reports no upload when the element has no decoded frame yet', () => {
    const gl = makeGl();
    const image = makeVideoImage(1, 1, 0, 0);
    const uploaded = uploadGlTextureVideoFrame(gl, image, -1);
    expect(uploaded).toBe(-1);
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('skips when the element is null', () => {
    const gl = makeGl();
    const image = { source: null, version: 2 } as unknown as ImageResource;
    expect(uploadGlTextureVideoFrame(gl, image, -1)).toBe(-1);
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });
});
