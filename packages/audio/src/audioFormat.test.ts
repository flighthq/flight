import { canPlayAudioType, detectAudioMimeType, inferAudioMimeType } from './audioFormat';

describe('canPlayAudioType', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'audio/mpeg' ? 'probably' : '',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false for the empty string without probing', () => {
    expect(canPlayAudioType('')).toBe(false);
  });

  it('returns true for a type the element reports it can play', () => {
    expect(canPlayAudioType('audio/mpeg')).toBe(true);
  });

  it('returns false for a type the element cannot play', () => {
    expect(canPlayAudioType('audio/x-unknown')).toBe(false);
  });
});

describe('detectAudioMimeType', () => {
  it('returns null for a buffer that is too small', () => {
    expect(detectAudioMimeType(new ArrayBuffer(3))).toBeNull();
  });

  it('returns null for an unrecognised header', () => {
    expect(detectAudioMimeType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it('detects WAV (RIFF....WAVE)', () => {
    const b = new Uint8Array(12);
    b.set([0x52, 0x49, 0x46, 0x46], 0);
    b.set([0x57, 0x41, 0x56, 0x45], 8);
    expect(detectAudioMimeType(b)).toBe('audio/wav');
  });

  it('detects FLAC (fLaC)', () => {
    expect(detectAudioMimeType(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe('audio/flac');
  });

  it('detects Ogg (OggS)', () => {
    expect(detectAudioMimeType(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe('audio/ogg');
  });

  it('detects MP3 via an ID3 tag', () => {
    expect(detectAudioMimeType(new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toBe('audio/mpeg');
  });

  it('detects MP3 via an MPEG frame sync', () => {
    expect(detectAudioMimeType(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe('audio/mpeg');
  });

  it('detects M4A / AAC (ftyp box)', () => {
    const b = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
    expect(detectAudioMimeType(b)).toBe('audio/mp4');
  });

  it('detects WebM (EBML)', () => {
    expect(detectAudioMimeType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe('audio/webm');
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const buf = new ArrayBuffer(4);
    new Uint8Array(buf).set([0x66, 0x4c, 0x61, 0x43]);
    expect(detectAudioMimeType(buf)).toBe('audio/flac');
  });
});

describe('inferAudioMimeType', () => {
  it('returns "audio/mpeg" for .mp3 files', () => {
    expect(inferAudioMimeType('track.mp3')).toBe('audio/mpeg');
  });

  it('returns "audio/ogg" for .ogg files', () => {
    expect(inferAudioMimeType('track.ogg')).toBe('audio/ogg');
  });

  it('returns "audio/wav" for .wav files', () => {
    expect(inferAudioMimeType('track.wav')).toBe('audio/wav');
  });

  it('returns "audio/aac" for .aac files', () => {
    expect(inferAudioMimeType('track.aac')).toBe('audio/aac');
  });

  it('returns "audio/flac" for .flac files', () => {
    expect(inferAudioMimeType('track.flac')).toBe('audio/flac');
  });

  it('returns "audio/webm" for .webm files', () => {
    expect(inferAudioMimeType('track.webm')).toBe('audio/webm');
  });

  it('returns "audio/mp4" for .m4a files', () => {
    expect(inferAudioMimeType('track.m4a')).toBe('audio/mp4');
  });

  it('returns null for unrecognized extensions', () => {
    expect(inferAudioMimeType('track.mid')).toBeNull();
  });

  it('strips query parameters before matching', () => {
    expect(inferAudioMimeType('track.mp3?cb=1')).toBe('audio/mpeg');
  });

  it('returns null for a URL with no extension', () => {
    expect(inferAudioMimeType('audio')).toBeNull();
  });
});
