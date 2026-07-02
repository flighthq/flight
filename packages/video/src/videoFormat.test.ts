import { inferVideoType } from './videoFormat';

describe('inferVideoType', () => {
  it('returns "video/mp4" for .mp4 files', () => {
    expect(inferVideoType('clip.mp4')).toBe('video/mp4');
  });

  it('returns "video/mp4" for .m4v files', () => {
    expect(inferVideoType('clip.m4v')).toBe('video/mp4');
  });

  it('returns "video/webm" for .webm files', () => {
    expect(inferVideoType('clip.webm')).toBe('video/webm');
  });

  it('returns "video/ogg" for .ogv files', () => {
    expect(inferVideoType('clip.ogv')).toBe('video/ogg');
  });

  it('returns "video/ogg" for .ogg files', () => {
    expect(inferVideoType('clip.ogg')).toBe('video/ogg');
  });

  it('returns "video/quicktime" for .mov files', () => {
    expect(inferVideoType('clip.mov')).toBe('video/quicktime');
  });

  it('returns null for unrecognized extensions', () => {
    expect(inferVideoType('clip.avi')).toBeNull();
  });

  it('strips query parameters before matching', () => {
    expect(inferVideoType('clip.mp4?t=0')).toBe('video/mp4');
  });

  it('returns null for a URL with no extension', () => {
    expect(inferVideoType('video')).toBeNull();
  });
});
