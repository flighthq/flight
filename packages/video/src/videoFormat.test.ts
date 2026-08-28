import type { VideoCapabilityBackend, VideoResourceUrl } from '@flighthq/types/contract';

import {
  canPlayVideoType,
  detectVideoMimeType,
  explainVideoCapabilityBackend,
  explainVideoCapabilityOperation,
  getVideoCapabilityBackend,
  hasVideoCapabilityHostBackend,
  hasVideoCapabilityOperation,
  inferVideoMimeType,
  installVideoCapabilityHostBackend,
  observeVideoCapabilityHostResult,
  resetVideoCapabilityBackendForTest,
  selectVideoResourceUrl,
  setVideoCapabilityBackend,
} from './videoFormat';

afterEach(() => {
  resetVideoCapabilityBackendForTest();
  vi.restoreAllMocks();
});

describe('canPlayVideoType', () => {
  it('is false when no backend is installed', () => {
    expect(canPlayVideoType('video/mp4')).toBe(false);
  });

  it('uses an installed custom backend', () => {
    setVideoCapabilityBackend({ canPlayType: () => true });
    expect(canPlayVideoType('video/mp4')).toBe(true);
  });

  it('rejects an empty MIME type without invoking the selected backend', () => {
    const canPlayType = vi.fn(() => true);
    setVideoCapabilityBackend({ canPlayType });
    expect(canPlayVideoType('')).toBe(false);
    expect(canPlayType).not.toHaveBeenCalled();
  });

  it('accepts only primitive true from an untyped backend', () => {
    setVideoCapabilityBackend({ canPlayType: () => 'probably' } as unknown as VideoCapabilityBackend);
    expect(canPlayVideoType('video/mp4')).toBe(false);
  });

  it('normalizes backend exceptions to false', () => {
    setVideoCapabilityBackend({
      canPlayType(): boolean {
        throw new Error('unavailable');
      },
    });
    expect(canPlayVideoType('video/mp4')).toBe(false);
  });
});

