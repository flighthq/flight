import type { VideoCapabilityBackend, VideoResourceUrl } from '@flighthq/types/contract';

import { canPlayVideoType, detectVideoMimeType, inferVideoMimeType, selectVideoResourceUrl } from './videoFormat';

const falseBackend: VideoCapabilityBackend = { canPlayType: () => false };
const trueBackend: VideoCapabilityBackend = { canPlayType: () => true };

describe('canPlayVideoType', () => {
  it('delegates to the backend', () => {
    expect(canPlayVideoType(trueBackend, 'video/mp4')).toBe(true);
  });

  it('returns false with a non-playing backend', () => {
    expect(canPlayVideoType(falseBackend, 'video/mp4')).toBe(false);
  });

  it('rejects an empty MIME type without invoking the backend', () => {
    const canPlayType = vi.fn(() => true);
    expect(canPlayVideoType({ canPlayType }, '')).toBe(false);
    expect(canPlayType).not.toHaveBeenCalled();
  });

  it('accepts only primitive true from a backend', () => {
    expect(canPlayVideoType({ canPlayType: () => 'probably' } as unknown as VideoCapabilityBackend, 'video/mp4')).toBe(
      false,
    );
  });

  it('normalizes backend exceptions to false', () => {
    const backend: VideoCapabilityBackend = {
      canPlayType(): boolean {
        throw new Error('unavailable');
      },
    };
    expect(canPlayVideoType(backend, 'video/mp4')).toBe(false);
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

describe('selectVideoResourceUrl', () => {
  it('returns null when no source is playable', () => {
    expect(selectVideoResourceUrl(falseBackend, [{ url: 'clip.mp4' }])).toBeNull();
  });

  it('returns null for an empty source list', () => {
    expect(selectVideoResourceUrl(falseBackend, [])).toBeNull();
  });

  it('picks the first source whose inferred type is playable', () => {
    const backend: VideoCapabilityBackend = { canPlayType: (type) => type === 'video/webm' };
    const selected = selectVideoResourceUrl(backend, [{ url: 'clip.mp4' }, { url: 'clip.webm' }]);
    expect(selected?.url).toBe('clip.webm');
  });

  it('honours an explicit type over the URL extension', () => {
    const backend: VideoCapabilityBackend = { canPlayType: (type) => type === 'video/mp4' };
    const selected = selectVideoResourceUrl(backend, [{ url: 'stream', type: 'video/mp4' }]);
    expect(selected?.url).toBe('stream');
  });

  it('treats an explicit empty type as authoritative and does not read the URL', () => {
    const canPlayType = vi.fn(() => true);
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
    expect(selectVideoResourceUrl({ canPlayType }, [source])).toBeNull();
    expect(canPlayType).not.toHaveBeenCalled();
  });

  it('skips unknown inferred types without invoking the backend', () => {
    const canPlayType = vi.fn(() => true);
    expect(selectVideoResourceUrl({ canPlayType }, [{ url: 'clip.avi' }])).toBeNull();
    expect(canPlayType).not.toHaveBeenCalled();
  });

  it('continues after invalid truthy results and backend exceptions', () => {
    const canPlayType = vi
      .fn()
      .mockReturnValueOnce('probably')
      .mockImplementationOnce(() => {
        throw new Error('unavailable');
      })
      .mockReturnValueOnce(true);
    const selected = selectVideoResourceUrl({ canPlayType } as VideoCapabilityBackend, [
      { url: 'first.mp4' },
      { url: 'second.webm' },
      { url: 'third.ogv' },
    ]);
    expect(selected?.url).toBe('third.ogv');
  });

  it('does not swallow caller property-access exceptions', () => {
    const source = Object.defineProperty({ url: 'clip.mp4' }, 'type', {
      get(): string {
        throw new Error('caller getter failed');
      },
    }) as VideoResourceUrl;
    expect(() => selectVideoResourceUrl(trueBackend, [source])).toThrow('caller getter failed');
  });
});
