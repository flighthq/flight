import { createMatrix3, createVector2 } from '@flighthq/geometry/contract';
import type { Image, VideoResource } from '@flighthq/types/contract';

import { getTextureSource } from './texture';
import {
  advanceVideoTexture,
  cloneVideoTexture,
  copyVideoTexture,
  createVideoTexture,
  destroyVideoTexture,
  getVideoTextureHeight,
  getVideoTextureInverseUvMatrix,
  getVideoTextureUvMatrix,
  getVideoTextureWidth,
  isVideoTextureFrameReady,
  resetVideoTextureFrame,
  setVideoTextureSource,
} from './videoTexture';

// A minimal borrowed host element: only the fields the video-backed Texture accessors read.
function makeVideoResource(readyState = 4, videoWidth = 320, videoHeight = 240): VideoResource {
  return {
    element: { readyState, videoWidth, videoHeight } as unknown as HTMLVideoElement,
    objectUrl: null,
    ownsElement: false,
  };
}

describe('advanceVideoTexture', () => {
  it('bumps the source and Texture versions and returns the new value', () => {
    const vt = createVideoTexture(makeVideoResource());
    expect(vt.version).toBe(0xffffffff);
    expect(advanceVideoTexture(vt)).toBe(0);
    expect(advanceVideoTexture(vt)).toBe(1);
    expect(vt.version).toBe(1);
    expect(getTextureSource(vt)?.version).toBe(1);
  });
});

describe('cloneVideoTexture', () => {
  it('shares the source but deep-clones sampler and uv vectors', () => {
    const source = makeVideoResource();
    const vt = createVideoTexture(source, { uvOffset: createVector2(2, 3) });
    advanceVideoTexture(vt);
    const clone = cloneVideoTexture(vt);
    expect(getTextureSource(clone)).toBe(getTextureSource(vt));
    expect(clone.sampler).not.toBe(vt.sampler);
    expect(clone.uvOffset).not.toBe(vt.uvOffset);
    expect(clone.uvOffset.x).toBe(2);
    expect(clone.version).toBe(0);
  });
});

describe('copyVideoTexture', () => {
  it('copies fields into out and is safe when out aliases source', () => {
    const a = createVideoTexture(makeVideoResource(), { colorSpace: 'linear', uvScale: createVector2(4, 5) });
    advanceVideoTexture(a);
    const b = createVideoTexture(makeVideoResource());
    copyVideoTexture(b, a);
    expect(b.colorSpace).toBe('linear');
    expect(b.version).toBe(0);
    expect(getTextureSource(b)).toBe(getTextureSource(a));
    expect(b.uvScale.x).toBe(4);
    copyVideoTexture(a, a);
    expect(a.uvScale.x).toBe(4);
  });
});

describe('createVideoTexture', () => {
  it('returns a universal srgb Texture with a borrowed host-image source', () => {
    const source = makeVideoResource();
    const vt = createVideoTexture(source);
    expect(vt.colorSpace).toBe('srgb');
    expect((getTextureSource(vt) as Image).source).toBe(source.element);
    expect(vt.version).toBe(0xffffffff);
    expect(vt.uvOffset.x).toBe(0);
    expect(vt.uvScale.x).toBe(1);
    expect(vt.uvRotation).toBe(0);
  });
});

describe('destroyVideoTexture', () => {
  it('nulls the texture source and resets the version', () => {
    const vt = createVideoTexture(makeVideoResource());
    advanceVideoTexture(vt);
    expect(getTextureSource(vt)).not.toBeNull();
    destroyVideoTexture(vt);
    expect(getTextureSource(vt)).toBeNull();
    expect(vt.version).toBe(0xffffffff);
  });

  it('does not modify the borrowed video resource', () => {
    const resource = makeVideoResource();
    const element = resource.element;
    const vt = createVideoTexture(resource);
    destroyVideoTexture(vt);
    expect(resource.element).toBe(element);
  });

  it('is idempotent', () => {
    const vt = createVideoTexture(makeVideoResource());
    destroyVideoTexture(vt);
    destroyVideoTexture(vt);
    expect(getTextureSource(vt)).toBeNull();
  });

  it('makes subsequent accessor calls return sentinel values', () => {
    const vt = createVideoTexture(makeVideoResource());
    destroyVideoTexture(vt);
    expect(getVideoTextureWidth(vt)).toBe(-1);
    expect(getVideoTextureHeight(vt)).toBe(-1);
    expect(isVideoTextureFrameReady(vt)).toBe(false);
    expect(advanceVideoTexture(vt)).toBe(0xffffffff);
  });
});

describe('getVideoTextureHeight', () => {
  it('returns the element videoHeight when a frame is decoded, else -1', () => {
    expect(getVideoTextureHeight(createVideoTexture(makeVideoResource(4, 320, 240)))).toBe(240);
    expect(getVideoTextureHeight(createVideoTexture(makeVideoResource(0, 0, 0)))).toBe(-1);
    expect(getVideoTextureHeight(createVideoTexture({ element: null, objectUrl: null, ownsElement: false }))).toBe(-1);
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
    expect(getVideoTextureWidth(createVideoTexture({ element: null, objectUrl: null, ownsElement: false }))).toBe(-1);
  });
});

describe('isVideoTextureFrameReady', () => {
  it('is true only when the element has a decoded frame with known dimensions', () => {
    expect(isVideoTextureFrameReady(createVideoTexture(makeVideoResource(4, 320, 240)))).toBe(true);
    expect(isVideoTextureFrameReady(createVideoTexture(makeVideoResource(1, 320, 240)))).toBe(false);
    expect(isVideoTextureFrameReady(createVideoTexture(makeVideoResource(4, 0, 0)))).toBe(false);
    expect(isVideoTextureFrameReady(createVideoTexture({ element: null, objectUrl: null, ownsElement: false }))).toBe(
      false,
    );
  });
});

describe('resetVideoTextureFrame', () => {
  it('sets the shared revision to the u32 pre-first-frame sentinel', () => {
    const vt = createVideoTexture(makeVideoResource());
    advanceVideoTexture(vt);
    advanceVideoTexture(vt);
    resetVideoTextureFrame(vt);
    expect(vt.version).toBe(0xffffffff);
    expect(getTextureSource(vt)?.version).toBe(0xffffffff);
  });
});

describe('setVideoTextureSource', () => {
  it('swaps the borrowed host handle and resets the version', () => {
    const vt = createVideoTexture(makeVideoResource());
    advanceVideoTexture(vt);
    const next = makeVideoResource(4, 640, 480);
    setVideoTextureSource(vt, next);
    expect((getTextureSource(vt) as Image).source).toBe(next.element);
    expect(vt.version).toBe(0xffffffff);
    expect(getVideoTextureWidth(vt)).toBe(640);
  });
});
