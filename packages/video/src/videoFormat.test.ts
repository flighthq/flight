import { canPlayVideoType, detectVideoMimeType, inferVideoMimeType, selectVideoResourceUrl } from './videoFormat';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('canPlayVideoType', () => {
  it('is false in jsdom where no codecs are registered', () => {
    expect(canPlayVideoType('video/mp4')).toBe(false);
  });

  it('is true when the element reports it can play the type', () => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue('probably');
    expect(canPlayVideoType('video/mp4')).toBe(true);
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
    expect(selectVideoResourceUrl([{ url: 'clip.mp4' }])).toBeNull();
  });

  it('returns null for an empty source list', () => {
    expect(selectVideoResourceUrl([])).toBeNull();
  });

  it('picks the first source whose inferred type is playable', () => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockImplementation((type) =>
      type === 'video/webm' ? 'probably' : '',
    );
    const selected = selectVideoResourceUrl([{ url: 'clip.mp4' }, { url: 'clip.webm' }]);
    expect(selected?.url).toBe('clip.webm');
  });

  it('honours an explicit type over the URL extension', () => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockImplementation((type) =>
      type === 'video/mp4' ? 'maybe' : '',
    );
    const selected = selectVideoResourceUrl([{ url: 'stream', type: 'video/mp4' }]);
    expect(selected?.url).toBe('stream');
  });
});
