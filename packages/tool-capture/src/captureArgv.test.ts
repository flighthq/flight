import { assertKnownCaptureFlags } from './captureArgv';

describe('assertKnownCaptureFlags', () => {
  it('accepts recognized flags in both --key=value and --key value forms', () => {
    expect(() =>
      assertKnownCaptureFlags(['--tool=functional', '--renderer', 'canvas,webgl', '--frames=1', '--fail-on-error']),
    ).not.toThrow();
  });

  it('accepts an empty argument list', () => {
    expect(() => assertKnownCaptureFlags([])).not.toThrow();
  });

  it('rejects an unrecognized flag', () => {
    expect(() => assertKnownCaptureFlags(['--tool=functional', '--scene=swf-import'])).toThrow(
      /Unrecognized flag --scene/,
    );
  });

  it('names the known flags so the caller can find the one they meant', () => {
    expect(() => assertKnownCaptureFlags(['--scene=x'])).toThrow(/filter/);
  });

  it('rejects the first unrecognized flag when several are wrong', () => {
    expect(() => assertKnownCaptureFlags(['--scenes=a', '--renderers=b'])).toThrow(/--scenes/);
  });

  // A near-miss of a real flag is the case this exists for: --renderers silently ran every renderer.
  it('rejects a near-miss of a real flag rather than absorbing it', () => {
    expect(() => assertKnownCaptureFlags(['--renderers=canvas'])).toThrow(/Unrecognized flag --renderers/);
  });

  it('ignores positional values and negative numbers', () => {
    expect(() => assertKnownCaptureFlags(['http://localhost:8080/', '--wait', '-1'])).not.toThrow();
  });

  it('ignores a bare -- argument separator', () => {
    expect(() => assertKnownCaptureFlags(['--', '--filter=node-alpha'])).not.toThrow();
  });
});
