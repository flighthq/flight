import { readRepeatedCliOption, selectCaptureEvidenceTargets } from './capture-evidence-selection';

describe('readRepeatedCliOption', () => {
  it('reads repeated split and equals forms', () => {
    expect(
      readRepeatedCliOption(
        ['--update', '--target', 'functional/material-depth/webgl', '--target=functional/shape/webgpu'],
        'target',
      ),
    ).toEqual(['functional/material-depth/webgl', 'functional/shape/webgpu']);
  });

  it('refuses a missing value', () => {
    expect(() => readRepeatedCliOption(['--target', '--update'], 'target')).toThrow(/requires a value/);
  });
});

describe('selectCaptureEvidenceTargets', () => {
  const observed = {
    functional: {
      'material-depth-orthographic/webgl': ['fingerprint'] as const,
      'material-depth/webgl': ['fingerprint', 'oracle'] as const,
    },
  };

  it('selects only the exact identity named, never its longer neighbour', () => {
    expect(selectCaptureEvidenceTargets(['functional/material-depth/webgl'], observed, {})).toEqual({
      functional: {
        covered: { 'material-depth/webgl': ['fingerprint', 'oracle'] },
        determined: ['material-depth/webgl'],
      },
    });
  });

  it('deduplicates repeated exact targets', () => {
    expect(
      selectCaptureEvidenceTargets(['functional/material-depth/webgl', 'functional/material-depth/webgl'], observed, {})
        .functional?.determined,
    ).toEqual(['material-depth/webgl']);
  });

  it('allows a pinned target with no currently observed evidence so its deliberate retirement is representable', () => {
    expect(
      selectCaptureEvidenceTargets(['functional/retired/webgl'], observed, {
        functional: { 'retired/webgl': ['fingerprint'] },
      }),
    ).toEqual({ functional: { covered: {}, determined: ['retired/webgl'] } });
  });

  it('refuses an unknown target rather than widening or silently doing nothing', () => {
    expect(() => selectCaptureEvidenceTargets(['functional/material/webgl'], observed, {})).toThrow(
      /Unknown capture evidence target/,
    );
  });
});
