import { compareCaptureFixtureBackgrounds, findCaptureFixtureBackground } from './captureFixtureBackground';

describe('compareCaptureFixtureBackgrounds', () => {
  it('reports a mismatch when the two fixtures declare different colours', () => {
    expect(compareCaptureFixtureBackgrounds('backgroundColor: 0x05060aff', 'backgroundColor: 0x101014ff')).toBe(true);
  });

  it('reports agreement when both declare the same colour in different case', () => {
    expect(compareCaptureFixtureBackgrounds('backgroundColor: 0x05060AFF', 'backgroundColor: 0x05060aff')).toBe(false);
  });

  // ★ NULL IS THE WHOLE POINT OF THIS FUNCTION'S SIGNATURE. An undeclared fixture has not been
  // compared, and returning `false` for it would let the report field read as "checked, and they
  // agree" on a pair nothing established anything about. Both directions are covered because a
  // one-sided implementation passes whichever case it happens to check.
  it('returns null when the first fixture declares nothing', () => {
    expect(compareCaptureFixtureBackgrounds('const x = 1;', 'backgroundColor: 0x101014ff')).toBeNull();
  });

  it('returns null when the second fixture declares nothing', () => {
    expect(compareCaptureFixtureBackgrounds('backgroundColor: 0x101014ff', 'const x = 1;')).toBeNull();
  });

  it('returns null when neither declares anything', () => {
    expect(compareCaptureFixtureBackgrounds('const x = 1;', 'const y = 2;')).toBeNull();
  });
});

describe('findCaptureFixtureBackground', () => {
  it('reads a declared colour and lowercases it', () => {
    expect(findCaptureFixtureBackground('createGlRenderState(canvas, { backgroundColor: 0x05060AFF })')).toBe(
      '0x05060aff',
    );
  });

  it('returns null when no literal declaration is present', () => {
    expect(findCaptureFixtureBackground('createCanvasRenderState(canvas, { pixelRatio })')).toBeNull();
  });

  // The detector reads a LITERAL and nothing else. A colour behind a constant is invisible to it, and
  // that has to stay visible in the tests, because the report field built on it is named for exactly
  // this narrowness — anything broader would be a claim the detector cannot support.
  it('does not follow a colour supplied through a constant', () => {
    expect(findCaptureFixtureBackground('const BACKGROUND = 0x05060aff;\nbackgroundColor: BACKGROUND')).toBeNull();
  });

  it('reads the first declaration when a fixture carries more than one', () => {
    expect(findCaptureFixtureBackground('backgroundColor: 0x111111ff\nbackgroundColor: 0x222222ff')).toBe('0x111111ff');
  });
});