describe('detectVideoMimeType', () => {
  it('returns null for a buffer that is too small', () => {
    expect(detectVideoMimeType(new ArrayBuffer(2))).toBeNull();
  });

  it('returns null for an unrecognised header', () => {
    expect(detectVideoMimeType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it('detects an mp4 ftyp box', () => {
    const b = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    expect(detectVideoMimeType(b)).toBe('video/mp4');
  });

  it('detects a Matroska/WebM EBML header', () => {
    expect(detectVideoMimeType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe('video/webm');
  });

  it('detects an Ogg stream', () => {
    expect(detectVideoMimeType(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe('video/ogg');
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const buf = new ArrayBuffer(8);
    new Uint8Array(buf).set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    expect(detectVideoMimeType(buf)).toBe('video/mp4');
  });
});

describe('explainVideoCapabilityBackend', () => {
  it('reports host observations while custom selection remains unobserved', () => {
    installVideoCapabilityHostBackend({ canPlayType: () => true });
    observeVideoCapabilityHostResult('canPlayType', false);
    expect(explainVideoCapabilityBackend()).toMatchObject({
      layer: 'host',
      operation: 'canPlayType',
      viability: 'runtime-api-unavailable',
    });
    setVideoCapabilityBackend({ canPlayType: () => true });
    expect(explainVideoCapabilityBackend()).toMatchObject({
      layer: 'custom',
      operation: null,
      viability: 'unobserved',
    });
  });
});

describe('explainVideoCapabilityOperation', () => {
  it('reports sentinel, host, and custom operation support structurally', () => {
    expect(explainVideoCapabilityOperation('canPlayType')).toEqual({
      implemented: false,
      layer: 'sentinel',
      operation: 'canPlayType',
    });
    expect(hasVideoCapabilityOperation('canPlayType')).toBe(false);

    installVideoCapabilityHostBackend({ canPlayType: () => true });
    expect(explainVideoCapabilityOperation('canPlayType').layer).toBe('host');
    expect(hasVideoCapabilityOperation('canPlayType')).toBe(true);

    setVideoCapabilityBackend({ canPlayType: 1 } as unknown as VideoCapabilityBackend);
    expect(explainVideoCapabilityOperation('canPlayType')).toEqual({
      implemented: false,
      layer: 'none',
      operation: 'canPlayType',
    });
    expect(hasVideoCapabilityOperation('canPlayType')).toBe(false);
  });
});

describe('getVideoCapabilityBackend', () => {
  it('uses custom over host and reveals the host again when custom is cleared', () => {
    const host = { canPlayType: vi.fn(() => true) };
    const custom = { canPlayType: vi.fn(() => false) };
    installVideoCapabilityHostBackend(host);
    setVideoCapabilityBackend(custom);
    expect(getVideoCapabilityBackend()).toBe(custom);
    expect(canPlayVideoType('video/mp4')).toBe(false);
    setVideoCapabilityBackend(null);
    expect(getVideoCapabilityBackend()).toBe(host);
    expect(canPlayVideoType('video/mp4')).toBe(true);
  });
});

describe('hasVideoCapabilityHostBackend', () => {
  it('tracks host occupancy independently of a custom backend', () => {
    setVideoCapabilityBackend({ canPlayType: () => true });
    expect(hasVideoCapabilityHostBackend()).toBe(false);
    installVideoCapabilityHostBackend({ canPlayType: () => false });
    expect(hasVideoCapabilityHostBackend()).toBe(true);
  });
});

describe('hasVideoCapabilityOperation', () => {
  it('cannot diverge from the operation explanation', () => {
    expect(hasVideoCapabilityOperation('canPlayType')).toBe(explainVideoCapabilityOperation('canPlayType').implemented);
    setVideoCapabilityBackend({ canPlayType: () => true });
    expect(hasVideoCapabilityOperation('canPlayType')).toBe(explainVideoCapabilityOperation('canPlayType').implemented);
  });
});

describe('inferVideoMimeType', () => {
  it('returns "video/mp4" for .mp4 files', () => {
    expect(inferVideoMimeType('clip.mp4')).toBe('video/mp4');
  });

  it('returns "video/mp4" for .m4v files', () => {
    expect(inferVideoMimeType('clip.m4v')).toBe('video/mp4');
  });

  it('returns "video/webm" for .webm files', () => {
    expect(inferVideoMimeType('clip.webm')).toBe('video/webm');
  });

  it('returns "video/x-matroska" for .mkv files', () => {
    expect(inferVideoMimeType('clip.mkv')).toBe('video/x-matroska');
  });

  it('returns "video/ogg" for .ogv files', () => {
    expect(inferVideoMimeType('clip.ogv')).toBe('video/ogg');
  });

  it('returns "video/ogg" for .ogg files', () => {
    expect(inferVideoMimeType('clip.ogg')).toBe('video/ogg');
  });

  it('returns "video/quicktime" for .mov files', () => {
    expect(inferVideoMimeType('clip.mov')).toBe('video/quicktime');
  });

  it('returns "video/3gpp" for .3gp files', () => {
    expect(inferVideoMimeType('clip.3gp')).toBe('video/3gpp');
  });

  it('returns the HLS playlist type for .m3u8 files', () => {
    expect(inferVideoMimeType('stream.m3u8')).toBe('application/vnd.apple.mpegurl');
  });

  it('returns the DASH manifest type for .mpd files', () => {
    expect(inferVideoMimeType('stream.mpd')).toBe('application/dash+xml');
  });

  it('returns null for unrecognized extensions', () => {
    expect(inferVideoMimeType('clip.avi')).toBeNull();
  });

  it('strips query parameters before matching', () => {
    expect(inferVideoMimeType('clip.mp4?t=0')).toBe('video/mp4');
  });

  it('returns null for a URL with no extension', () => {
    expect(inferVideoMimeType('video')).toBeNull();
  });
});

describe('installVideoCapabilityHostBackend', () => {
  it('keeps the first host and reports only a distinct second host as conflict', () => {
    const first = { canPlayType: vi.fn(() => true) };
    installVideoCapabilityHostBackend(first);
    installVideoCapabilityHostBackend(first);
    expect(explainVideoCapabilityBackend().conflict).toBe(false);
    installVideoCapabilityHostBackend({ canPlayType: () => false });
    expect(getVideoCapabilityBackend()).toBe(first);
    expect(explainVideoCapabilityBackend().conflict).toBe(true);
  });
});

describe('observeVideoCapabilityHostResult', () => {
  it('records successful host viability', () => {
    installVideoCapabilityHostBackend({ canPlayType: () => true });
    observeVideoCapabilityHostResult('canPlayType', true);
    expect(explainVideoCapabilityBackend()).toMatchObject({
      operation: 'canPlayType',
      viability: 'available',
    });
  });
});

describe('resetVideoCapabilityBackendForTest', () => {
  it('reset clears custom, host, conflict, and observation state', () => {
    installVideoCapabilityHostBackend({ canPlayType: () => true });
    installVideoCapabilityHostBackend({ canPlayType: () => false });
    observeVideoCapabilityHostResult('canPlayType', true);
    setVideoCapabilityBackend({ canPlayType: () => true });
    resetVideoCapabilityBackendForTest();
    expect(hasVideoCapabilityHostBackend()).toBe(false);
    expect(explainVideoCapabilityBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
    expect(canPlayVideoType('video/mp4')).toBe(false);
  });
});

describe('selectVideoResourceUrl', () => {
  it('returns null when no source is playable', () => {
    expect(selectVideoResourceUrl([{ url: 'clip.mp4' }])).toBeNull();
  });

  it('returns null for an empty source list', () => {
    expect(selectVideoResourceUrl([])).toBeNull();
  });

  it('picks the first source whose inferred type is playable', () => {
    setVideoCapabilityBackend({ canPlayType: (type) => type === 'video/webm' });
    const selected = selectVideoResourceUrl([{ url: 'clip.mp4' }, { url: 'clip.webm' }]);
    expect(selected?.url).toBe('clip.webm');
  });

  it('honours an explicit type over the URL extension', () => {
    setVideoCapabilityBackend({ canPlayType: (type) => type === 'video/mp4' });
    const selected = selectVideoResourceUrl([{ url: 'stream', type: 'video/mp4' }]);
    expect(selected?.url).toBe('stream');
  });

  it('treats an explicit empty type as authoritative and does not read the URL', () => {
    const canPlayType = vi.fn(() => true);
    setVideoCapabilityBackend({ canPlayType });
    const source = Object.defineProperties(
      {},
      {
        type: { value: '', enumerable: true },
        url: {
          enumerable: true,
          get(): string {
            throw new Error('URL must remain unread');
          },
        },
      },
    ) as VideoResourceUrl;
    expect(selectVideoResourceUrl([source])).toBeNull();
    expect(canPlayType).not.toHaveBeenCalled();
  });

  it('skips unknown inferred types without invoking the backend', () => {
    const canPlayType = vi.fn(() => true);
    setVideoCapabilityBackend({ canPlayType });
    expect(selectVideoResourceUrl([{ url: 'clip.avi' }])).toBeNull();
    expect(canPlayType).not.toHaveBeenCalled();
  });

  it('pins one lazily resolved backend across a reentrant custom-backend change', () => {
    const replacement = { canPlayType: vi.fn(() => false) };
    const initial = {
      canPlayType: vi.fn((type: string) => {
        setVideoCapabilityBackend(replacement);
        return type === 'video/webm';
      }),
    };
    setVideoCapabilityBackend(initial);
    expect(selectVideoResourceUrl([{ url: 'clip.mp4' }, { url: 'clip.webm' }])?.url).toBe('clip.webm');
    expect(initial.canPlayType).toHaveBeenCalledTimes(2);
    expect(replacement.canPlayType).not.toHaveBeenCalled();
  });

  it('continues after invalid truthy results and backend exceptions', () => {
    const canPlayType = vi
      .fn()
      .mockReturnValueOnce('probably')
      .mockImplementationOnce(() => {
        throw new Error('unavailable');
      })
      .mockReturnValueOnce(true);
    setVideoCapabilityBackend({ canPlayType } as VideoCapabilityBackend);
    const selected = selectVideoResourceUrl([{ url: 'first.mp4' }, { url: 'second.webm' }, { url: 'third.ogv' }]);
    expect(selected?.url).toBe('third.ogv');
  });

  it('does not swallow caller property-access exceptions', () => {
    const source = Object.defineProperty({ url: 'clip.mp4' }, 'type', {
      get(): string {
        throw new Error('caller getter failed');
      },
    }) as VideoResourceUrl;
    expect(() => selectVideoResourceUrl([source])).toThrow('caller getter failed');
  });
});

describe('setVideoCapabilityBackend', () => {
  it('selects and clears a custom backend', () => {
    const custom = { canPlayType: () => true };
    setVideoCapabilityBackend(custom);
    expect(getVideoCapabilityBackend()).toBe(custom);
    setVideoCapabilityBackend(null);
    expect(getVideoCapabilityBackend()).not.toBe(custom);
  });
});
