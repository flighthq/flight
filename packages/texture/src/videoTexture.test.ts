import { createMatrix3, createVector2 } from '@flighthq/geometry';
import type { VideoResource } from '@flighthq/types';

import {
  advanceVideoTexture,
  cloneVideoTexture,
  copyVideoTexture,
  createVideoTexture,
  getVideoTextureHeight,
  getVideoTextureInverseUvMatrix,
  getVideoTextureUvMatrix,
  getVideoTextureWidth,
  isVideoTextureFrameReady,
  resetVideoTextureFrame,
  setVideoTextureSource,
} from './videoTexture';

// A minimal element carrier: only the fields the VideoTexture accessors read.
function makeVideoResource(readyState = 4, videoWidth = 320, videoHeight = 240): VideoResource {
  return {
    element: { readyState, videoWidth, videoHeight } as unknown as HTMLVideoElement,
  };
}

describe('advanceVideoTexture', () => {
  it('bumps frameId and returns the new value', () => {
    const vt = createVideoTexture(makeVideoResource());
    expect(vt.frameId).toBe(-1);
    expect(advanceVideoTexture(vt)).toBe(0);
    expect(advanceVideoTexture(vt)).toBe(1);
    expect(vt.frameId).toBe(1);
  });
});

describe('cloneVideoTexture', () => {
  it('shares the source but deep-clones sampler and uv vectors and resets frameId', () => {
    const source = makeVideoResource();
    const vt = createVideoTexture(source, { uvOffset: createVector2(2, 3) });
    advanceVideoTexture(vt);
    const clone = cloneVideoTexture(vt);
    expect(clone.source).toBe(source);
    expect(clone.sampler).not.toBe(vt.sampler);
    expect(clone.uvOffset).not.toBe(vt.uvOffset);
    expect(clone.uvOffset.x).toBe(2);
    expect(clone.frameId).toBe(-1);
  });
});

describe('copyVideoTexture', () => {
  it('copies fields into out and is safe when out aliases source', () => {
    const a = createVideoTexture(makeVideoResource(), { colorSpace: 'linear', uvScale: createVector2(4, 5) });
    advanceVideoTexture(a);
    const b = createVideoTexture(makeVideoResource());
    copyVideoTexture(b, a);
    expect(b.colorSpace).toBe('linear');
    expect(b.frameId).toBe(0);
    expect(b.source).toBe(a.source);
    expect(b.uvScale.x).toBe(4);
    copyVideoTexture(a, a);
    expect(a.uvScale.x).toBe(4);
  });
});

describe('createVideoTexture', () => {
  it('defaults to srgb, identity uv-transform, and frameId -1', () => {
    const source = makeVideoResource();
    const vt = createVideoTexture(source);
    expect(vt.colorSpace).toBe('srgb');
    expect(vt.source).toBe(source);
    expect(vt.frameId).toBe(-1);
    expect(vt.uvOffset.x).toBe(0);
    expect(vt.uvScale.x).toBe(1);
    expect(vt.uvRotation).toBe(0);
  });
});

describe('getVideoTextureHeight', () => {
  it('returns the element videoHeight when a frame is decoded, else -1', () => {
    expect(getVideoTextureHeight(createVideoTexture(makeVideoResource(4, 320, 240)))).toBe(240);
    expect(getVideoTextureHeight(createVideoTexture(makeVideoResource(0, 0, 0)))).toBe(-1);
    expect(getVideoTextureHeight(createVideoTexture({ element: null }))).toBe(-1);
  });
});

describe('getVideoTextureInverseUvMatrix', () => {
  it('inverts the forward uv-transform', () => {
    const vt = createVideoTexture(makeVideoResource(), { uvScale: createVector2(2, 2), uvOffset: createVector2(1, 0) });
    const forward = createMatrix3();
    const inverse = createMatrix3();
    getVideoTextureUvMatrix(forward, vt);
    getVideoTextureInverseUvMatrix(inverse, vt);
    // forward * inverse should be identity: a point mapped forward then back returns to itself.
    const m = forward.m;
    const i = inverse.m;
    // (forward maps (0,0) -> (1,0); inverse must map (1,0) -> (0,0))
    const px = i[0] * 1 + i[3] * 0 + i[6];
    const py = i[1] * 1 + i[4] * 0 + i[7];
    expect(px).toBeCloseTo(0);
    expect(py).toBeCloseTo(0);
    expect(m[0]).toBe(2);
  });
});

describe('getVideoTextureUvMatrix', () => {
  it('composes scale, rotation, and offset in column-major layout', () => {
    const vt = createVideoTexture(makeVideoResource(), {
      uvScale: createVector2(2, 3),
      uvOffset: createVector2(5, 7),
    });
    const out = createMatrix3();
    getVideoTextureUvMatrix(out, vt);
    expect(out.m[0]).toBe(2);
    expect(out.m[4]).toBe(3);
    expect(out.m[6]).toBe(5);
    expect(out.m[7]).toBe(7);
    expect(out.m[8]).toBe(1);
  });
});

describe('getVideoTextureWidth', () => {
  it('returns the element videoWidth when a frame is decoded, else -1', () => {
    expect(getVideoTextureWidth(createVideoTexture(makeVideoResource(4, 320, 240)))).toBe(320);
    expect(getVideoTextureWidth(createVideoTexture(makeVideoResource(0, 0, 0)))).toBe(-1);
    expect(getVideoTextureWidth(createVideoTexture({ element: null }))).toBe(-1);
  });
});

describe('isVideoTextureFrameReady', () => {
  it('is true only when the element has a decoded frame with known dimensions', () => {
    expect(isVideoTextureFrameReady(createVideoTexture(makeVideoResource(4, 320, 240)))).toBe(true);
    expect(isVideoTextureFrameReady(createVideoTexture(makeVideoResource(1, 320, 240)))).toBe(false);
    expect(isVideoTextureFrameReady(createVideoTexture(makeVideoResource(4, 0, 0)))).toBe(false);
    expect(isVideoTextureFrameReady(createVideoTexture({ element: null }))).toBe(false);
  });
});

describe('resetVideoTextureFrame', () => {
  it('sets frameId back to -1', () => {
    const vt = createVideoTexture(makeVideoResource());
    advanceVideoTexture(vt);
    advanceVideoTexture(vt);
    resetVideoTextureFrame(vt);
    expect(vt.frameId).toBe(-1);
  });
});

describe('setVideoTextureSource', () => {
  it('swaps the source and resets frameId', () => {
    const vt = createVideoTexture(makeVideoResource());
    advanceVideoTexture(vt);
    const next = makeVideoResource(4, 640, 480);
    setVideoTextureSource(vt, next);
    expect(vt.source).toBe(next);
    expect(vt.frameId).toBe(-1);
    expect(getVideoTextureWidth(vt)).toBe(640);
  });
});
