import type { VideoTexture } from '@flighthq/types';

import { uploadGlTextureVideoFrame } from './glTextureVideoUpload';

function makeGl(): WebGL2RenderingContext {
  return {
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_2D: 0x0de1,
    texImage2D: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

// A VideoTexture whose only relevant fields are frameId and the element carrier.
function makeVideoTexture(frameId: number, readyState = 4, videoWidth = 320, videoHeight = 240): VideoTexture {
  return {
    frameId,
    source: { element: { readyState, videoWidth, videoHeight } as unknown as HTMLVideoElement },
  } as unknown as VideoTexture;
}

describe('uploadGlTextureVideoFrame', () => {
  it('uploads the element and returns the new frame id when the frame advanced', () => {
    const gl = makeGl();
    const vt = makeVideoTexture(3);
    const uploaded = uploadGlTextureVideoFrame(gl, vt, -1);
    expect(uploaded).toBe(3);
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vt.source.element);
  });

  it('skips the upload and returns the same id when the frame has not advanced', () => {
    const gl = makeGl();
    const vt = makeVideoTexture(5);
    const uploaded = uploadGlTextureVideoFrame(gl, vt, 5);
    expect(uploaded).toBe(5);
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('skips and reports no upload when the element has no decoded frame yet', () => {
    const gl = makeGl();
    const vt = makeVideoTexture(1, 1, 0, 0);
    const uploaded = uploadGlTextureVideoFrame(gl, vt, -1);
    expect(uploaded).toBe(-1);
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });

  it('skips when the element is null', () => {
    const gl = makeGl();
    const vt = { frameId: 2, source: { element: null } } as unknown as VideoTexture;
    expect(uploadGlTextureVideoFrame(gl, vt, -1)).toBe(-1);
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });
});
