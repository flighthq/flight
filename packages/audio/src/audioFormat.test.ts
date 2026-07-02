import { inferAudioType } from './audioFormat';

describe('inferAudioType', () => {
  it('returns "audio/mpeg" for .mp3 files', () => {
    expect(inferAudioType('track.mp3')).toBe('audio/mpeg');
  });

  it('returns "audio/ogg" for .ogg files', () => {
    expect(inferAudioType('track.ogg')).toBe('audio/ogg');
  });

  it('returns "audio/wav" for .wav files', () => {
    expect(inferAudioType('track.wav')).toBe('audio/wav');
  });

  it('returns "audio/aac" for .aac files', () => {
    expect(inferAudioType('track.aac')).toBe('audio/aac');
  });

  it('returns "audio/flac" for .flac files', () => {
    expect(inferAudioType('track.flac')).toBe('audio/flac');
  });

  it('returns "audio/webm" for .webm files', () => {
    expect(inferAudioType('track.webm')).toBe('audio/webm');
  });

  it('returns "audio/mp4" for .m4a files', () => {
    expect(inferAudioType('track.m4a')).toBe('audio/mp4');
  });

  it('returns null for unrecognized extensions', () => {
    expect(inferAudioType('track.mid')).toBeNull();
  });

  it('strips query parameters before matching', () => {
    expect(inferAudioType('track.mp3?cb=1')).toBe('audio/mpeg');
  });

  it('returns null for a URL with no extension', () => {
    expect(inferAudioType('audio')).toBeNull();
  });
});
