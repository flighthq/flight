import { resolve } from 'node:path';

import {
  CAPTURE_CLI_BOOLEAN_OPTIONS,
  CAPTURE_CLI_OPTION_GROUPS,
  resolveCaptureCliReportPath,
  validateCaptureCliOptions,
} from './captureCliOptions';

describe('resolveCaptureCliReportPath', () => {
  it('routes a report beneath the requested artifact root and subject', () => {
    expect(resolveCaptureCliReportPath('/repo', 'captures/run-1', 'functional', 'validation-report.json')).toBe(
      resolve('/repo/captures/run-1/functional/validation-report.json'),
    );
  });

  it('leaves the caller on its existing default when no output root was requested', () => {
    expect(resolveCaptureCliReportPath('/repo', undefined, 'functional', 'validation-report.json')).toBeUndefined();
  });
});

describe('validateCaptureCliOptions', () => {
  it("accepts each command's own actual option groups", () => {
    expect(() =>
      validateCaptureCliOptions('observe', [
        'https://example.test/',
        ...CAPTURE_CLI_OPTION_GROUPS.common.map(asArgument),
        ...CAPTURE_CLI_OPTION_GROUPS.observe.map(asArgument),
      ]),
    ).not.toThrow();
    expect(() =>
      validateCaptureCliOptions('capture', [
        ...CAPTURE_CLI_OPTION_GROUPS.common.map(asArgument),
        ...CAPTURE_CLI_OPTION_GROUPS.suite.map(asArgument),
        ...CAPTURE_CLI_OPTION_GROUPS.capture.map(asArgument),
        asArgument('parallel'),
      ]),
    ).not.toThrow();
    expect(() =>
      validateCaptureCliOptions('benchmark', [
        ...CAPTURE_CLI_OPTION_GROUPS.common.map(asArgument),
        ...CAPTURE_CLI_OPTION_GROUPS.suite.map(asArgument),
        ...CAPTURE_CLI_OPTION_GROUPS.benchmark.map(asArgument),
      ]),
    ).not.toThrow();
    expect(() =>
      validateCaptureCliOptions('validate', [
        ...CAPTURE_CLI_OPTION_GROUPS.common.map(asArgument),
        ...CAPTURE_CLI_OPTION_GROUPS.suite.map(asArgument),
        ...CAPTURE_CLI_OPTION_GROUPS.validation.map(asArgument),
      ]),
    ).not.toThrow();
    expect(() =>
      validateCaptureCliOptions('batch', Object.values(CAPTURE_CLI_OPTION_GROUPS).flat().map(asArgument)),
    ).not.toThrow();
  });

  it('rejects argument shapes the readers cannot honor', () => {
    expect(() => validateCaptureCliOptions('capture', ['--verify=true'])).toThrow(
      'option --verify does not take a value',
    );
    expect(() => validateCaptureCliOptions('capture', ['--renderer'])).toThrow('option --renderer requires a value');
    expect(() => validateCaptureCliOptions('capture', ['unconsumed'])).toThrow(
      'unexpected argument for capture: unconsumed',
    );
  });

  it('rejects options another command reads instead of silently ignoring them', () => {
    expect(() => validateCaptureCliOptions('observe', ['--renderer=webgpu'])).toThrow(
      'unknown option for observe: --renderer',
    );
    expect(() => validateCaptureCliOptions('capture', ['--samples=7'])).toThrow(
      'unknown option for capture: --samples',
    );
    expect(() => validateCaptureCliOptions('benchmark', ['--filter-exact=one'])).toThrow(
      'unknown option for benchmark: --filter-exact',
    );
  });

  it('accepts capture-pass options for validate only when fingerprint writing activates that pass', () => {
    const validationOptions = new Set<string>([
      ...CAPTURE_CLI_OPTION_GROUPS.validation,
      ...CAPTURE_CLI_OPTION_GROUPS.parallel,
    ]);
    const captureOnly = [...CAPTURE_CLI_OPTION_GROUPS.capture, ...CAPTURE_CLI_OPTION_GROUPS.parallel].filter(
      (name) => !validationOptions.has(name),
    );
    for (const name of captureOnly) {
      expect(() => validateCaptureCliOptions('validate', [asArgument(name)])).toThrow(
        `validate option --${name} has no consumer in this mode`,
      );
    }
    expect(() =>
      validateCaptureCliOptions('validate', ['--update-fingerprints', ...captureOnly.map(asArgument)]),
    ).not.toThrow();
  });

  it('never recommends a baseline-writing flag for an option this mode cannot consume', () => {
    for (const name of ['fail-on-changed', 'update-baseline']) {
      try {
        validateCaptureCliOptions('validate', [asArgument(name)]);
        expect.unreachable(`--${name} should be refused`);
      } catch (error) {
        expect(String(error)).toContain(`validate option --${name} has no consumer in this mode`);
        expect(String(error)).not.toContain('--update-fingerprints');
        expect(String(error)).not.toContain('requires');
      }
    }
  });
});

function asArgument(name: string): string {
  return CAPTURE_CLI_BOOLEAN_OPTIONS.includes(name as (typeof CAPTURE_CLI_BOOLEAN_OPTIONS)[number])
    ? `--${name}`
    : `--${name}=value`;
}
